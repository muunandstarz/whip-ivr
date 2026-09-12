import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");
const start = source.indexOf("function BlankLetterheadTab() {");
const end = source.indexOf("// ─── Tab: Claimant Contact", start);
const blankLetterhead = source.slice(start, end);

describe("Blank Letterhead modular composer", () => {
  it("exposes independently enabled standard sections and custom areas", () => {
    expect(blankLetterhead).toContain("const [enabledSections");
    expect(blankLetterhead).toContain("const [customSections");
    expect(blankLetterhead).toContain("Add an area");
    expect(blankLetterhead).toContain("toggleCore");
    expect(blankLetterhead).toContain("removeCustom");
  });

  it("keeps section order editable for both preview and downloaded PDF", () => {
    expect(blankLetterhead).toContain("const [sectionOrder");
    expect(blankLetterhead).toContain("moveSection");
    expect(blankLetterhead).toContain(".filter(isEnabled)");
    expect(blankLetterhead).toContain("for (const id of sectionOrder)");
  });

  it("builds a browser-safe formatted preview automatically as the draft changes", () => {
    expect(blankLetterhead).toContain("const buildDocument = useCallback");
    expect(blankLetterhead).toContain("setPreviewPdfUrl");
    expect(blankLetterhead).toContain("URL.revokeObjectURL");
    expect(blankLetterhead).toContain("Updates as you type");
  });
});
