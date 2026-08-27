import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Klutch coverage navigation', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('does not expose the unfinished Klutch Dec Page as an active Document Generator tab', () => {
    expect(source).not.toContain('{ id: "dec-page-klutch", label: "Klutch Dec Page", icon: FileText }');
    expect(source).not.toContain('case "dec-page-klutch":');
  });

  it('retains the approved Klutch Policy Declarations entry', () => {
    expect(source).toContain('{ id: "klutch-policy-declarations", label: "Klutch — Policy Declarations", icon: FileText }');
    expect(source).toContain('src="/klutch-policy-declarations.html"');
  });
});
