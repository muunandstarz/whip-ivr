import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'server/routers/docgen.ts'), 'utf8');
const pageSource = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');

describe('estimate workflow fields and previews', () => {
  it('extracts insurer, claimant, and adjuster names through the shared estimate contract', () => {
    expect(routerSource).toContain('insurerName: { type: "string" }');
    expect(routerSource).toContain('claimantName: { type: "string" }');
    expect(routerSource).toContain('adjusterName: { type: "string" }');
    expect(routerSource).toContain('insurerName: String(parsed.insurerName ?? "").trim().slice(0, 160)');
    expect(routerSource).toContain('claimantName: String(parsed.claimantName ?? "").trim().slice(0, 160)');
    expect(routerSource).toContain('adjusterName: String(parsed.adjusterName ?? "").trim().slice(0, 160)');
  });

  it('offers the requested insurer choices and retains a custom insurer extracted from an estimate', () => {
    for (const insurer of ["Whip Claims Management", "Assurant Claim Management", "Klutch Insurance", "Total Recon", "Whip Inc.", "Metrocars Leasing Corp."]) {
      expect(pageSource).toContain(`"${insurer}"`);
    }
    expect(pageSource).toContain('Other / enter manually');
    expect(pageSource).toContain('function InsuranceCompanySelect');
  });

  it('maps parsed contact fields and exposes explicit formatted-PDF preview actions in both workflows', () => {
    expect(pageSource).toContain('carrier: parsed.insurerName || p.carrier');
    expect(pageSource).toContain('driver: parsed.claimantName || p.driver');
    expect(pageSource).toContain('adjusterName: parsed.adjusterName || p.adjusterName');
    expect(pageSource).toContain('claimantName: parsed.claimantName || p.claimantName');
    expect(pageSource).toContain('Preview formatted demand PDF');
    expect(pageSource).toContain('Preview formatted PDF');
  });
});
