import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Klutch coverage navigation', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

  it('does not expose the unfinished Klutch Dec Page as an active Document Generator tab', () => {
    expect(source).not.toContain('{ id: "dec-page-klutch", label: "Klutch Dec Page", icon: FileText }');
    expect(source).not.toContain('case "dec-page-klutch":');
  });

  it('replaces legacy individual pages with the Klutch policy documents workspace', () => {
    expect(source).toContain('{ id: "klutch-policy-documents", label: "Klutch Policy Documents", icon: FileText }');
    expect(source).toContain('case "klutch-policy-documents": return <KlutchPolicyDocumentsWorkspace');
  });

  it('removes the separate Klutch Dec Page entry and normalizes every legacy link to the workspace', () => {
    expect(source).not.toContain('{ id: "dec-page-whip", label: "Klutch — Dec Page", icon: FileText }');
    expect(source).toContain('const LEGACY_KLUTCH_TAB_IDS = new Set(["coverage-tnc", "coi-whip", "coi-klutch", "klutch-policy-declarations", "dec-page-whip"]);');
    expect(source).toContain('if (LEGACY_KLUTCH_TAB_IDS.has(tab ?? "")) return "klutch-policy-documents";');
  });
});
