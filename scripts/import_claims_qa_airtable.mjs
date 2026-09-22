#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const EXPECTED = Object.freeze({ evaluations: 92, results: 3426, rubricItems: 171 });
const SOURCE_PREFIX = 'airtable-claims-qa-';

function usage() {
  console.log('Usage: node scripts/import_claims_qa_airtable.mjs <bundle-path-or-url> [--dry-run]');
}

async function readBundle(source) {
  const text = /^https?:\/\//i.test(source)
    ? await fetch(source).then(async response => {
        if (!response.ok) throw new Error(`Unable to download bundle: ${response.status} ${response.statusText}`);
        return response.text();
      })
    : await readFile(source, 'utf8');
  return JSON.parse(text);
}

function assertBundle(bundle) {
  if (bundle?.schemaVersion !== 1) throw new Error('Unsupported Claims QA bundle schema.');
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (Number(bundle?.counts?.[key]) !== expected) {
      throw new Error(`Expected ${expected} ${key}; received ${bundle?.counts?.[key] ?? 'missing'}.`);
    }
  }
  if (!bundle?.validations?.allResultsMatchedToAudit || !bundle?.validations?.uniqueEvaluationItemPairs) {
    throw new Error('Bundle relationship validation failed.');
  }
  const sourceCounts = bundle?.counts?.sourceResults ?? {};
  if (sourceCounts.Y !== 1873 || sourceCounts.N !== 376 || sourceCounts.NA !== 1177) {
    throw new Error(`Unexpected result distribution: ${JSON.stringify(sourceCounts)}.`);
  }
  if ((bundle?.validations?.perEvaluationAggregateMismatches ?? []).length) {
    throw new Error('Bundle contains evaluation aggregate mismatches.');
  }
  const callQualityRows = (bundle.evaluations ?? []).filter(row => row.role === 'Call Quality');
  if (callQualityRows.length) throw new Error('Call Quality records are not allowed in the Claims QA import bundle.');
}

