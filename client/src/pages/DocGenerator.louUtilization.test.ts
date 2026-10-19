import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");

describe("standalone Loss of Use utilization evidence", () => {
  it("renders the canonical server-provided percentage and source provenance", () => {
    expect(source).toContain("function formatLouUtilization(value: unknown): string");
    expect(source).toContain('r.dataStatus === "unavailable" ? "—" : formatLouUtilization(r.utilization)');
    expect(source).toContain("const utilizationSourceNote = louUtilizationSourceNote(utilRows);");
    expect(source).toContain("function louUtilizationEvidenceNote(snapshots: LouUtilizationSnapshot[]): string");
    expect(source).toContain("vehicle-availability inventory");
    expect(source).toContain("Reported occupancy");
    expect(source).toContain('doc.text(`$${louTotal}`, W - 16, y + 6.5, { align: "right" });');
  });

  it("uses one safe market-level row per monthly source snapshot rather than representing repeated daily telemetry or fleet availability", () => {
    expect(source).toContain("function summarizeLouUtilizationRows(rows: LouUtilizationRow[]): LouUtilizationSnapshot[]");
    expect(source).toContain("MONTHLY MARKET UTILIZATION INDICATOR");
    expect(source).toContain("const utilizationSnapshots = summarizeLouUtilizationRows(utilRows);");
    expect(source).toContain("const louUtilizationSnapshots = summarizeLouUtilizationRows(louUtilizationRows);");
    expect(source).toContain("The reported occupancy metric provides aggregate utilization context only");
    expect(source).toContain("it is not a substitute-vehicle availability ledger");
    expect(source).not.toContain("Reported unrented");
    expect(source).not.toContain("Rentable fleet");
    expect(source).not.toContain('doc.text(snapshot.dataStatus === "unavailable" ? "—" : String(snapshot.fleetCount)');
    expect(source).not.toContain("daily record${louUtilizationRows.length");
  });

  it("moves standalone legal support to a clean second page without repeating the Whip header", () => {
    const totalBox = source.indexOf('doc.text("TOTAL LOSS OF USE / RENTAL REIMBURSEMENT CLAIMED:", 16, y + 6.5);');
    const firstPageFooter = source.indexOf("addLetterFooter(doc);", totalBox);
    const secondPage = source.indexOf("doc.addPage();", firstPageFooter);
    const supportingPage = source.indexOf('"Loss of Use / Rental Reimbursement Supporting Basis"', totalBox);
    const legalBasis = source.indexOf('doc.text("Legal Basis — Tort / Third-Party Liability:", 14, y);', totalBox);

    expect(totalBox).toBeGreaterThan(-1);
    expect(firstPageFooter).toBeGreaterThan(totalBox);
    expect(secondPage).toBeGreaterThan(firstPageFooter);
    expect(supportingPage).toBeGreaterThan(secondPage);
    expect(legalBasis).toBeGreaterThan(supportingPage);
    expect(source).not.toContain('y = addWhipLetterhead(doc, "LOSS OF USE SUPPORTING BASIS"');
  });

  it("does not retain the prior recomputed 10,000% expression or unsupported range claim", () => {
    expect(source).not.toContain("((r.rented / r.fleet) * 100)");
    expect(source).not.toContain("ranging from 95% to 100% across Whip's operating history");
    expect(source).not.toContain('|| "98%"');
    expect(source).not.toContain('doc.setTextColor(23, 27, 49);\n    doc.setFontSize(11);\n    doc.text(`$${louTotal}`');
  });
});
