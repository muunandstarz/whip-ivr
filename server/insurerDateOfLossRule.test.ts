import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Unified COI insurer date-of-loss rule', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('assigns Klutch on and after July 1, 2026 and Metrocars before the cutoff', () => {
    expect(source).toContain('const KLUTCH_DATE_OF_LOSS_CUTOFF = "2026-07-01";');
    expect(source).toContain('form.dateOfLoss >= KLUTCH_DATE_OF_LOSS_CUTOFF ? "klutch" : "metrocars"');
  });

  it('collects the loss date and removes the obsolete April coverage-start guidance', () => {
    expect(source).toContain('<Field label="Date of Loss" id="coi-dol"');
    expect(source).toContain('Date of loss July 1, 2026 or later');
    expect(source).toContain('Date of loss before July 1, 2026');
    expect(source).not.toContain('Coverage start date April 2026 or later');
    expect(source).not.toContain('Coverage start date prior to April 2026');
  });
});
