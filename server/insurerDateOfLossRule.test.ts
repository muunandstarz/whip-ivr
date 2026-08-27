import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Unified COI insurer subscription-start rule', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('assigns Klutch on and after July 1, 2026 Subscription Start Date and Metrocars before the cutoff', () => {
    expect(source).toContain('const KLUTCH_SUBSCRIPTION_START_CUTOFF = "2026-07-01";');
    expect(source).toContain('form.subscriptionStartDate >= KLUTCH_SUBSCRIPTION_START_CUTOFF ? "klutch" : "metrocars"');
  });

  it('collects Subscription Start Date and labels carrier guidance accordingly', () => {
    expect(source).toContain('<Field label="Subscription Start Date" id="coi-subscription-start"');
    expect(source).toContain('Subscription Start Date July 1, 2026 or later');
    expect(source).toContain('Subscription Start Date before July 1, 2026');
    expect(source).not.toContain('Date of loss July 1, 2026 or later');
    expect(source).not.toContain('Date of loss before July 1, 2026');
  });
});
