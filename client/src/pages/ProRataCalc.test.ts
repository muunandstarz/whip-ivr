import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/ProRataCalc.tsx"), "utf8");

describe("Pro Rata calculator documents", () => {
  it("retains the claim allocation model and adds formatted PDF actions", () => {
    expect(source).toContain("function runCalc");
    expect(source).toContain("function genLetter");
    expect(source).toContain("const buildLetterPdf");
    expect(source).toContain("Preview PDF");
    expect(source).toContain("Download PDF");
    expect(source).toContain("Whip_ProRata_");
  });

  it("uses a neutral black and gray printable letter treatment", () => {
    expect(source).toContain('doc.setTextColor(20, 20, 20);');
    expect(source).toContain('doc.setDrawColor(180, 180, 180);');
    expect(source).toContain('doc.setTextColor(255, 98, 33);');
    expect(source).toContain('doc.text("whip", 14, 18);');
    expect(source).toContain("Internal claims handling document");
  });
});