function periodBounds(auditId, fallbackPeriod) {
  const match = String(auditId ?? '').match(/^[A-Z]+-(\d{2})(\d{2})-/);
  const period = match ? `20${match[1]}-${match[2]}` : fallbackPeriod;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period ?? '')) return [null, null];
  const [year, month] = period.split('-').map(Number);
  const start = `${period}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return [start, end];
}

function sourcePayload(evaluation) {
  return JSON.stringify({
    kind: 'airtable_claims_qa',
    airtableRecordId: evaluation.airtableRecordId,
    auditId: evaluation.auditId,
    sourceStatus: evaluation.sourceStatus,
    handlerReviewStatus: evaluation.handlerReviewStatus,
    strengths: evaluation.strengths,
    scoreInWords: evaluation.scoreInWords,
    scoreOutOf25: evaluation.scoreOutOf25,
    itemsDisputed: evaluation.itemsDisputed,
    itemsOverturned: evaluation.itemsOverturned,
    adjudicatorName: evaluation.adjudicatorName,
    syncedFromAirtableAt: new Date().toISOString(),
  });
}

function dbValue(value) {
  return value === undefined ? null : value;
}

async function exactHandlerId(connection, evaluation, report) {
  const name = String(evaluation.handlerName ?? '').trim();
  if (!name) throw new Error(`Audit ${evaluation.auditId} has no handler name.`);
  const [rows] = await connection.query(
    'SELECT id, name, email FROM handlers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id ASC',
    [name],
  );
  if (rows.length > 1) throw new Error(`Ambiguous handler mapping for ${name}: ${rows.map(row => row.id).join(', ')}`);
  let handler = rows[0];
  if (!handler) {
    const [insert] = await connection.query(
      'INSERT INTO handlers (name, role, active, createdAt) VALUES (?, ?, TRUE, NOW())',
      [name, evaluation.role],
    );
    handler = { id: insert.insertId, name, email: null };
    report.handlersCreated.push({ id: handler.id, name });
  } else {
    await connection.query('UPDATE handlers SET role=?, active=TRUE WHERE id=?', [evaluation.role, handler.id]);
    report.handlersMatched.push({ id: handler.id, name });
  }

  const [users] = await connection.query(
    'SELECT id, name, email FROM users WHERE handlerProfileId IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id ASC',
    [name],
  );
  if (users.length === 1) {
    await connection.query('UPDATE users SET handlerProfileId=?, updatedAt=NOW() WHERE id=? AND handlerProfileId IS NULL', [handler.id, users[0].id]);
    report.usersLinked.push({ userId: users[0].id, handlerId: handler.id, name });
  } else if (users.length > 1) {
    report.ambiguousUsers.push({ name, userIds: users.map(user => user.id) });
  }
  return handler;
}

async function getRubricVersionId(connection) {
  const [existing] = await connection.query('SELECT id FROM claims_qa_rubric_versions WHERE version=? LIMIT 1', ['v9']);
  if (existing[0]) return existing[0].id;
  const [insert] = await connection.query(
    `INSERT INTO claims_qa_rubric_versions
       (version, source, status, notes, created_by, created_at, published_at)
     VALUES ('v9', 'Airtable Claims QA', 'published', ?, 'Claims QA Airtable sync', NOW(), NOW())`,
    ['Imported from the validated Airtable Claims QA base.'],
  );
  return insert.insertId;
}

async function upsertRubric(connection, versionId, rubric) {
  for (const item of rubric) {
    await connection.query(
      `INSERT INTO claims_qa_rubric_items
         (rubric_version_id, item_key, role, category, check_text, passing_standard, where_to_find,
          grading_method, critical, active, category_weight, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         role=VALUES(role), category=VALUES(category), check_text=VALUES(check_text),
         passing_standard=VALUES(passing_standard), where_to_find=VALUES(where_to_find),
         grading_method=VALUES(grading_method), critical=VALUES(critical), active=VALUES(active),
         category_weight=VALUES(category_weight), updated_at=NOW()`,
      [
        versionId, item.itemKey, item.role, item.category, item.checkText, item.passingStandard,
        item.whereToFind, item.gradingMethod, item.critical ? 1 : 0, item.active ? 1 : 0,
        dbValue(item.categoryWeight),
      ],
    );
  }
}

async function upsertEvaluation(connection, evaluation, handler) {
  const [periodStart, periodEnd] = periodBounds(evaluation.auditId, evaluation.period);
  const payload = sourcePayload(evaluation);
  await connection.query(
    `INSERT INTO claims_qa_evaluations
       (evaluation_key, claim_number, role, period_start, period_end, audit_date, handler_id, handler_name,
        handler_email, auditor_name, status, original_items_scored, original_items_met, original_not_applicable,
        original_not_determinable, original_critical_failures, original_pass_rate, original_rating,
        review_items_scored, review_items_met, review_critical_failures, pass_rate_after_review,
        rating_after_review, auditor_summary, areas_for_improvement, legacy_payload,
        handler_overall_response, handler_signed_off_at, released_at, closed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       claim_number=VALUES(claim_number), role=VALUES(role), period_start=VALUES(period_start), period_end=VALUES(period_end),
       audit_date=VALUES(audit_date), handler_id=VALUES(handler_id), handler_name=VALUES(handler_name),
       handler_email=VALUES(handler_email), auditor_name=VALUES(auditor_name),
       original_items_scored=VALUES(original_items_scored), original_items_met=VALUES(original_items_met),
       original_not_applicable=VALUES(original_not_applicable), original_not_determinable=VALUES(original_not_determinable),
       original_critical_failures=VALUES(original_critical_failures), original_pass_rate=VALUES(original_pass_rate),
       original_rating=VALUES(original_rating), auditor_summary=VALUES(auditor_summary),
       areas_for_improvement=VALUES(areas_for_improvement), legacy_payload=VALUES(legacy_payload), updated_at=NOW()`,
    [
      evaluation.evaluationKey, evaluation.claimNumber, evaluation.role, periodStart, periodEnd,
      evaluation.auditDate, handler.id, evaluation.handlerName, handler.email ?? null, evaluation.auditorName,
      evaluation.status, evaluation.originalItemsScored, evaluation.originalItemsMet,
      evaluation.originalNotApplicable, evaluation.originalNotDeterminable, evaluation.originalCriticalFailures,
      dbValue(evaluation.originalPassRate), evaluation.rating,
      evaluation.originalItemsScored, evaluation.originalItemsMet, evaluation.originalCriticalFailures,
      dbValue(evaluation.passRateAfterReview ?? evaluation.originalPassRate), evaluation.rating,
      evaluation.auditorSummary, evaluation.areasForImprovement, payload,
      evaluation.handlerOverallResponse ?? evaluation.handlerComments ?? null,
      evaluation.handlerSignedOffAt, evaluation.releasedOn, evaluation.closedAt,
      evaluation.createdTime ?? evaluation.auditDate,
    ],
  );
  const [rows] = await connection.query('SELECT id FROM claims_qa_evaluations WHERE evaluation_key=? LIMIT 1', [evaluation.evaluationKey]);
  return rows[0].id;
}

async function rubricIds(connection, versionId) {
  const [rows] = await connection.query('SELECT id, item_key FROM claims_qa_rubric_items WHERE rubric_version_id=?', [versionId]);
  return new Map(rows.map(row => [row.item_key, row.id]));
}

async function upsertResult(connection, result, evaluationId, rubricItemId) {
  const needsHuman = Boolean(result.critical && /human/i.test(result.gradingMethod ?? ''));
  const confirmedAt = result.auditorConfirmed ? (result.createdTime ?? new Date()) : null;
  await connection.query(
    `INSERT INTO claims_qa_evaluation_results
       (evaluation_id, rubric_item_id, item_key, category, check_text, passing_standard, where_to_find,
        grading_method, critical, result, evidence, evidence_locator, auditor_note,
        requires_human_confirmation, human_confirmed_at, human_confirmed_by_name,
        handler_response, handler_response_comment, responded_at,
        adjudication_outcome, adjudication_note, adjudicated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       rubric_item_id=VALUES(rubric_item_id), category=VALUES(category), check_text=VALUES(check_text),
       passing_standard=VALUES(passing_standard), where_to_find=VALUES(where_to_find),
       grading_method=VALUES(grading_method), critical=VALUES(critical), result=VALUES(result),
       evidence=VALUES(evidence), evidence_locator=VALUES(evidence_locator), auditor_note=VALUES(auditor_note),
       requires_human_confirmation=VALUES(requires_human_confirmation),
       human_confirmed_at=COALESCE(human_confirmed_at, VALUES(human_confirmed_at)),
       human_confirmed_by_name=COALESCE(human_confirmed_by_name, VALUES(human_confirmed_by_name)),
       updated_at=NOW()`,
    [
      evaluationId, rubricItemId ?? null, result.itemKey, result.category, result.checkText,
      result.passingStandard, result.whereToFind, result.gradingMethod, result.critical ? 1 : 0,
      result.result, result.evidence, result.whereToFind, result.auditorNote,
      needsHuman ? 1 : 0, confirmedAt, confirmedAt ? 'Airtable auditor confirmation' : null,
      result.handlerPosition, result.handlerComment, result.handlerPosition ? result.createdTime : null,
      result.adjudicationOutcome, result.adjudicationNote, result.adjudicationOutcome ? result.createdTime : null,
      result.createdTime ?? new Date(),
    ],
  );
}

async function verifyDatabase(connection) {
  const [[evaluations]] = await connection.query(
    `SELECT COUNT(*) AS count FROM claims_qa_evaluations WHERE evaluation_key LIKE ? AND role <> 'Call Quality'`,
    [`${SOURCE_PREFIX}%`],
  );
  const [[results]] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM claims_qa_evaluation_results r
       JOIN claims_qa_evaluations e ON e.id=r.evaluation_id
      WHERE e.evaluation_key LIKE ? AND e.role <> 'Call Quality'`,
    [`${SOURCE_PREFIX}%`],
  );
  const [[legacyCallQuality]] = await connection.query(
    `SELECT COUNT(*) AS count FROM claims_qa_evaluations WHERE role='Call Quality'`,
  );
  return {
    claimEvaluations: Number(evaluations.count),
    claimResults: Number(results.count),
    legacyCallQualityPreservedForCallTracking: Number(legacyCallQuality.count),
  };
}

async function main() {
  const source = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!source) {
    usage();
    process.exitCode = 2;
    return;
  }
  const bundle = await readBundle(source);
  assertBundle(bundle);
  console.log(JSON.stringify({
    valid: true,
    source: bundle.source,
    counts: bundle.counts,
    validation: bundle.validations,
  }, null, 2));
  if (dryRun) return;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required unless --dry-run is used.');

  const { createConnection } = await import('mysql2/promise');
  const connection = await createConnection(process.env.DATABASE_URL);
  const report = { handlersCreated: [], handlersMatched: [], usersLinked: [], ambiguousUsers: [] };
  try {
    await connection.beginTransaction();
    const versionId = await getRubricVersionId(connection);
    await upsertRubric(connection, versionId, bundle.rubric);

    const handlerByName = new Map();
    const evaluationIdByKey = new Map();
    for (const evaluation of bundle.evaluations) {
      let handler = handlerByName.get(evaluation.handlerName);
      if (!handler) {
        handler = await exactHandlerId(connection, evaluation, report);
        handlerByName.set(evaluation.handlerName, handler);
      }
      const evaluationId = await upsertEvaluation(connection, evaluation, handler);
      evaluationIdByKey.set(evaluation.evaluationKey, evaluationId);
    }

    const itemIds = await rubricIds(connection, versionId);
    let importedResults = 0;
    for (const result of bundle.results) {
      const evaluationId = evaluationIdByKey.get(result.evaluationKey);
      if (!evaluationId) throw new Error(`Missing imported evaluation for ${result.evaluationKey}.`);
      await upsertResult(connection, result, evaluationId, itemIds.get(result.itemKey));
      importedResults += 1;
      if (importedResults % 500 === 0) console.log(`Imported ${importedResults}/${bundle.results.length} result rows.`);
    }

    const verified = await verifyDatabase(connection);
    if (verified.claimEvaluations !== EXPECTED.evaluations || verified.claimResults !== EXPECTED.results) {
      throw new Error(`Post-import verification failed: ${JSON.stringify(verified)}.`);
    }
    await connection.commit();
    console.log(JSON.stringify({ imported: true, verified, report }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
