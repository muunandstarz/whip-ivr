import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAIMS_QA_RUBRIC } from './claimsQaRubricData';
import { canViewClaimsQaEvaluation, effectiveResult, ratingFor } from './claimsQa';

const root = resolve(__dirname, '..');

function source(relativePath: string) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Claims QA rubric and score rules', () => {
  it('imports the full v9 rubric with its stated role distribution', () => {
    expect(CLAIMS_QA_RUBRIC).toHaveLength(171);
    expect(CLAIMS_QA_RUBRIC.filter((item) => item.role === 'First Party')).toHaveLength(41);
    expect(CLAIMS_QA_RUBRIC.filter((item) => item.role === 'Liability - PD')).toHaveLength(40);
    expect(CLAIMS_QA_RUBRIC.filter((item) => item.role === 'Liability - Injury')).toHaveLength(49);
    expect(CLAIMS_QA_RUBRIC.filter((item) => item.role === 'Intake')).toHaveLength(41);
    expect(CLAIMS_QA_RUBRIC.filter((item) => item.itemKey === 'FP-16')[0]?.active).toBe(false);
  });

  it('uses critical-first rating and suppresses small-sample percentages', () => {
    expect(ratingFor({ scored: 32, met: 31, criticalFailures: 1 })).toEqual({ passRate: 97, rating: 'critical_miss' });
    expect(ratingFor({ scored: 14, met: 14, criticalFailures: 0 })).toEqual({ passRate: null, rating: 'small_sample' });
    expect(ratingFor({ scored: 20, met: 18, criticalFailures: 0 })).toEqual({ passRate: 90, rating: 'strong' });
    expect(ratingFor({ scored: 20, met: 16, criticalFailures: 0 })).toEqual({ passRate: 80, rating: 'solid' });
    expect(ratingFor({ scored: 20, met: 15, criticalFailures: 0 })).toEqual({ passRate: 75, rating: 'needs_work' });
  });

  it('keeps both N/A forms out of scoring and applies adjudication without overwriting the source result', () => {
    expect(effectiveResult({ result: 'not_applicable' })).toBe('not_applicable');
    expect(effectiveResult({ result: 'not_determinable' })).toBe('not_determinable');
    expect(effectiveResult({ result: 'not_met', adjudication_outcome: 'overturned_handling_correct' })).toBe('met');
    expect(effectiveResult({ result: 'not_met', adjudication_outcome: 'overturned_rubric_defect' })).toBe('not_determinable');
  });
});

