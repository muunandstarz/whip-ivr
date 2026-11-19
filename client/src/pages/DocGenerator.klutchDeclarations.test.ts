import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DocGenerator.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/WhipLayout.tsx", import.meta.url), "utf8");
const approvedTemplate = readFileSync(new URL("../../public/klutch-policy-declarations.html", import.meta.url), "utf8");
const coiSource = source.slice(source.indexOf('export function UnifiedCOITab'), source.indexOf('function KlutchDecPageTab'));

describe("Klutch declarations navigation", () => {
  it("moves Klutch policy documents to Knowledge Base and redirects legacy Document Generator links", () => {
    expect(source).not.toContain('{ id: "dec-page-whip", label: "Klutch — Dec Page"');
    expect(source).not.toContain('{ id: "klutch-policy-declarations", label: "Klutch — Policy Declarations (Approved)"');
    expect(source).not.toContain('{ id: "klutch-policy-documents", label: "Klutch Policy Documents"');
    expect(source).not.toContain('case "klutch-policy-documents": return <iframe');
    expect(source).toContain('navigate("/kb/klutch-policy-documents")');
    expect(source).toContain('"klutch-policy-declarations"');
    expect(source).toContain('return "klutch-policy-documents"');
    expect(app).toContain('<Route path="/kb/klutch-policy-documents" component={KlutchPolicyDocuments} />');
    expect(sidebar).toContain('{ href: "/kb/klutch-policy-documents", label: "Klutch Policy Documents", icon: FileText }');
  });

  it("uses one COI date control and one Declarations issue/subscription date for the rental-expiration calculator", () => {
    expect(source).toContain('label="Date Issued / Subscription Start Date" id="coi-issue-start-date"');
    expect(source).toContain('label="Date Issued / Subscription Start Date" id="dp-eff"');
    expect(source).toContain('startDateStr: form.subscriptionStartDate');
    expect(source).toContain('startDateStr: form.effectiveDate');
    expect(source).not.toContain('certDate: new Date().toISOString().slice(0, 10)');
    expect(coiSource.includes('coiText(fmtDate(form.subscriptionStartDate), 9, "bold", "right")'), 'COI issue date must use the entered subscription date').toBe(true);
    expect(coiSource.includes('new Date().toLocaleDateString("en-US")'), 'COI must not substitute today for an unentered issue date').toBe(false);
  });

  it("identifies Klutch with NAIC 17966 in the COI and approved Declarations insurer fields", () => {
    expect(coiSource.includes('coiText(isKlutch ? "Klutch Risk Retention Group · NAIC 17966" : "Maryland MVA / Self-Insured")'), 'COI insurer A must retain Klutch NAIC and MetroCars identity').toBe(true);
    expect(source).toContain('doc.text(doc.splitTextToSize("Klutch Risk Retention Group · NAIC 17966", sideW - 6), sideX + 3, syi);');
  });

  it("uses the Nashville mailing address and no Bobby signature in Klutch COI and Dec Page PDFs", () => {
    expect(source).toContain("424 Church Street, Suite 800");
    expect(source).toContain("Nashville, Tennessee 37219");
    expect(source).not.toContain("CEO_SIG_B64");
    expect(source).not.toContain("Bobby Taheri");
    expect(source).not.toContain('doc.text("P.O. Box 10622, Rockville, MD 20849", rm, y + 11');
    expect(source).not.toContain('doc.text("(855) 906-5949  |  claims@drivewhip.com", rm, y + 16');
    expect(approvedTemplate).toContain("424 Church Street, Suite 800");
    expect(approvedTemplate).toContain("Nashville, Tennessee 37219");
    expect(approvedTemplate).not.toContain("Bobby Taheri");
    expect(approvedTemplate).not.toContain("(855) 906-5949");
  });
});
