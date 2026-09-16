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

  it('extracts carrier-response offer, reason, and reference fields for an editable rebuttal', () => {
    expect(routerSource).toContain('parseCarrierResponse: protectedProcedure');
    expect(routerSource).toContain('carrierClaimNumber: { type: "string" }');
    expect(routerSource).toContain('offerTotal: { type: "string" }');
    expect(routerSource).toContain('denialReasons: { type: "string" }');
    expect(routerSource).toContain('carrierOfferTotal: z.string().optional()');
    expect(routerSource).toContain("Carrier's stated position");
  });

  it('uses the carrier document to prefill the opposing claim details before generating an editable rebuttal', () => {
    expect(pageSource).toContain('const handleAnalyzeAndGenerate = async () =>');
    expect(pageSource).toContain('parseCarrierResponseMutation.mutateAsync');
    expect(pageSource).toContain('theirClaimNumber: response.carrierClaimNumber || nextForm.theirClaimNumber');
    expect(pageSource).toContain('carrierOfferTotal: response.offerTotal || nextForm.carrierOfferTotal');
    expect(pageSource).toContain('carrierReason: response.denialReasons || nextForm.carrierReason');
    expect(pageSource).toContain('2. Analyze uploads & generate editable rebuttal');
    expect(pageSource).toContain('Editable Rebuttal Draft');
  });

  it('keeps the Subro RE label distinct from the subject and removes honorifics from the salutation', () => {
    expect(pageSource).toContain('const reStart = lm + 8;');
    expect(pageSource).toContain('doc.text(reLines, reStart, y);');
    expect(pageSource).toContain('Dear ${form.adjusterName || form.carrier || "[Carrier / Adjuster]"},');
    expect(pageSource).not.toContain('Dear Mr./Ms. ${lastName}:');
  });

  it('removes persisted LOU state before remounting the calculator on a global Clear Form action', () => {
    expect(pageSource).toContain('if (activeTab === "lou-calculator")');
    expect(pageSource).toContain('sessionStorage.removeItem("lou_calc_state")');
  });
});
