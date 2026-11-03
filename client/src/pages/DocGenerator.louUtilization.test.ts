import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");
const renderer = readFileSync(resolve(process.cwd(), "client/src/lib/insuranceDirectPdf.ts"), "utf8");
const calculations = readFileSync(resolve(process.cwd(), "shared/insuranceDirect.ts"), "utf8");

describe("Insurance Direct standalone Loss of Use utilization evidence", () => {
  it("renders the canonical server-provided percentage and source provenance", () => {
    expect(source).toContain("function formatLouUtilization(value: unknown): string");
    expect(source).toContain('r.dataStatus === "unavailable" ? "—" : formatLouUtilization(r.utilization)');
    expect(source).toContain("const utilizationSourceNote = louUtilizationSourceNote(utilizationRows);");
    expect(source).toContain("reported unrented");
    expect(source).toContain("reported rentable fleet");
    expect(source).toContain("sourceNote: louUtilizationSourceNote(getUtilizationRows())");
  });

  it("uses one reconciled row per monthly source snapshot rather than representing repeated daily telemetry", () => {
    expect(source).toContain("function summarizeLouUtilizationRows(rows: LouUtilizationRow[]): LouUtilizationSnapshot[]");
    expect(source).toContain("MONTHLY FLEET UTILIZATION SNAPSHOTS");
    expect(source).toContain("const louUtilizationSnapshots = summarizeLouUtilizationRows(louUtilizationRows);");
    expect(renderer).toContain("Reported unrented");
    expect(renderer).toContain("not a daily rental log");
    expect(source).not.toContain("daily record${louUtilizationRows.length");
  });

  it("prints letterhead only on the first direct-demand page and closes before appending support", () => {
    expect(renderer.match(/letterhead\(layout, input.logoBase64\)/g)).toHaveLength(1);
    expect(renderer.indexOf("layout.blocksTogether(closing)")).toBeLessThan(renderer.indexOf("if (input.hasLou && input.attachLouSchedule) {"));
    expect(renderer).toContain("layout.newPage();");
    expect(renderer).toContain("footers(layout);");
    expect(renderer).not.toContain("Restatement");
  });

  it("reserves the footer band before every direct-demand paragraph and table row", () => {
    expect(renderer).toContain("const FOOTER_BAND = 24;");
    expect(renderer).toContain("this.bottom = doc.internal.pageSize.getHeight() - FOOTER_BAND;");
    expect(renderer).toContain("if (this.y + LINE_HEIGHT > this.bottom) this.newPage();");
    expect(renderer).toContain("layout.blocksTogether(closing);");
    expect(renderer).toContain("Adjusted loss of use calculation:");
    expect(renderer).toContain("must reconcile to days, rate, and supported utilization");
  });

  it("does not retain the prior recomputed 10,000% expression or unsupported range claim", () => {
    expect(source).not.toContain("((r.rented / r.fleet) * 100)");
    expect(source).not.toContain("ranging from 95% to 100% across Whip's operating history");
    expect(source).not.toContain('|| "98%"');
    expect(calculations).toContain('row.dataStatus === "reported"');
    expect(calculations).toContain("no 100% default or older-month fallback is used");
  });

  it("keeps the renamed standalone direct-demand path separate from the unchanged gross subrogation handoff", () => {
    expect(source).toContain('label: "Insurance Direct: Loss of Use"');
    expect(source).toContain("const directTotal = directMoney((hasLou ? directLou.amount : 0) + (hasDv ? dvAmount : 0));");
    expect(source).toContain("total: louTotal,");
    expect(source).toContain("Push Gross LOU to Subro Demand");
    expect(source).toContain("Preview Demand");
    expect(source).toContain("Download Demand Packet");
    expect(source).toContain("onDraftChange?.(draftData)");
    expect(source).toContain('sessionStorage.removeItem("lou_calc_state")');
  });

  it("uses a full-width grouped form selector on mobile and preserves the desktop navigation rail", () => {
    expect(source).toContain('aside className="hidden md:flex w-56');
    expect(source).toContain('htmlFor="docgen-mobile-form"');
    expect(source).toContain('id="docgen-mobile-form"');
    expect(source).toContain('<optgroup key={group.label} label={group.label}>');
    expect(source).toContain('className="p-3 sm:p-6"');
  });
});
