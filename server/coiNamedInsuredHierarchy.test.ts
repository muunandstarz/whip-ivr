import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');
const coi = source.slice(source.indexOf('export function UnifiedCOITab'), source.indexOf('function KlutchDecPageTab'));

function expectCoiText(fragment: string) {
  // Assert only the scoped semantic run, avoiding obsolete drawing coordinates
  // and huge failure diffs containing the generator's embedded image assets.
  expect(coi.includes(fragment), `Missing COI semantic run: ${fragment}`).toBe(true);
}

describe('COI named insured hierarchy and Maryland UM indicators', () => {
  it('keeps Metrocars as named insured and emphasizes the renter as additional named insured', () => {
    expectCoiText('[label("NAMED INSURED"), coiText("Metrocars Leasing Corp", 8, "normal", "left", 1),');
    expectCoiText('label("ADDITIONAL NAMED INSURED / RENTER"), coiText(form.namedOperator || "—", 9.6, "bold", "left", 1),');
    expect(coi.indexOf('label("NAMED INSURED")')).toBeLessThan(coi.indexOf('label("ADDITIONAL NAMED INSURED / RENTER")'));
  });

  it('marks Maryland UM and UIM rows for the Metrocars additional insured', () => {
    expectCoiText('state === "MD" ? ["BI", "PD", "UM", "UIM", "COL", "COMP"] : ["BI", "PD", "COL", "COMP"]');
    expectCoiText('additionalInsuredCoverageCodes.has(row.insr) ? "[X]" : "[ ]"');
  });
});
