import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('active certificate naming', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('retains the Certificate of Insurance output while routing retired Klutch certificate links into the workspace', () => {
    expect(source).toContain('"coi-whip", "coi-klutch"');
    expect(source).toContain('return "klutch-policy-documents";');
    expect(source).toContain('doc.text("CERTIFICATE OF INSURANCE", W / 2, y + 6, { align: "center" });');
    expect(source).toContain('`CERTIFICATE OF INSURANCE`,');
  });
});
