import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { KLUTCH_DEFAULT_HANDLER_NAME, KLUTCH_DEFAULT_HANDLER_TITLE } from "../shared/klutchSignoff";

const workspace = fs.readFileSync("client/src/components/KlutchPolicyDocumentsWorkspace.tsx", "utf8");
const generator = fs.readFileSync("client/src/pages/DocGenerator.tsx", "utf8");
const legacyHtml = fs.readFileSync("client/public/klutch-policy-declarations.html", "utf8");

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Missing section end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

const preparedBy = 'writeReferenceLines(doc, ["Prepared by:", signer, signerTitle].filter(Boolean), 15, y + 8, 7.2, 3.8);';
const hookImport = 'from "@/hooks/useKlutchSignoff";';

describe("Klutch printed sign-off compatibility", () => {
  it("shares the requested name and title without adding signature assets", () => {
    expect(KLUTCH_DEFAULT_HANDLER_NAME).toBe("Morgan Ellis");
    expect(KLUTCH_DEFAULT_HANDLER_TITLE).toBe("Liability Claims Specialist");
    expect(workspace).toContain(hookImport);
    expect(generator).toContain(hookImport);
    expect(workspace).not.toContain("KLUTCH_DEFAULT_HANDLER_NAME");
    expect(generator).not.toContain("KLUTCH_DEFAULT_HANDLER_NAME");
  });

  it("normalizes workspace handler fields to the approved query and disallows per-document edits", () => {
    const defaults = section(workspace, "const [docForm, setDocForm]", "const activePolicy");
    expect(defaults).toContain('handlerName: signoff?.name ?? "",');
    expect(defaults).toContain('handlerTitle: signoff?.title ?? "",');
    expect(workspace).toContain("const signer = approved.name;");
    expect(workspace).toContain("const signerTitle = approved.title;");
    expect(workspace).toContain('value={docForm.handlerName} readOnly');
    expect(workspace).toContain('value={docForm.handlerTitle} readOnly');
    expect(workspace).not.toContain('setDocument("handlerName",');
    expect(workspace).not.toContain('setDocument("handlerTitle",');
    expect(workspace).toContain("normalizeKlutchDocumentSignoff(docForm, approved)");
    expect(workspace).toContain("approvedSignoff.canEdit");
    expect(workspace).toContain('href="/kb/klutch-policy-documents"');
  });

  it("uses the approved signer in all three letter closings, including cancellation", () => {
    const cancellation = section(workspace, 'if (kind === "cancellation_notice")', 'doc.text("ENDORSEMENT NO. KIC-END-002"');
    expect(cancellation).toContain('["Sincerely,", "", signer, signerTitle, "Klutch Insurance Company", "claims@klutchinsurance.com", "", "cc: Metrocars Leasing Corp"]');
    expect(cancellation).not.toContain('"Policy Services"');
    expect(workspace.match(/\["Sincerely,", "", signer, signerTitle,/g)).toHaveLength(3);
  });

  it("adds compact prepared-by text only to declarations page two and the endorsement final page", () => {
    const declarations = section(workspace, 'if (kind === "declarations")', 'if (kind === "tnc_denial")');
    const declarationsPageOne = declarations.slice(0, declarations.indexOf("doc.addPage();"));
    const declarationsPageTwo = declarations.slice(declarations.indexOf("doc.addPage();"));
    expect(declarationsPageOne).not.toContain('"Prepared by:"');
    expect(declarationsPageTwo).toContain(preparedBy);
    expect(declarationsPageTwo.indexOf(preparedBy)).toBeLessThan(declarationsPageTwo.indexOf("addReferenceFooter(doc);"));
    expect(declarations.match(/doc\.addPage\(\);/g)).toHaveLength(1);

    const endorsement = section(workspace, 'doc.text("ENDORSEMENT NO. KIC-END-002"', "function validatePreviewInputs()");
    const finalPage = endorsement.slice(endorsement.indexOf("doc.addPage();"));
    expect(endorsement.slice(0, endorsement.indexOf("doc.addPage();"))).not.toContain('"Prepared by:"');
    expect(finalPage).toContain(preparedBy);
    expect(finalPage.indexOf(preparedBy)).toBeLessThan(finalPage.indexOf("referenceFooter(2);"));
    expect(finalPage).toContain('"All other terms, conditions, and exclusions of the policy remain unchanged."');
    expect(endorsement.match(/doc\.addPage\(\);/g)).toHaveLength(1);
    expect(workspace.match(/"Prepared by:"/g)).toHaveLength(2);
  });

  it("prints Klutch name and title above the existing COI label inside the current box", () => {
    const representative = section(generator, '    if (isKlutch) {\n      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);', "    y += botH + 3;");
    expect(representative).toContain("doc.text(signoff!.name, cx2, y + 19);");
    expect(representative).toContain("doc.text(signoff!.title, cx2, y + 22);");
    expect(representative).toContain('const sigLine = isKlutch ? "Authorized Representative, Klutch Insurance Company" : "Authorized Representative";');
    expect(representative).toContain("doc.text(sigLine, cx2, y + 25);");
    expect(representative).not.toMatch(/addImage|addPage|\.line\(|\.path\(|certif(?:y|ied)|autograph/i);
  });

  it("leaves the generic MetroCars cancellation and representative text and geometry exactly unchanged", () => {
    const cancellation = section(generator, "    // Cancellation\n    const cx2", "    y += botH + 3;");
    const klutchOnly = `    if (isKlutch) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(signoff!.name, cx2, y + 19);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text(signoff!.title, cx2, y + 22);
    }
`;
    expect(cancellation).toContain(klutchOnly);
    expect(cancellation.replace(klutchOnly, "")).toBe(`    // Cancellation
    const cx2 = lm + textW * 0.4 + 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(80, 80, 80);
    doc.text("CANCELLATION", cx2, y + 3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(0, 0, 0);
    const cancelText = "SHOULD ANY OF THE ABOVE DESCRIBED COVERAGES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH APPLICABLE MARYLAND STATUTORY REQUIREMENTS AND THE TERMS OF THE MEMBER AGREEMENT.";
    doc.text(cancelText, cx2, y + 8, { maxWidth: textW * 0.6 - 4 });
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(0, 0, 0);
    const sigLine = isKlutch ? "Authorized Representative, Klutch Insurance Company" : "Authorized Representative";
    doc.text(sigLine, cx2, y + 25);
`);
    expect(generator).toContain(`    const botH = 28;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
    doc.rect(lm, y, textW, botH);
    doc.line(lm + textW * 0.4, y, lm + textW * 0.4, y + botH);`);
    expect(generator).toContain('doc.text(`Metrocars Leasing Corp  ·  ${form.certNumber || "—"}  ·  P.O. Box 10622, Rockville MD 20850  ·  (855) 906-5949  ·  claims@drivewhip.com  ·  © Metrocars Leasing Corp ${new Date().getFullYear()}`, W / 2, y, { align: "center" });');
  });

  it("places legacy PDF representative text beside the existing date, before the footer", () => {
    const representative = section(generator, 'doc.text("Authorized representative", lm, y);', "  // ── Sidebar page 2");
    expect(representative).toContain("doc.text(signoff.name, lm, y + 8);");
    expect(representative).toContain("doc.text(signoff.title, lm, y + 13);");
    expect(representative).toContain("doc.text(fmtDate(form.effectiveDate), lm + 75, y + 8);");
    expect(representative).toContain('doc.text("Date Issued", lm + 75, y + 14);');
    expect(representative).not.toMatch(/addImage|H -|addPage|\.path\(/);
    const footer = section(generator, "  // Footer page 2", "  setPreviewPdfUrl(getPDFDataUrl(doc));");
    expect(footer).not.toContain("KLUTCH_DEFAULT_HANDLER_");
  });

  it("keeps legacy HTML name and title in the same compact flex row as Date Issued", () => {
    const representative = section(legacyHtml, '<div class="section-head">Authorized representative</div>', '    <div class="sidebar">');
    expect(representative).toContain('<div style="display:flex; gap:36px; margin-top:22px;">');
    expect(representative).toContain('<div style="align-self:center; line-height:1.35;">');
    expect(representative).toContain('<div style="font-size:11px; font-weight:600;">Morgan Ellis</div>');
    expect(representative).toContain('<div style="font-size:10px; color:#666;">Liability Claims Specialist</div>');
    expect(representative).toContain('id="d_issued">—</div>');
    expect(representative).toContain('margin-top:3px;">Date Issued</div>');
    expect(representative.indexOf(KLUTCH_DEFAULT_HANDLER_TITLE)).toBeLessThan(representative.indexOf('id="d_issued"'));
    expect(representative).not.toMatch(/<img|<svg|<canvas|certif(?:y|ied)|autograph/i);
    expect(legacyHtml.match(/Morgan Ellis/g)).toHaveLength(1);
    expect(legacyHtml.match(/Liability Claims Specialist/g)).toHaveLength(1);
  });
});
