import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');
const coiStart = source.indexOf('function UnifiedCOITab');
const declarationsStart = source.indexOf('function KlutchDecPageTab');
const coiSource = source.slice(coiStart, declarationsStart);

describe('Unified COI coverage period', () => {
  it('uses the single Date Issued / Subscription Start Date in every rendered coverage-period location', () => {
    expect(coiSource).toContain('const coverageStartDate = form.subscriptionStartDate;');
    expect(coiSource).toContain('fmtDateLong(coverageStartDate)');
    expect(coiSource).toContain('const effDate = fmtDate(coverageStartDate);');
    expect(coiSource).toContain('new Date(coverageStartDate + "T12:00:00")');
    expect(coiSource).not.toContain('form.effectiveDate');
  });

  it('renders the same period in the insured panel, coverage table, and formatted preview', () => {
    expect(coiSource).toContain('doc.text(periodStr, rx, y + 8);');
    expect(coiSource).toContain('doc.text(effDate, effX + cols.eff / 2');
    expect(coiSource).toContain('Coverage Period: ${coverageStartDate && form.expirationDate');
  });
});
