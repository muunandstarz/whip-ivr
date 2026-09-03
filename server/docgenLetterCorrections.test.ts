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
});
