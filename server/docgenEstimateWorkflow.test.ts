import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const routerSource = fs.readFileSync(path.resolve(process.cwd(), 'server/routers/docgen.ts'), 'utf8');
const pageSource = fs.readFileSync(path.resolve(process.cwd(), 'client/src/pages/DocGenerator.tsx'), 'utf8');
const carrierAnalyzerSource = fs.readFileSync(path.resolve(process.cwd(), 'server/carrierRebuttalAnalysis.ts'), 'utf8');

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

  it('keeps adverse claim references out of our-estimate fields and supports a complete recipient address', () => {
    expect(routerSource).toContain('claimNumberRole');
    expect(routerSource).toContain('Never classify an adverse carrier claim number as our claim number');
    expect(pageSource).toContain('ourClaim: parsed.claimNumberRole !== "adverse"');
    expect(pageSource).toContain('claimNumber: data.estimate?.claimNumberRole === "our"');
    expect(pageSource).toContain('Carrier Mailing Address');
    expect(pageSource).toContain('form.carrierAddress || "[Carrier Mailing Address]"');
  });

  it('uses transient source analysis without saving original rebuttal uploads', () => {
    expect(pageSource).toContain('fetch("/api/carrier-rebuttal/analyze"');
    expect(pageSource).toContain('analyzed transiently and are never saved');
    expect(pageSource).toContain('no source file, storage key, or uploaded document is retained');
    expect(carrierAnalyzerSource).toContain('finally {\n    upload.bytes.fill(0);');
    expect(carrierAnalyzerSource.indexOf('try {\n    if (!isPdf && !isImage)')).toBeGreaterThan(-1);
  });

  it('requires accepted or not-disputed liability and reconciles the full estimate totals to the line variance', () => {
    expect(pageSource).toContain('whipEstimateTotal: string');
    expect(pageSource).toContain('carrierEstimateTotal: string');
    expect(pageSource).toContain('form.liabilityStatus !== "accepted" && form.liabilityStatus !== "not_disputed"');
    expect(pageSource).toContain('Math.abs(lineGap - gap) > 0.01');
    expect(pageSource).toContain('both estimate-line references, an exhibit letter/marked page, and a factual basis');
  });

  it('renders the specified evidence-centered letter order and dual PDF/Word output', () => {
    expect(pageSource).toContain('const createLetterPdf = () =>');
    expect(pageSource).toContain('Request for Reconsideration of Repair Estimate');
    expect(pageSource).toContain('const revisedPayment = () =>');
    expect(pageSource).toContain('const paymentParagraph = () =>');
    expect(pageSource).toContain('const reservationParagraph = () =>');
    expect(pageSource).toContain('const downloadWord = async () =>');
    expect(pageSource).toContain('Packer.toBlob(word)');
    expect(pageSource).toContain('sectionHeading("Revised payment", revisedPayment())');
    expect(pageSource).toContain('format: "a4"');
    expect(pageSource).toContain('size: { width: 11906, height: 16838 }');
    expect(pageSource).toContain('new ImageRun({ data: logoBytes, type: "png"');
    expect(pageSource).toContain('headers: { first: firstHeader, default: new Header({ children: [] }) }');
    expect(pageSource).toContain('Whip Carrier Reconsideration - ${form.claimNumber}');
  });

  it('keeps the Subro RE label distinct from the subject and removes honorifics from the salutation', () => {
    expect(pageSource).toContain('const reStart = lm + 8;');
    expect(pageSource).toContain('doc.text(reLines, reStart, y);');
    expect(pageSource).toContain('Dear ${form.adjusterName || form.carrier || "[Carrier / Adjuster]"},');
    expect(pageSource).not.toContain('Dear Mr./Ms. ${lastName}:');
  });

  it('matches the supplied letterhead reference with an A4 first-page logo and six-column dispute table', () => {
    expect(pageSource).toContain('doc.addImage(`data:image/png;base64,${WHIP_LOGO_B64}`, "PNG", left, 17, 18, 11.92)');
    expect(pageSource).toContain('const header = () =>');
    expect(pageSource).toContain('const col = [left, left + 8.5, left + 43.8, left + 64.1, left + 86.1, left + 105.5, tableRight];');
    expect(pageSource).toContain('"Support (attached)"');
    expect(pageSource).toContain('doc.setFillColor(231, 231, 231)');
    expect(pageSource).toContain('doc.text("Total in dispute"');
    expect(pageSource).toContain('cantSplit: true');
    expect(pageSource).toContain('tableHeader: true');
  });

  it('paginates rebuilt Carrier Rebuttals above a reserved footer and blocks packets over three pages', () => {
    expect(pageSource).toContain('const safeBottom = footerRuleY - 6.5;');
    expect(pageSource).toContain('const addPage = () => { footer(); doc.addPage();');
    expect(pageSource).toContain('Restore the body font\n      // before measuring');
    expect(pageSource).toContain('doc.setFont("helvetica", "normal"); doc.setFontSize(10);\n      const lines = doc.splitTextToSize(body, textWidth)');
    expect(pageSource).toContain('if (page > 3)');
    expect(pageSource).toContain('would exceed the three-page limit');
    expect(pageSource).toContain('const tableHeader = () =>');
    expect(pageSource).toContain('if (y + rowHeight > safeBottom) { addPage(); tableHeader(); }');
  });

  it('removes persisted LOU state before remounting the calculator on a global Clear Form action', () => {
    expect(pageSource).toContain('if (activeTab === "lou-calculator")');
    expect(pageSource).toContain('sessionStorage.removeItem("lou_calc_state")');
  });
});
