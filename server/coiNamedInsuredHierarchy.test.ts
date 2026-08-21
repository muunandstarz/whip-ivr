import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('COI named insured hierarchy and Maryland UM indicators', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('keeps Metrocars as named insured and emphasizes the renter as additional named insured', () => {
    expect(source).toContain('"NAMED INSURED"');
    expect(source).toContain('"ADDITIONAL NAMED INSURED / RENTER"');
    expect(source).toContain('doc.setFontSize(9.6)');
    expect(source).toContain('doc.text(form.namedOperator || "—"');
  });

  it('marks Maryland UM and UIM rows for the Metrocars additional insured', () => {
    expect(source).toContain('state === "MD" ? ["BI", "PD", "UM", "UIM", "COL", "COMP"]');
  });
});
