import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DocGenerator.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/WhipLayout.tsx", import.meta.url), "utf8");

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
    expect(source).toContain('doc.text(fmtDate(form.subscriptionStartDate) || new Date().toLocaleDateString("en-US"), rm, y + 7, { align: "right" });');
  });

  it("identifies Klutch with NAIC 17966 in the COI and approved Declarations insurer fields", () => {
    expect(source).toContain('doc.text("Klutch Insurance Company · NAIC 17966", c3x + 14, y + 7);');
    expect(source).toContain('doc.text("Klutch Insurance Company · NAIC 17966", sideX + 3, syi);');
  });
});
