import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');
const coiStart = source.indexOf('export function UnifiedCOITab');
const declarationsStart = source.indexOf('function KlutchDecPageTab');
const coiSource = source.slice(coiStart, declarationsStart);

function expectCoi(fragment: string) {
  expect(coiSource.includes(fragment), `Missing COI coverage-period contract: ${fragment}`).toBe(true);
}

describe('Unified COI coverage period', () => {
  it('uses the single Date Issued / Subscription Start Date in every rendered coverage-period location', () => {
    expectCoi('const coverageStartDate = form.subscriptionStartDate;');
    expectCoi('coiText(fmtDate(form.subscriptionStartDate), 9, "bold", "right")');
    expectCoi('fmtDateLong(coverageStartDate)');
    expectCoi('const effDate = fmtDate(coverageStartDate);');
    expectCoi('new Date(coverageStartDate + "T12:00:00")');
    expect(coiSource.includes('form.effectiveDate')).toBe(false);
  });

  it('renders the same period in the insured panel, coverage table, and formatted preview', () => {
    expectCoi('`${fmtDateLong(coverageStartDate)} — ${fmtDateLong(form.expirationDate)}`');
    expectCoi('[label("COVERAGE PERIOD"), coiText(periodStr, 9, "normal", "left", classic ? 1 : 2),');
    expectCoi('[coiText(effDate, 7.5, "normal", "center")], [coiText(expDate, 7.5, "normal", "center")]');
    expectCoi('Coverage Period: ${coverageStartDate && form.expirationDate');
  });

  it('does not erase an entered expiration when the still-in-rental toggle is off', () => {
    expectCoi('const previouslyStillInRentalCOI = React.useRef(false);');
    expectCoi('const toggledFromProjectedPeriod = previouslyStillInRentalCOI.current;');
    expectCoi('toggledFromProjectedPeriod || !p.expirationDate');
    expect(coiSource.includes('if (!stillInRentalCOI) {\n      setForm(p => ({ ...p, expirationDate: "" }));')).toBe(false);
  });
});
