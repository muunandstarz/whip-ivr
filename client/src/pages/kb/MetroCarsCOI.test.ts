import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/kb/MetroCarsCOI.tsx"), "utf8");
const layout = readFileSync(resolve(process.cwd(), "client/src/components/WhipLayout.tsx"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const docgen = readFileSync(resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");

describe("MetroCars COI liability workspace", () => {
  it("registers a dedicated Knowledge Base route and sidebar entry only for effective Liability handlers", () => {
    expect(routes).toContain('path="/kb/metrocars-coi"');
    expect(layout).toContain('label: "MetroCars COI · Liability"');
    expect(layout).toContain("LIABILITY_COI_HANDLER_IDS");
    expect(layout).toContain("const effectiveHandlerId = isImpersonating ? impersonating?.id : user.handlerProfileId");
    expect(layout).toContain("canAccessMetroCarsCOI");
  });

  it("locks the restored certificate workflow to MetroCars and provides a restricted-state explanation", () => {
    expect(page).toContain('carrierMode="metrocars"');
    expect(page).toContain("MetroCars COI is restricted to the Liability Team");
    expect(page).toContain("Liability Team Only");
    expect(docgen).toContain('carrierMode?: "auto" | "metrocars"');
    expect(docgen).toContain('carrierMode === "metrocars"');
    expect(docgen).toContain("This Liability Team workspace is fixed to MetroCars.");
  });
});
