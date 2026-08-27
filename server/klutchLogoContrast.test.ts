import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Klutch Certificate of Insurance logo contrast', () => {
  it('retains the embedded Klutch PNG used by the unified certificate PDF without a text overlay', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');
    expect(source).toMatch(/const KLUTCH_LOGO_B64\s*=\s*"iVBOR/);
    expect(source).toContain('doc.addImage(KLUTCH_LOGO_B64, "PNG", lm, y + 1, 40, 10)');
  });
});
