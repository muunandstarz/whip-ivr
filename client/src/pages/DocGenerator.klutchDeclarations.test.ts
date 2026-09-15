import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DocGenerator.tsx", import.meta.url), "utf8");

describe("approved Klutch Declarations navigation", () => {
  it("keeps one approved entry and renders its interactive calculator instead of an isolated static iframe", () => {
    expect(source).not.toContain('{ id: "dec-page-whip", label: "Klutch — Dec Page"');
    expect(source).toContain('{ id: "klutch-policy-declarations", label: "Klutch — Policy Declarations (Approved)"');
    expect(source).toContain('case "klutch-policy-declarations": return <KlutchDecPageTab initialState={initialMemberState} />;');
    expect(source).toContain('if (t === "dec-page-whip") return "klutch-policy-declarations" as DocGenTab;');
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
