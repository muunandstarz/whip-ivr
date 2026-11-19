import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('active certificate naming', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('retains the Certificate of Insurance output while routing retired Klutch certificate links into the workspace', () => {
    expect(source).toContain('"coi-whip", "coi-klutch"');
    expect(source).toContain('return "klutch-policy-documents";');
    expect(source).toContain('coiText("CERTIFICATE OF INSURANCE",');
    expect(source).toContain('`CERTIFICATE OF INSURANCE`,');
  });
});
