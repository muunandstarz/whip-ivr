import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../..");
const source = readFileSync(resolve(root, "client/src/pages/kb/MarketsAndPolicy.tsx"), "utf8");
const appSource = readFileSync(resolve(root, "client/src/App.tsx"), "utf8");
const navSource = readFileSync(resolve(root, "client/src/components/WhipLayout.tsx"), "utf8");

describe("Total Recon repair workspace", () => {
  it("exposes a direct Total Recon route and sidebar entry", () => {
    expect(appSource).toContain('<Route path="/kb/total-recon" component={MarketsAndPolicy} />');
    expect(navSource).toContain('{ href: "/kb/total-recon", label: "Total Recon Repairs", icon: Wrench }');
  });

  it("opens the direct route on the repair tab and renders the claimant pitch and finder", () => {
    expect(source).toContain('location === "/kb/total-recon" ? "repair" : "directory"');
    expect(source).toContain('<TotalReconRepairGuide />');
    expect(source).toContain('Find nearest Total Recon shop');
    expect(source).toContain('Scheduling & claim-file safeguards');
  });

  it("uses the expanded responsive content width rather than the former narrow padded shell", () => {
    expect(source).toContain('max-w-[1440px]');
    expect(source).toContain('px-3 py-5 sm:px-4 sm:py-6 lg:px-5 xl:px-6');
    expect(source).not.toContain('max-w-5xl mx-auto p-6 space-y-6');
  });
});
