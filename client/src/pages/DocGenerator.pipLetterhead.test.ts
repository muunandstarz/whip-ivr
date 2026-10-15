import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");

describe("PIP PDF letterhead", () => {
  it("uses the dedicated neutral PIP letterhead instead of the compact shared header", () => {
    expect(source).toContain("function addPipLetterhead(doc: jsPDF)");
    expect(source).toContain("function addPipLetterFooter(doc: jsPDF)");
    expect(source).toContain("WHIP CLAIMS MANAGEMENT");
    expect(source).toContain("P.O. Box 10622 · Rockville, MD 20850");
    expect(source).toContain('<PipBillReviewWorkflow addLetterhead={addPipLetterhead} addFooter={addPipLetterFooter} />');
  });
});
