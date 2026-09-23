import { getDb } from './db';
import { CLAIMS_QA_RUBRIC, CLAIMS_QA_RUBRIC_VERSION } from './claimsQaRubricData';

export type ClaimsQaResultValue = 'pending' | 'met' | 'not_met' | 'not_applicable' | 'not_determinable';
export type ClaimsQaOutcome = 'upheld' | 'overturned_handling_correct' | 'overturned_rubric_defect';

export type ClaimsQaViewer = {
  userId: number;
  name: string;
  email?: string | null;
  isLeadership: boolean;
  handlerId?: number | null;
};

export const CLAIMS_QA_SOURCE = 'Claims QA authoritative specification';

function dbClient() {
  return getDb().then((db) => {
    if (!db) throw new Error('Database not available');
    return (db as any).$client.promise() as {
      query: (sql: string, params?: unknown[]) => Promise<[any[], any]>;
    };
  });
}

function isoDate(value?: string | Date | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function ratingFor(input: { scored: number; met: number; criticalFailures: number }): { passRate: number | null; rating: string } {
  if (input.criticalFailures > 0) {
    return { passRate: input.scored > 0 ? Math.round((input.met / input.scored) * 100) : null, rating: 'critical_miss' };
  }
  if (input.scored < 15) return { passRate: null, rating: 'small_sample' };
  const passRate = Math.round((input.met / input.scored) * 100);
  if (passRate >= 90) return { passRate, rating: 'strong' };
  if (passRate >= 80) return { passRate, rating: 'solid' };
  return { passRate, rating: 'needs_work' };
}

function requiresHumanConfirmation(item: { critical?: boolean; gradingMethod?: string }) {
  return Boolean(item.critical) && /human/i.test(item.gradingMethod ?? '');
}

function resultRequiresEvidence(result: ClaimsQaResultValue) {
  return result === 'met' || result === 'not_met';
}

export function effectiveResult(result: { result: ClaimsQaResultValue; adjudication_outcome?: ClaimsQaOutcome | null }): ClaimsQaResultValue {
  if (result.adjudication_outcome === 'overturned_handling_correct') return 'met';
  if (result.adjudication_outcome === 'overturned_rubric_defect') return 'not_determinable';
  return result.result as ClaimsQaResultValue;
}

function assertScoreEvidence(input: { result: ClaimsQaResultValue; evidence?: string | null; evidenceLocator?: string | null; auditorNote?: string | null }) {
  if (resultRequiresEvidence(input.result) && !(input.evidence?.trim() || input.evidenceLocator?.trim())) {
    throw new Error('A Met or Not met result requires evidence or a source locator.');
  }
  if ((input.result === 'not_applicable' || input.result === 'not_determinable') && !(input.auditorNote?.trim() || input.evidence?.trim())) {
    throw new Error('An N/A or Not determinable result requires an explanation.');
  }
}

async function getEvaluationRow(evaluationId: number) {
  const client = await dbClient();
  const [rows] = await client.query('SELECT * FROM claims_qa_evaluations WHERE id = ? LIMIT 1', [evaluationId]);
  const evaluation = (rows as any[])[0];
  if (!evaluation) throw new Error('Evaluation not found');
  return evaluation;
}

export async function assertEvaluationAccess(viewer: ClaimsQaViewer, evaluationId: number, options?: { leadershipOnly?: boolean }) {
  const evaluation = await getEvaluationRow(evaluationId);
  if (options?.leadershipOnly && !viewer.isLeadership) throw new Error('Leadership access is required.');
  if (!canViewClaimsQaEvaluation(viewer, evaluation)) throw new Error('This evaluation is not available to the current handler.');
  return evaluation;
}

export function canViewClaimsQaEvaluation(viewer: ClaimsQaViewer, evaluation: { handler_id: number; status: string }) {
  if (viewer.isLeadership) return true;
  return Boolean(viewer.handlerId) && viewer.handlerId === evaluation.handler_id && evaluation.status !== 'not_released';
}

export async function seedClaimsQaRubric() {
  const client = await dbClient();
  const [versions] = await client.query('SELECT id FROM claims_qa_rubric_versions WHERE version = ? LIMIT 1', [CLAIMS_QA_RUBRIC_VERSION]);
  let versionId = (versions as any[])[0]?.id as number | undefined;
  if (!versionId) {
    const [insert] = await client.query(
      'INSERT INTO claims_qa_rubric_versions (`version`, source, status, notes, created_by, published_at) VALUES (?, ?, \'published\', ?, \'Claims QA migration\', NOW())',
      [CLAIMS_QA_RUBRIC_VERSION, CLAIMS_QA_SOURCE, 'Imported exactly from the approved Claims QA specification.'],
    );
    versionId = (insert as any).insertId;
  }

  for (const item of CLAIMS_QA_RUBRIC) {
    await client.query(
      `INSERT INTO claims_qa_rubric_items
       (rubric_version_id, item_key, role, category, check_text, passing_standard, where_to_find, grading_method, critical, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role=VALUES(role), category=VALUES(category), check_text=VALUES(check_text),
         passing_standard=VALUES(passing_standard), where_to_find=VALUES(where_to_find), grading_method=VALUES(grading_method),
         critical=VALUES(critical), active=VALUES(active), updated_at=NOW()`,
      [versionId, item.itemKey, item.role, item.category, item.checkText, item.passingStandard, item.whereToFind, item.gradingMethod, item.critical, item.active],
    );
  }
  return { versionId, items: CLAIMS_QA_RUBRIC.length };
}

export async function migrateLegacyWeeklyQa() {
  const client = await dbClient();
  const [legacyRows] = await client.query(
    `SELECT q.*, h.email AS handler_email
       FROM qa_scorecards q
       LEFT JOIN handlers h ON h.id = q.handlerId
       ORDER BY q.id ASC`,
  );
  let migrated = 0;
  let skipped = 0;
  for (const scorecard of legacyRows as any[]) {
    const [existing] = await client.query('SELECT id FROM claims_qa_evaluations WHERE source_legacy_scorecard_id = ? LIMIT 1', [scorecard.id]);
    if ((existing as any[]).length) {
      // These are historical scorecards that were already visible before the
      // migration. Preserve that visibility without creating a new automatic
      // publication, while leaving future Claims QA evaluations manual-only.
      await client.query(
        `UPDATE claims_qa_evaluations
            SET status='released', released_at=COALESCE(released_at, created_at),
                released_by_name=COALESCE(released_by_name, 'Legacy Weekly QA migration'), updated_at=NOW()
          WHERE source_legacy_scorecard_id=? AND role='Call Quality' AND status='not_released'`,
        [scorecard.id],
      );
      skipped++;
      continue;
    }
    const payload = {
      source: 'legacy_weekly_qa_scorecard',
      scorecardId: scorecard.id,
      dimensions: {
        greeting: scorecard.greetingScore,
        holdManagement: scorecard.holdManagementScore,
        resolution: scorecard.resolutionScore,
        empathy: scorecard.empathyScore,
        callControl: scorecard.callControlScore,
        overall: scorecard.overallScore,
      },
      strengths: scorecard.strengths,
      improvements: scorecard.improvements,
      managerComments: scorecard.managerComments,
      submittedBy: scorecard.submittedBy,
      createdAt: scorecard.createdAt,
      updatedAt: scorecard.updatedAt,
    };
    const periodStart = isoDate(scorecard.weekOf);
    const periodEnd = periodStart ? new Date(periodStart.getTime() + 6 * 86_400_000) : null;
    await client.query(
      `INSERT INTO claims_qa_evaluations
       (evaluation_key, source_legacy_scorecard_id, role, period_start, period_end, audit_date, handler_id, handler_name, handler_email,
        auditor_name, status, original_rating, auditor_summary, areas_for_improvement, legacy_payload, released_at, released_by_name, created_at, updated_at)
       VALUES (?, ?, 'Call Quality', ?, ?, ?, ?, ?, ?, ?, 'released', 'legacy_call_qa', ?, ?, ?, ?, ?, 'Legacy Weekly QA migration', ?, ?)`,
      [
        `legacy-weekly-qa-${scorecard.id}`,
        scorecard.id,
        periodStart,
        periodEnd,
        scorecard.createdAt ?? new Date(),
        scorecard.handlerId,
        scorecard.handlerName,
        scorecard.handler_email ?? null,
        scorecard.submittedBy ?? 'Legacy Weekly QA',
        scorecard.strengths ?? null,
        scorecard.improvements ?? null,
        JSON.stringify(payload),
        scorecard.createdAt ?? new Date(),
        scorecard.createdAt ?? new Date(),
        scorecard.updatedAt ?? new Date(),
      ],
    );
    migrated++;
  }
  return { sourceScorecards: (legacyRows as any[]).length, migrated, skipped, unavailableClaimAudits: true };
}

export async function bootstrapClaimsQa() {
  const rubric = await seedClaimsQaRubric();
  const legacy = await migrateLegacyWeeklyQa();
  return { rubric, legacy };
}

export async function getClaimsQaRubric(role?: string) {
  const client = await dbClient();
  const [versions] = await client.query('SELECT * FROM claims_qa_rubric_versions WHERE version = ? LIMIT 1', [CLAIMS_QA_RUBRIC_VERSION]);
  const version = (versions as any[])[0] ?? null;
  const [items] = await client.query(
    `SELECT * FROM claims_qa_rubric_items
     WHERE rubric_version_id = ? ${role ? 'AND role = ?' : ''}
     ORDER BY role ASC, category ASC, item_key ASC`,
    role ? [version?.id ?? 0, role] : [version?.id ?? 0],
  );
  return { version, items };
}

async function getRubricItem(client: Awaited<ReturnType<typeof dbClient>>, input: { rubricItemId?: number; itemKey?: string }) {
  const where = input.rubricItemId ? 'id = ?' : 'item_key = ? AND rubric_version_id = (SELECT id FROM claims_qa_rubric_versions WHERE version = ? LIMIT 1)';
  const params = input.rubricItemId ? [input.rubricItemId] : [input.itemKey, CLAIMS_QA_RUBRIC_VERSION];
  const [rows] = await client.query(`SELECT * FROM claims_qa_rubric_items WHERE ${where} LIMIT 1`, params);
  const item = (rows as any[])[0];
  if (!item) throw new Error('Rubric item not found');
  return item;
}

export async function createClaimsQaDraft(input: {
  viewer: ClaimsQaViewer;
  handlerId: number;
  handlerName: string;
  role: string;
  claimNumber?: string | null;
  exposureId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  auditorSummary?: string | null;
  areasForImprovement?: string | null;
}) {
  if (!input.viewer.isLeadership) throw new Error('Leadership access is required.');
  const client = await dbClient();
  const [handlerRows] = await client.query('SELECT id, name, email FROM handlers WHERE id = ? LIMIT 1', [input.handlerId]);
  const handler = (handlerRows as any[])[0];
  if (!handler) throw new Error('Handler profile not found.');
  const [items] = await client.query(
    `SELECT * FROM claims_qa_rubric_items
     WHERE role = ? AND active = TRUE AND rubric_version_id = (SELECT id FROM claims_qa_rubric_versions WHERE version = ? LIMIT 1)
     ORDER BY category ASC, item_key ASC`,
    [input.role, CLAIMS_QA_RUBRIC_VERSION],
  );
  if (!(items as any[]).length) throw new Error('No active rubric items are available for the selected role.');
  const evaluationKey = `claims-qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [insert] = await client.query(
    `INSERT INTO claims_qa_evaluations
     (evaluation_key, claim_number, exposure_id, role, period_start, period_end, handler_id, handler_name, handler_email,
      auditor_user_id, auditor_name, status, original_rating, auditor_summary, areas_for_improvement)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_released', 'small_sample', ?, ?)`,
    [evaluationKey, input.claimNumber ?? null, input.exposureId ?? null, input.role, isoDate(input.periodStart), isoDate(input.periodEnd), handler.id, handler.name, handler.email ?? null, input.viewer.userId, input.viewer.name, input.auditorSummary ?? null, input.areasForImprovement ?? null],
  );
  const evaluationId = (insert as any).insertId as number;
  for (const item of items as any[]) {
    await client.query(
      `INSERT INTO claims_qa_evaluation_results
       (evaluation_id, rubric_item_id, item_key, category, check_text, passing_standard, where_to_find, grading_method, critical, requires_human_confirmation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [evaluationId, item.id, item.item_key, item.category, item.check_text, item.passing_standard, item.where_to_find, item.grading_method, item.critical, requiresHumanConfirmation({ critical: item.critical, gradingMethod: item.grading_method })],
    );
  }
  return { evaluationId, evaluationKey, resultCount: (items as any[]).length };
}

export async function updateClaimsQaDraftResult(input: {
  viewer: ClaimsQaViewer;
  evaluationId: number;
  resultId: number;
  result: ClaimsQaResultValue;
  evidence?: string | null;
  evidenceLocator?: string | null;
  auditorNote?: string | null;
  humanConfirmed?: boolean;
}) {
  if (!input.viewer.isLeadership) throw new Error('Leadership access is required.');
  const evaluation = await getEvaluationRow(input.evaluationId);
  if (evaluation.status !== 'not_released') throw new Error('Released evaluations are immutable; use adjudication instead.');
  assertScoreEvidence(input);
  const client = await dbClient();
  const [rows] = await client.query('SELECT * FROM claims_qa_evaluation_results WHERE id = ? AND evaluation_id = ? LIMIT 1', [input.resultId, input.evaluationId]);
  const item = (rows as any[])[0];
  if (!item) throw new Error('Evaluation line not found');
  const canConfirm = input.humanConfirmed === true && Boolean(item.requires_human_confirmation);
  await client.query(
    `UPDATE claims_qa_evaluation_results SET result=?, evidence=?, evidence_locator=?, auditor_note=?,
       human_confirmed_at=?, human_confirmed_by_user_id=?, human_confirmed_by_name=?, updated_at=NOW()
     WHERE id=? AND evaluation_id=?`,
    [input.result, input.evidence ?? null, input.evidenceLocator ?? null, input.auditorNote ?? null,
      canConfirm ? new Date() : item.human_confirmed_at, canConfirm ? input.viewer.userId : item.human_confirmed_by_user_id,
      canConfirm ? input.viewer.name : item.human_confirmed_by_name, input.resultId, input.evaluationId],
  );
  return recomputeEvaluation(input.evaluationId);
}

export async function recomputeEvaluation(evaluationId: number) {
  const client = await dbClient();
  const [rows] = await client.query('SELECT * FROM claims_qa_evaluation_results WHERE evaluation_id = ?', [evaluationId]);
  const results = rows as any[];
  const original = aggregateResults(results, false);
  const review = aggregateResults(results, true);
  await client.query(
    `UPDATE claims_qa_evaluations SET original_items_scored=?, original_items_met=?, original_not_applicable=?, original_not_determinable=?,
       original_critical_failures=?, original_pass_rate=?, original_rating=?, review_items_scored=?, review_items_met=?, review_critical_failures=?,
       pass_rate_after_review=?, rating_after_review=?, updated_at=NOW() WHERE id=?`,
    [original.scored, original.met, original.notApplicable, original.notDeterminable, original.criticalFailures, original.ratingInfo.passRate, original.ratingInfo.rating,
      review.scored, review.met, review.criticalFailures, review.ratingInfo.passRate, review.ratingInfo.rating, evaluationId],
  );
  return { original, review };
}

function aggregateResults(results: any[], reviewed: boolean) {
  const values = results.map((row) => reviewed ? effectiveResult(row) : (row.result as ClaimsQaResultValue));
  const scored = values.filter((value) => value === 'met' || value === 'not_met').length;
  const met = values.filter((value) => value === 'met').length;
  const notApplicable = values.filter((value) => value === 'not_applicable').length;
  const notDeterminable = values.filter((value) => value === 'not_determinable').length;
  const criticalFailures = results.filter((row, index) => Boolean(row.critical) && values[index] === 'not_met').length;
  return { scored, met, notApplicable, notDeterminable, criticalFailures, ratingInfo: ratingFor({ scored, met, criticalFailures }) };
}

export async function releaseClaimsQaEvaluation(viewer: ClaimsQaViewer, evaluationId: number) {
  if (!viewer.isLeadership) throw new Error('Leadership access is required.');
  const evaluation = await getEvaluationRow(evaluationId);
  if (evaluation.status !== 'not_released') throw new Error('Only unreleased drafts can be released.');
  const client = await dbClient();
  const [results] = await client.query('SELECT * FROM claims_qa_evaluation_results WHERE evaluation_id = ?', [evaluationId]);
  const rows = results as any[];
  if (!rows.length) throw new Error('An evaluation requires result lines before release.');
  const unresolved = rows.filter((row) => row.result === 'pending');
  if (unresolved.length) throw new Error('Every evaluation line must be resolved before release.');
  const unconfirmedCritical = rows.filter((row) => row.requires_human_confirmation && !row.human_confirmed_at);
  if (unconfirmedCritical.length) throw new Error('Critical machine-judged lines require human confirmation before release.');
  await recomputeEvaluation(evaluationId);
  await client.query(
    `UPDATE claims_qa_evaluations SET status='released', released_at=NOW(), released_by_user_id=?, released_by_name=?, updated_at=NOW() WHERE id=?`,
    [viewer.userId, viewer.name, evaluationId],
  );
  return { released: true };
}

export async function listClaimsQaEvaluations(viewer: ClaimsQaViewer, filters?: { role?: string; status?: string; handlerId?: number; limit?: number }) {
  const client = await dbClient();
  const where: string[] = [];
  const params: unknown[] = [];
  const requestedRole = filters?.role;
  if (requestedRole === 'Call Quality') {
    // Call Tracking is the only consumer that explicitly requests the preserved
    // legacy call-quality records. Every normal Claims QA query is claim-only.
    where.push("role = 'Call Quality'");
  } else {
    where.push("role <> 'Call Quality'");
    if (requestedRole && requestedRole !== 'all') {
      where.push('role = ?');
      params.push(requestedRole);
    }
  }
  if (!viewer.isLeadership) {
    if (!viewer.handlerId) return [];
    where.push('handler_id = ?', `status <> 'not_released'`);
    params.push(viewer.handlerId);
  } else if (filters?.handlerId) {
    where.push('handler_id = ?'); params.push(filters.handlerId);
  }
  if (filters?.status && filters.status !== 'all') { where.push('status = ?'); params.push(filters.status); }
  const [rows] = await client.query(
    `SELECT * FROM claims_qa_evaluations ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY audit_date DESC, id DESC LIMIT ?`,
    [...params, Math.min(Math.max(filters?.limit ?? 100, 1), 500)],
  );
  return rows as any[];
}

export async function getClaimsQaEvaluationDetail(viewer: ClaimsQaViewer, evaluationId: number, options?: { allowLegacyCallQuality?: boolean }) {
  const evaluation = await assertEvaluationAccess(viewer, evaluationId);
  if (evaluation.role === 'Call Quality' && !options?.allowLegacyCallQuality) {
    throw new Error('Call Quality records are available only in Call Tracking.');
  }
  const client = await dbClient();
  const [results] = await client.query('SELECT * FROM claims_qa_evaluation_results WHERE evaluation_id = ? ORDER BY category ASC, item_key ASC', [evaluationId]);
  const messageWhere = viewer.isLeadership ? '' : " AND visibility = 'handler'";
  const [messages] = await client.query(`SELECT * FROM claims_qa_messages WHERE evaluation_id = ?${messageWhere} ORDER BY created_at ASC`, [evaluationId]);
  const [calibrations] = await client.query('SELECT * FROM claims_qa_calibrations WHERE evaluation_id = ? ORDER BY created_at DESC', [evaluationId]);
  return { evaluation, results: results as any[], messages: messages as any[], calibrations: calibrations as any[] };
}

export async function respondToClaimsQaResult(input: { viewer: ClaimsQaViewer; evaluationId: number; resultId: number; response: 'agree' | 'disagree'; comment?: string | null }) {
  const evaluation = await assertEvaluationAccess(input.viewer, input.evaluationId);
  if (!['released', 'responded', 'in_adjudication'].includes(evaluation.status)) throw new Error('The evaluation is not open for response.');
  if (input.response === 'disagree' && !input.comment?.trim()) throw new Error('A disagreement requires a comment.');
  const client = await dbClient();
  const [update] = await client.query(
    `UPDATE claims_qa_evaluation_results SET handler_response=?, handler_response_comment=?, responded_at=NOW(), updated_at=NOW()
     WHERE id=? AND evaluation_id=?`,
    [input.response, input.comment?.trim() || null, input.resultId, input.evaluationId],
  );
  if (!(update as any).affectedRows) throw new Error('Evaluation line not found.');
  return { saved: true };
}

export async function signOffClaimsQaEvaluation(input: { viewer: ClaimsQaViewer; evaluationId: number; overallResponse: string }) {
  const evaluation = await assertEvaluationAccess(input.viewer, input.evaluationId);
  if (!['released', 'responded', 'in_adjudication'].includes(evaluation.status)) throw new Error('The evaluation is not available for sign-off.');
  if (!input.overallResponse.trim()) throw new Error('An overall response is required for sign-off.');
  const client = await dbClient();
  const [results] = await client.query("SELECT result, handler_response FROM claims_qa_evaluation_results WHERE evaluation_id = ? AND result <> 'pending'", [input.evaluationId]);
  const missingResponse = (results as any[]).filter((row) => !row.handler_response);
  if (missingResponse.length) throw new Error('Respond to each scored line before signing off.');
  const disputed = (results as any[]).some((row) => row.handler_response === 'disagree');
  await client.query(
    `UPDATE claims_qa_evaluations SET status=?, handler_overall_response=?, handler_signed_off_at=NOW(), updated_at=NOW() WHERE id=?`,
    [disputed ? 'in_adjudication' : 'responded', input.overallResponse.trim(), input.evaluationId],
  );
  return { status: disputed ? 'in_adjudication' : 'responded' };
}

function canAdjudicate(viewer: ClaimsQaViewer, evaluation: any) {
  if (!viewer.isLeadership) return false;
  if (evaluation.auditor_user_id && evaluation.auditor_user_id === viewer.userId) return false;
  const viewerName = viewer.name.toLowerCase();
  const handlerName = String(evaluation.handler_name ?? '').toLowerCase();
  if (viewerName.includes('demily') && handlerName.includes('demily')) return false;
  return true;
}

export async function listClaimsQaDisputes(viewer: ClaimsQaViewer) {
  if (!viewer.isLeadership) throw new Error('Leadership access is required.');
  const client = await dbClient();
  const [rows] = await client.query(
    `SELECT r.*, e.handler_name, e.role, e.claim_number, e.auditor_name, e.status AS evaluation_status
       FROM claims_qa_evaluation_results r
       JOIN claims_qa_evaluations e ON e.id = r.evaluation_id
      WHERE r.handler_response='disagree' AND r.adjudication_outcome IS NULL
      ORDER BY r.responded_at ASC`,
  );
  return (rows as any[]).filter((row) => canAdjudicate(viewer, row));
}

export async function adjudicateClaimsQaResult(input: { viewer: ClaimsQaViewer; evaluationId: number; resultId: number; outcome: ClaimsQaOutcome; note: string }) {
  if (!input.viewer.isLeadership) throw new Error('Leadership access is required.');
  if (!input.note.trim()) throw new Error('An adjudication note is required.');
  const evaluation = await getEvaluationRow(input.evaluationId);
  if (!canAdjudicate(input.viewer, evaluation)) throw new Error('An auditor cannot adjudicate their own evaluation.');
  const client = await dbClient();
  const [resultRows] = await client.query('SELECT * FROM claims_qa_evaluation_results WHERE id=? AND evaluation_id=? LIMIT 1', [input.resultId, input.evaluationId]);
  const result = (resultRows as any[])[0];
  if (!result || result.handler_response !== 'disagree') throw new Error('Only a disputed evaluation line can be adjudicated.');
  await client.query(
    `UPDATE claims_qa_evaluation_results SET adjudication_outcome=?, adjudication_note=?, adjudicated_at=NOW(), adjudicated_by_user_id=?, adjudicated_by_name=?, updated_at=NOW()
     WHERE id=? AND evaluation_id=?`,
    [input.outcome, input.note.trim(), input.viewer.userId, input.viewer.name, input.resultId, input.evaluationId],
  );
  if (input.outcome === 'overturned_rubric_defect' && result.rubric_item_id) {
    const [countRows] = await client.query(
      `SELECT COUNT(*) AS count FROM claims_qa_evaluation_results WHERE rubric_item_id=? AND adjudication_outcome='overturned_rubric_defect'`,
      [result.rubric_item_id],
    );
    if (Number((countRows as any[])[0]?.count ?? 0) > 2) {
      await client.query('UPDATE claims_qa_rubric_items SET rewrite_flagged_at=COALESCE(rewrite_flagged_at, NOW()) WHERE id=?', [result.rubric_item_id]);
    }
  }
  const [pendingRows] = await client.query(
    `SELECT COUNT(*) AS count FROM claims_qa_evaluation_results WHERE evaluation_id=? AND handler_response='disagree' AND adjudication_outcome IS NULL`,
    [input.evaluationId],
  );
  const allAdjudicated = Number((pendingRows as any[])[0]?.count ?? 0) === 0;
  await recomputeEvaluation(input.evaluationId);
  if (allAdjudicated) {
    await client.query(`UPDATE claims_qa_evaluations SET status='closed', closed_at=NOW(), closed_by_user_id=?, updated_at=NOW() WHERE id=?`, [input.viewer.userId, input.evaluationId]);
  }
  return { closed: allAdjudicated };
}

export async function addClaimsQaMessage(input: { viewer: ClaimsQaViewer; evaluationId: number; body: string; visibility?: 'handler' | 'leadership' }) {
  const evaluation = await assertEvaluationAccess(input.viewer, input.evaluationId);
  if (!input.body.trim()) throw new Error('A message cannot be blank.');
  if (!input.viewer.isLeadership && input.visibility === 'leadership') throw new Error('Handlers cannot send a leadership-only message.');
  const client = await dbClient();
  const [insert] = await client.query(
    'INSERT INTO claims_qa_messages (evaluation_id, author_user_id, author_handler_id, author_name, body, visibility) VALUES (?, ?, ?, ?, ?, ?)',
    [input.evaluationId, input.viewer.userId, input.viewer.handlerId ?? null, input.viewer.name, input.body.trim(), input.visibility ?? 'handler'],
  );
  return { id: (insert as any).insertId, evaluationId: evaluation.id };
}

export async function createClaimsQaCalibration(viewer: ClaimsQaViewer, evaluationId: number) {
  if (!viewer.isLeadership) throw new Error('Leadership access is required.');
  await assertEvaluationAccess(viewer, evaluationId, { leadershipOnly: true });
  const client = await dbClient();
  const [existing] = await client.query("SELECT id FROM claims_qa_calibrations WHERE evaluation_id=? AND status='open' LIMIT 1", [evaluationId]);
  if ((existing as any[])[0]) return { id: (existing as any[])[0].id, existing: true };
  const [insert] = await client.query('INSERT INTO claims_qa_calibrations (evaluation_id, created_by_user_id, created_by_name) VALUES (?, ?, ?)', [evaluationId, viewer.userId, viewer.name]);
  return { id: (insert as any).insertId, existing: false };
}

export async function submitClaimsQaCalibration(input: { viewer: ClaimsQaViewer; calibrationId: number; scores: Array<{ evaluationResultId: number; result: Exclude<ClaimsQaResultValue, 'pending'>; evidence?: string | null }> }) {
  if (!input.viewer.isLeadership) throw new Error('Leadership access is required.');
  if (!input.scores.length) throw new Error('At least one calibration score is required.');
  const client = await dbClient();
  const [calibrationRows] = await client.query('SELECT * FROM claims_qa_calibrations WHERE id=? LIMIT 1', [input.calibrationId]);
  const calibration = (calibrationRows as any[])[0];
  if (!calibration || calibration.status !== 'open') throw new Error('Calibration is not open.');
  for (const score of input.scores) {
    await client.query(
      `INSERT INTO claims_qa_calibration_scores (calibration_id, evaluation_result_id, reviewer_user_id, reviewer_name, result, evidence)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE result=VALUES(result), evidence=VALUES(evidence), submitted_at=NOW()`,
      [input.calibrationId, score.evaluationResultId, input.viewer.userId, input.viewer.name, score.result, score.evidence ?? null],
    );
  }
  const [reviewers] = await client.query('SELECT COUNT(DISTINCT reviewer_user_id) AS count FROM claims_qa_calibration_scores WHERE calibration_id=?', [input.calibrationId]);
  const completed = Number((reviewers as any[])[0]?.count ?? 0) >= 2;
  if (completed) await client.query("UPDATE claims_qa_calibrations SET status='complete', completed_at=NOW() WHERE id=?", [input.calibrationId]);
  return { completed };
}

function claimsQaPeriod(evaluation: any) {
  const raw = evaluation.period_start ?? evaluation.audit_date;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return { key: 'unscheduled', label: 'Unscheduled' };
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date),
  };
}

function percentage(met: number, scored: number) {
  return scored >= 15 ? Math.round((met / scored) * 100) : null;
}

export async function getClaimsQaOverview(viewer: ClaimsQaViewer, filters?: { handlerId?: number }) {
  const evaluations = await listClaimsQaEvaluations(viewer, {
    limit: 500,
    handlerId: viewer.isLeadership ? filters?.handlerId : undefined,
  });
  const client = await dbClient();
  const ids = evaluations.map((evaluation) => evaluation.id);
  const resultRows: any[] = ids.length
    ? (await client.query(`SELECT * FROM claims_qa_evaluation_results WHERE evaluation_id IN (${ids.map(() => '?').join(',')})`, ids))[0] as any[]
    : [];
  // Leadership sees imported audits before a manual release. Their quality
  // dashboard must reflect those evidence-backed scores; release status only
  // controls what a handler can access. Call Quality is already excluded by
  // listClaimsQaEvaluations unless Call Tracking explicitly requests it.
  const completed = evaluations.filter((evaluation) => evaluation.status !== 'not_released');
  const rated = evaluations.filter((evaluation) => evaluation.original_rating !== 'legacy_call_qa');
  const evaluationById = new Map(evaluations.map((evaluation) => [Number(evaluation.id), evaluation]));
  const handlerMap = new Map<string, any>();
  const roleMap = new Map<string, any>();
  const roundMap = new Map<string, any>();

  for (const evaluation of rated) {
    const scored = Number(evaluation.original_items_scored ?? 0);
    const met = Number(evaluation.original_items_met ?? 0);
    const criticalFailures = Number(evaluation.original_critical_failures ?? 0);
    const handlerKey = `${evaluation.handler_id}:${evaluation.handler_name}`;
    const handler = handlerMap.get(handlerKey) ?? { handlerId: evaluation.handler_id, handlerName: evaluation.handler_name, role: evaluation.role, evaluations: 0, scored: 0, met: 0, criticalFailures: 0, openActions: 0 };
    handler.evaluations++;
    handler.scored += scored;
    handler.met += met;
    handler.criticalFailures += criticalFailures;
    if (['released', 'in_adjudication'].includes(evaluation.status)) handler.openActions++;
    handlerMap.set(handlerKey, handler);

    const role = roleMap.get(evaluation.role) ?? { role: evaluation.role, evaluations: 0, scored: 0, met: 0, criticalFailures: 0, filesClean: 0, handlers: new Set<number>() };
    role.evaluations++;
    role.scored += scored;
    role.met += met;
    role.criticalFailures += criticalFailures;
    if (!criticalFailures && evaluation.original_rating === 'strong') role.filesClean++;
    if (evaluation.handler_id) role.handlers.add(Number(evaluation.handler_id));
    roleMap.set(evaluation.role, role);

    const period = claimsQaPeriod(evaluation);
    const round = roundMap.get(period.key) ?? { periodKey: period.key, periodLabel: period.label, evaluations: 0, scored: 0, met: 0, criticalFailures: 0, filesClean: 0 };
    round.evaluations++;
    round.scored += scored;
    round.met += met;
    round.criticalFailures += criticalFailures;
    if (!criticalFailures && evaluation.original_rating === 'strong') round.filesClean++;
    roundMap.set(period.key, round);
  }

  const byCategory = new Map<string, { category: string; scored: number; met: number; criticalFailures: number }>();
  const itemMap = new Map<string, any>();
  for (const result of resultRows) {
    const value = effectiveResult(result);
    if (value !== 'met' && value !== 'not_met') continue;
    const evaluation = evaluationById.get(Number(result.evaluation_id));
    if (!evaluation) continue;

    const category = byCategory.get(result.category) ?? { category: result.category, scored: 0, met: 0, criticalFailures: 0 };
    category.scored++;
    if (value === 'met') category.met++;
    if (result.critical && value === 'not_met') category.criticalFailures++;
    byCategory.set(result.category, category);

    const item = itemMap.get(result.item_key) ?? {
      itemKey: result.item_key,
      checkText: result.check_text,
      category: result.category,
      critical: Boolean(result.critical),
      scored: 0,
      misses: 0,
      handlers: new Map<string, any>(),
      teams: new Map<string, any>(),
      audits: new Map<number, any>(),
    };
    item.scored++;
    const handlerKey = `${evaluation.handler_id}:${evaluation.handler_name}`;
    const handler = item.handlers.get(handlerKey) ?? { handlerId: evaluation.handler_id, handlerName: evaluation.handler_name, role: evaluation.role, scored: 0, misses: 0, evaluationIds: new Set<number>() };
    handler.scored++;
    const team = item.teams.get(evaluation.role) ?? { role: evaluation.role, scored: 0, misses: 0, evaluationIds: new Set<number>() };
    team.scored++;
    if (value === 'not_met') {
      item.misses++;
      handler.misses++;
      team.misses++;
      handler.evaluationIds.add(Number(evaluation.id));
      team.evaluationIds.add(Number(evaluation.id));
      item.audits.set(Number(evaluation.id), {
        evaluationId: Number(evaluation.id),
        evaluationKey: evaluation.evaluation_key,
        claimNumber: evaluation.claim_number,
        handlerId: evaluation.handler_id,
        handlerName: evaluation.handler_name,
        role: evaluation.role,
        auditDate: evaluation.audit_date,
        status: evaluation.status,
      });
    }
    item.handlers.set(handlerKey, handler);
    item.teams.set(evaluation.role, team);
    itemMap.set(result.item_key, item);
  }

  const itemTrends = Array.from(itemMap.values()).map((item: any) => {
    const handlers = Array.from(item.handlers.values()).map((row: any) => ({
      ...row,
      evaluationIds: Array.from(row.evaluationIds),
      missRate: row.scored ? Math.round((row.misses / row.scored) * 100) : null,
    })).sort((a: any, b: any) => b.misses - a.misses || (b.missRate ?? -1) - (a.missRate ?? -1));
    const teams = Array.from(item.teams.values()).map((row: any) => ({
      ...row,
      evaluationIds: Array.from(row.evaluationIds),
      missRate: row.scored ? Math.round((row.misses / row.scored) * 100) : null,
    })).sort((a: any, b: any) => b.misses - a.misses || (b.missRate ?? -1) - (a.missRate ?? -1));
    const repeatedHandlers = handlers.filter((row: any) => row.misses >= 2);
    return {
      itemKey: item.itemKey,
      checkText: item.checkText,
      category: item.category,
      critical: item.critical,
      scored: item.scored,
      misses: item.misses,
      missRate: item.scored ? Math.round((item.misses / item.scored) * 100) : null,
      affectedHandlers: handlers.filter((row: any) => row.misses > 0).length,
      affectedTeams: teams.filter((row: any) => row.misses > 0).length,
      repeatedHandlers: repeatedHandlers.length,
      repeatedMisses: repeatedHandlers.reduce((sum: number, row: any) => sum + row.misses, 0),
      handlers,
      teams,
      audits: Array.from(item.audits.values()).sort((a: any, b: any) => String(b.auditDate ?? '').localeCompare(String(a.auditDate ?? ''))),
    };
  }).filter((row: any) => row.misses > 0);

  const mostMissed = [...itemTrends]
    .sort((a: any, b: any) => b.missRate - a.missRate || b.misses - a.misses)
    .slice(0, 10);
  const repeatedMissed = [...itemTrends]
    .filter((row: any) => row.repeatedHandlers > 0)
    .sort((a: any, b: any) => b.repeatedHandlers - a.repeatedHandlers || b.repeatedMisses - a.repeatedMisses || b.missRate - a.missRate)
    .slice(0, 10);
  const totalScored = rated.reduce((sum, evaluation) => sum + Number(evaluation.original_items_scored ?? 0), 0);
  const totalMet = rated.reduce((sum, evaluation) => sum + Number(evaluation.original_items_met ?? 0), 0);
  const totalCritical = rated.reduce((sum, evaluation) => sum + Number(evaluation.original_critical_failures ?? 0), 0);
  const categories = Array.from(byCategory.values()).map((row) => ({ ...row, passRate: percentage(row.met, row.scored) })).sort((a, b) => (a.passRate ?? -1) - (b.passRate ?? -1));
  const teams = Array.from(roleMap.values()).map((row: any) => ({ ...row, handlers: row.handlers.size, passRate: percentage(row.met, row.scored) })).sort((a: any, b: any) => (a.passRate ?? -1) - (b.passRate ?? -1));
  const rounds = Array.from(roundMap.values()).map((row: any) => ({ ...row, passRate: percentage(row.met, row.scored) })).sort((a: any, b: any) => a.periodKey.localeCompare(b.periodKey));
  return {
    counts: {
      evaluations: evaluations.length,
      released: completed.length,
      criticalFailures: totalCritical,
      filesClean: rated.filter((evaluation) => Number(evaluation.original_critical_failures ?? 0) === 0 && evaluation.original_rating === 'strong').length,
      openActions: Array.from(handlerMap.values()).reduce((sum: number, row: any) => sum + row.openActions, 0),
    },
    quality: { scored: totalScored, met: totalMet, passRate: percentage(totalMet, totalScored), criticalFailures: totalCritical },
    categories,
    teams,
    rounds,
    handlers: Array.from(handlerMap.values()).map((row) => ({ ...row, passRate: percentage(row.met, row.scored) })).sort((a, b) => (a.passRate ?? -1) - (b.passRate ?? -1)),
    mostMissed,
    repeatedMissed,
    definitions: {
      passRate: 'Items met divided by items scored. Not applicable and not determinable lines are excluded; fewer than 15 scored items suppresses the percentage.',
      criticalFailures: 'Critical lines scored Not met. A critical miss overrides percentage-based rating.',
      repeatedMiss: 'The same rubric item scored Not met for the same handler on two or more evaluated files in the selected data.',
      productivity: 'Call-volume and handling productivity remain in Call Tracking and are not combined with quality scores.',
    },
  };
}

export async function getClaimsQaCalibrationDetail(viewer: ClaimsQaViewer, calibrationId: number) {
  if (!viewer.isLeadership) throw new Error('Leadership access is required.');
  const client = await dbClient();
  const [calibrations] = await client.query('SELECT * FROM claims_qa_calibrations WHERE id=? LIMIT 1', [calibrationId]);
  const calibration = (calibrations as any[])[0];
  if (!calibration) throw new Error('Calibration not found.');
  await assertEvaluationAccess(viewer, calibration.evaluation_id, { leadershipOnly: true });
  const [rows] = await client.query(
    `SELECT r.*, s.reviewer_user_id, s.reviewer_name, s.result AS calibration_result, s.evidence AS calibration_evidence
       FROM claims_qa_evaluation_results r
       LEFT JOIN claims_qa_calibration_scores s ON s.evaluation_result_id = r.id AND s.calibration_id = ?
      WHERE r.evaluation_id = ? ORDER BY r.category ASC, r.item_key ASC`,
    [calibrationId, calibration.evaluation_id],
  );
  const scores = rows as any[];
  const byItem = new Map<number, any[]>();
  for (const row of scores) {
    const current = byItem.get(row.id) ?? [];
    if (row.reviewer_user_id) current.push(row);
    byItem.set(row.id, current);
  }
  const divergence = Array.from(byItem.values()).filter((rowsForItem) => new Set(rowsForItem.map((row) => row.calibration_result)).size > 1).length;
  return { calibration, rows: scores, divergence };
}

export async function getClaimsQaMigrationInventory() {
  const client = await dbClient();
  const [legacy] = await client.query('SELECT COUNT(*) AS count FROM qa_scorecards');
  const [migrated] = await client.query("SELECT COUNT(*) AS count FROM claims_qa_evaluations WHERE source_legacy_scorecard_id IS NOT NULL");
  const [claimAudits] = await client.query("SELECT COUNT(*) AS count FROM claims_qa_evaluations WHERE role <> 'Call Quality'");
  const [rubric] = await client.query('SELECT COUNT(*) AS count FROM claims_qa_rubric_items WHERE rubric_version_id = (SELECT id FROM claims_qa_rubric_versions WHERE version=? LIMIT 1)', [CLAIMS_QA_RUBRIC_VERSION]);
  return {
    legacyScorecards: Number((legacy as any[])[0]?.count ?? 0),
    migratedLegacyScorecards: Number((migrated as any[])[0]?.count ?? 0),
    claimAudits: Number((claimAudits as any[])[0]?.count ?? 0),
    rubricItems: Number((rubric as any[])[0]?.count ?? 0),
    unavailable: ['No stored 92-evaluation claim-audit result set was found; none was fabricated.', 'No per-call qa_scores or loss_intake_call_qas rows were found at migration time.'],
  };
}
