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
});
