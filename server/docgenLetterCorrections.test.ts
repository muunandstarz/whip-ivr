import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Document Generator letter corrections', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'),
    'utf8'
  );

  it('does not retain statute-of-limitations content in generated letters', () => {
    expect(source).not.toContain('STATUTE OF LIMITATIONS NOTICE');
    expect(source).toContain('Statute-of-limitations notices are intentionally omitted from all generated letters.');
  });

  it('uses the dedicated driver field in Coverage Position while retaining the handler as signatory', () => {
    expect(source).toContain('driverName: "",');
    expect(source).toContain('Driver: ${form.driverName || "[Driver Name]"}');
    expect(source).toContain('<Field label="Driver Name" id="tnc-driver" value={form.driverName}');
    expect(source).toContain('${form.adjusterName || "[Adjuster Name]"}');
  });
});
