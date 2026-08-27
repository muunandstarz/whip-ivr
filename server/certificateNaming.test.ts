import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('active certificate naming', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('uses Certificate of Insurance for the active navigation, PDF heading, and preview', () => {
    expect(source).toContain('{ id: "coi-whip", label: "Certificate of Insurance", icon: Shield }');
    expect(source).toContain('doc.text("CERTIFICATE OF INSURANCE", W / 2, y + 6, { align: "center" });');
    expect(source).toContain('`CERTIFICATE OF INSURANCE`,');
  });
});
