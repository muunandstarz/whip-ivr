import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/WhipLayout.tsx"), "utf8");

describe("Handler Productivity Dashboard navigation", () => {
  it("is visible in both admin and handler navigation and opens the Claude source independently", () => {
    expect(source.match(/label: "Handler Productivity Dashboard"/g)).toHaveLength(2);
    expect(source).toContain('href: "https://claude.ai/artifact/D4cSrZQwaMKCtiooyq8EQg"');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noreferrer"');
    expect(source).toContain("if (external)");
  });

  it("keeps the restored MetroCars COI limited to the active Liability handler context", () => {
    expect(source).toContain('label: "MetroCars COI · Liability"');
    expect(source).toContain("LIABILITY_COI_HANDLER_IDS");
    expect(source).toContain("canAccessMetroCarsCOI");
    expect(source).toContain("impersonating?.id");
  });

  it("adds the universally visible Training group as a new-window Claude artifact link", () => {
    expect(source).toContain('const TRAINING_NAV_ITEMS');
    expect(source).toContain('href: "https://claude.ai/artifact/HB6kQcvrK6H1KA2Xw2xcTJ"');
    expect(source).toContain('label: "Loss of Use & DV Training"');
    expect(source).toContain('Training');
    expect(source).toContain('GraduationCap');
  });
});
