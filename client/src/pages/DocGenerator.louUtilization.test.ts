import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");

describe("standalone Loss of Use utilization evidence", () => {
  it("renders the canonical server-provided percentage and source provenance", () => {
    expect(source).toContain("function formatLouUtilization(value: unknown): string");
    expect(source).toContain('r.dataStatus === "unavailable" ? "—" : formatLouUtilization(r.utilization)');
    expect(source).toContain("const utilizationSourceNote = louUtilizationSourceNote(utilRows);");
    expect(source).toContain("Available Fleet");
    expect(source).toContain("Utilization is the report's stated Occupancy rate");
    expect(source).toContain('doc.text(`$${louTotal}`, W - 16, y + 6.5, { align: "right" });');
  });

  it("does not retain the prior recomputed 10,000% expression or unsupported range claim", () => {
    expect(source).not.toContain("((r.rented / r.fleet) * 100)");
    expect(source).not.toContain("ranging from 95% to 100% across Whip's operating history");
    expect(source).not.toContain('|| "98%"');
    expect(source).not.toContain('doc.setTextColor(23, 27, 49);\n    doc.setFontSize(11);\n    doc.text(`$${louTotal}`');
  });
});
