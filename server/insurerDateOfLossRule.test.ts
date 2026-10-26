import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Unified COI insurer subscription-start rule', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('uses the July 1, 2026 Subscription Start Date cutoff for general COIs while allowing the dedicated MetroCars view to stay fixed', () => {
    expect(source).toContain('const KLUTCH_SUBSCRIPTION_START_CUTOFF = "2026-07-01";');
    expect(source).toContain('carrierMode === "metrocars"');
    expect(source).toContain('form.subscriptionStartDate >= KLUTCH_SUBSCRIPTION_START_CUTOFF');
    expect(source).toContain('? "klutch"');
    expect(source).toContain(': "metrocars"');
  });

  it('collects one Date Issued and Subscription Start Date and labels carrier guidance accordingly', () => {
    expect(source).toContain('<Field label="Date Issued / Subscription Start Date" id="coi-issue-start-date"');
    expect(source).toContain('Subscription Start Date July 1, 2026 or later');
    expect(source).toContain('Subscription Start Date before July 1, 2026');
    expect(source).not.toContain('Date of loss July 1, 2026 or later');
    expect(source).not.toContain('Date of loss before July 1, 2026');
  });
});
