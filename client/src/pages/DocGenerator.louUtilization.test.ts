import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");
const renderer = readFileSync(resolve(process.cwd(), "client/src/lib/insuranceDirectPdf.ts"), "utf8");
const normalLou = readFileSync(resolve(process.cwd(), "client/src/lib/standaloneLouPdf.ts"), "utf8");
const calculations = readFileSync(resolve(process.cwd(), "shared/insuranceDirect.ts"), "utf8");
const standalone = source.slice(source.indexOf("function LOUCalculatorTab("), source.indexOf("// ─── Tab: Medical Bill Review"));

describe("Insurance Direct standalone Loss of Use calculator and evidence", () => {
  it("renders canonical server percentages and source provenance without recomputing occupancy", () => {
    expect(source).toContain("function formatLouUtilization(value: unknown): string");
    expect(source).toContain('r.dataStatus === "unavailable" ? "—" : formatLouUtilization(r.utilization)');
    expect(source).toContain("const utilizationSourceNote = louUtilizationSourceNote(utilizationRows);");
    expect(source).toContain("reported unrented");
    expect(source).toContain("reported rentable fleet");
    expect(standalone).toContain("sourceNote: louUtilizationSourceNote(getUtilizationRows())");
    expect(source).not.toContain("((r.rented / r.fleet) * 100)");
    expect(source).not.toContain('|| "98%"');
  });

  it("preserves one monthly-source snapshot rather than representing repeated daily telemetry", () => {
    expect(source).toContain("function summarizeLouUtilizationRows(rows: LouUtilizationRow[]): LouUtilizationSnapshot[]");
    expect(source).toContain("MONTHLY FLEET UTILIZATION SNAPSHOTS");
    expect(normalLou).toContain("Reported unrented");
    expect(normalLou).toContain("not a daily tracking feed");
    expect(source).not.toContain("daily record${louUtilizationRows.length");
  });

  it("prints letterhead only on page one and reserves the footer band before all paragraphs and table rows", () => {
    expect(renderer.match(/letterhead\(layout, input.logoBase64\)/g)).toHaveLength(1);
    expect(renderer.indexOf("layout.blocksTogether(closing)")).toBeLessThan(renderer.indexOf("if (input.hasLou && input.attachLouSchedule) {"));
    expect(renderer).toContain("const FOOTER_BAND = 24;");
    expect(renderer).toContain("this.bottom = doc.internal.pageSize.getHeight() - FOOTER_BAND;");
    expect(renderer).toContain("if (this.y + LINE_HEIGHT > this.bottom) this.newPage();");
    expect(renderer).toContain("footers(layout);");
  });

  it("carries the existing days times rate amount to the direct letter without applying or requiring occupancy", () => {
    expect(standalone).toContain("const louTotal = (days * effectiveRate).toFixed(2);");
    expect(standalone).toContain("calculateDirectLou({ days, dailyRate: effectiveRate })");
    expect(standalone).toContain("louAmount: hasLou ? directLou.amount : 0");
    expect(standalone).not.toContain("utilizationOverride");
    expect(standalone).not.toContain("utilizationPercent");
    expect(calculations).not.toContain("gross * percent");
    expect(renderer).not.toContain("adjusted by the fleet utilization rate");
  });

  it("starts with an independent calculator and carries its total into the uploaded letter form", () => {
    expect(standalone).toContain("const [showDemand, setShowDemand] = useState(false)");
    expect(standalone).toContain('id="lou-calculator-total"');
    expect(standalone).toContain('id="lou-use-in-letter"');
    expect(standalone).toContain("Push LOU to Active-Claim Cover Letter");
    expect(standalone).toContain("Preview Cover Letter + LOU Packet");
    expect(standalone).toContain("Download Cover Letter + LOU Packet");
    expect(standalone).toContain("createStandaloneLouPdf(louRecord)");
    expect(standalone).toContain("Preview LOU Form");
    expect(standalone).toContain("Download LOU Form");
    expect(standalone).not.toContain('onNavigate("subro-demand")');
    expect(standalone).not.toContain("LOU_DEMAND_HANDOFF_KEY");
    expect(standalone).not.toContain("Push LOU to Subro Demand");
    expect(renderer).toContain("appendStandaloneLouForm(doc, record");
    expect(normalLou).toContain("appendStandaloneLouForm(doc, input");
    expect(source).toContain('sessionStorage.removeItem("lou_calc_state")');
    expect(standalone).toContain("onDraftChange?.(draftData)");
  });

  it("uses manually entered DV without deriving or importing a valuation", () => {
    expect(standalone).toContain("const dvAmount = directMoney(directDraft.dvAmount);");
    expect(standalone).toContain('id="lou-dv-amount"');
    expect(standalone).not.toContain("directMoney(directDraft.prelossValue) - directMoney(directDraft.postlossValue)");
    expect(standalone).toContain("They never set or change the manual DV amount");
    const insuranceGroup = source.slice(source.indexOf('label: "Insurance Direct",'), source.indexOf('label: "Medical Review",'));
    const subroGroup = source.slice(source.indexOf('label: "Subrogation",'), source.indexOf('label: "Insurance Direct",'));
    expect(insuranceGroup).toContain('id: "dv-calculator"');
    expect(subroGroup).not.toContain('id: "dv-calculator"');
  });

  it("offers editable liability examples rather than automatically claiming carrier acceptance", () => {
    expect(standalone).toContain('id="lou-liability-example"');
    expect(standalone).toContain("Use example in editable statement");
    expect(standalone).toContain("Selecting an example does not verify liability or insert it automatically");
    expect(standalone).toContain("Repair payment alone is not treated as carrier acceptance");
    expect(standalone).toContain('setDirect("liabilityStatement", example.text)');
  });

  it("uses a full-width grouped form selector on mobile and preserves desktop navigation", () => {
    expect(source).toContain('aside className="hidden md:flex w-56');
    expect(source).toContain('htmlFor="docgen-mobile-form"');
    expect(source).toContain('<optgroup key={group.label} label={group.label}>');
    expect(source).toContain('className="p-3 sm:p-6"');
  });
});
