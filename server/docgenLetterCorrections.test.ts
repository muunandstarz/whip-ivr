import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Document Generator letter corrections', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'),
    'utf8'
  );

  it('limits statute-of-limitations content to the approved PD-only Failed Contact notice', () => {
    expect(source).toContain('function addFailedContactPdSolNotice');
    expect(source).toContain('applicable legal filing deadlines, including the statute of limitations');
    expect(source).toContain("addFailedContactPdSolNotice(doc, form.state, form.dateOfLoss)");
  });

  it('uses the dedicated driver field in Coverage Position while retaining the handler as signatory', () => {
    expect(source).toContain('driverName: "",');
    expect(source).toContain('Driver: ${form.driverName || "[Driver Name]"}');
    expect(source).toContain('<Field label="Driver Name" id="tnc-driver" value={form.driverName}');
    expect(source).toContain('${form.adjusterName || "[Adjuster Name]"}');
  });

  it('renders BI and PD releases as approved-style claimant-facing documents with a witness block', () => {
    expect(source).toContain('GENERAL RELEASE OF ALL CLAIMS – BODILY INJURY');
    expect(source).toContain('GENERAL RELEASE OF ALL CLAIMS – PROPERTY DAMAGE');
    expect(source).toContain('KNOW ALL PERSONS BY THESE PRESENTS');
    expect(source).toContain('Claimant Signature:');
    expect(source).toContain('Witness Signature:');
    expect(source).toContain('Signature of Parent/Guardian:');
    expect(source).toContain('doc.text(title, pageWidth / 2, y, { align: "center" });');
    expect(source).not.toContain('"Whip Claims Management / Metrocars Leasing Corp",\n  ].join("\\n");');
  });
});