describe('Claims QA row-level access and manual-release safeguards', () => {
  const handlerViewer = { userId: 7, name: 'Handler', isLeadership: false, handlerId: 19 };
  const leadershipViewer = { userId: 1, name: 'Leader', isLeadership: true, handlerId: null };

  it('allows a handler only their own released evaluation', () => {
    expect(canViewClaimsQaEvaluation(handlerViewer, { handler_id: 19, status: 'released' })).toBe(true);
    expect(canViewClaimsQaEvaluation(handlerViewer, { handler_id: 19, status: 'not_released' })).toBe(false);
    expect(canViewClaimsQaEvaluation(handlerViewer, { handler_id: 20, status: 'released' })).toBe(false);
    expect(canViewClaimsQaEvaluation(leadershipViewer, { handler_id: 20, status: 'not_released' })).toBe(true);
  });

  it('persists idempotent legacy migration and full uncapped evidence fields in schema and service', () => {
    const schema = source('drizzle/schema.ts');
    const service = source('server/claimsQa.ts');
    expect(schema).toContain('sourceLegacyScorecardId: int("source_legacy_scorecard_id").unique()');
    expect(schema).toContain('evidence: text("evidence")');
    expect(service).toContain('SELECT id FROM claims_qa_evaluations WHERE source_legacy_scorecard_id = ?');
    expect(service).toContain('if ((existing as any[]).length) {');
    expect(service).toContain('skipped++');
    expect(service).toContain('unconfirmedCritical');
  });

  it('removes the legacy Monday auto-publication path', () => {
    const sync = source('server/aircallSync.ts');
    const publisher = source('server/scheduled/weeklyQAPost.ts');
    expect(sync).not.toContain('Scheduled weekly QA auto-generation');
    expect(sync).not.toContain('Auto-QA');
    expect(sync).toContain('Claims QA release is deliberately manual');
    expect(publisher).toContain('disabled: true');
    expect(publisher).not.toContain('generateWeeklyQAReport');
  });

  it('surfaces preserved call-quality detail inside Call Tracking', () => {
    const callTracking = source('client/src/pages/CallTracking.tsx');
    const claimsQaPage = source('client/src/pages/WeeklyQA.tsx');
    const claimsQaService = source('server/claimsQa.ts');
    const app = source('client/src/App.tsx');
    const layout = source('client/src/components/WhipLayout.tsx');
    expect(callTracking).toContain('Preserved AI Call Quality');
    expect(callTracking).toContain('View full detail');
    expect(callTracking).toContain('role: "Call Quality"');
    expect(claimsQaService).toContain("where.push(\"role <> 'Call Quality'\")");
    expect(claimsQaPage).not.toContain('Call Quality');
    expect(claimsQaPage).not.toContain('Weekly QA');
    expect(app).toContain('<Route path="/claims-qa" component={WeeklyQA} />');
    expect(layout).toContain('{ href: "/claims-qa", label: "Claims QA"');
    expect(claimsQaPage).toContain('Manual release safeguard');
    expect(claimsQaPage).toContain('Handler sign-off');
    expect(claimsQaPage).toContain('Adjudication queue');
    expect(claimsQaPage).toContain('Calibration');
  });

  it('shows leadership the quality aggregates of unreleased imported claim audits', () => {
    const service = source('server/claimsQa.ts');
    expect(service).toContain("const rated = evaluations.filter((evaluation) => evaluation.original_rating !== 'legacy_call_qa');");
    expect(service).toContain('release status only');
  });

  it('keeps the audit-detail hook order stable when opening or closing an audit', () => {
    const page = source('client/src/pages/WeeklyQA.tsx');
    const useMemoOffset = page.indexOf('const grouped = useMemo');
    const nullGuardOffset = page.indexOf('if (!evaluationId) return null;', useMemoOffset);
    expect(useMemoOffset).toBeGreaterThan(-1);
    expect(nullGuardOffset).toBeGreaterThan(useMemoOffset);
  });

  it('builds overview trends with round, team, and repeated-miss aggregates', () => {
    const service = source('server/claimsQa.ts');
    expect(service).toContain('rounds,');
    expect(service).toContain('teams,');
    expect(service).toContain('repeatedMissed,');
    expect(service).toContain('row.misses >= 2');
    expect(service).toContain('affectedHandlers');
    expect(service).toContain('affectedTeams');
  });

  it('keeps overview high-level while making miss trends explorable by handler and team', () => {
    const page = source('client/src/pages/WeeklyQA.tsx');
    expect(page).toContain('Round-over-round quality');
    expect(page).toContain('Most-missed items');
    expect(page).toContain('Repeated missed items');
    expect(page).toContain('By handler');
    expect(page).toContain('By team');
    expect(page).toContain('Affected evaluations');
    expect(page).not.toContain('Handler quality view');
  });

  it('matches the approved queue and side-panel review interaction for both roles', () => {
    const page = source('client/src/pages/WeeklyQA.tsx');
    expect(page).toContain("from '@/components/ui/sheet'");
    expect(page).toContain("leadership ? 'Audit queue' : 'My audit reviews'");
    expect(page).toContain("leadership ? 'Leadership review' : 'My review'");
    expect(page).toContain('Ready for review');
    expect(page).toContain('Priority audit items');
    expect(page).toContain('Release to handler');
    expect(page).toContain('Submit sign-off');
  });
});
