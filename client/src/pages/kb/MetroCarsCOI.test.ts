import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = (file: string) => readFileSync(file, "utf8");
const page = read("client/src/pages/kb/MetroCarsCOI.tsx");
const original = read("client/src/pages/kb/LegacyMetroCarsCOI.tsx");
const layout = read("client/src/components/WhipLayout.tsx");
const routes = read("client/src/App.tsx");

describe("MetroCars primary ACORD and owner-only original certificate", () => {
  it("keeps the existing staff URL and switches it to the locked MetroCars minimum ACORD preset", () => {
    expect(routes).toContain('path="/kb/metrocars-coi" component={MetroCarsCOI}');
    expect(page).toContain('<AcordCertificateBuilder initialPreset="metrocars-minimum" lockedPreset="metrocars-minimum" initialState="MD" />');
    expect(page).not.toContain("UnifiedCOITab");
    expect(page).toContain("PIP is not included in this liability certificate.");
    expect(layout).toContain('label: "MetroCars ACORD COI · Liability"');
  });
  it("retains effective Liability access and prevents Admin privileges leaking into unrelated handler previews", () => {
    expect(page).toContain('(user?.role === "admin" && !isImpersonating) ||');
    expect(layout).toContain('const canAccessMetroCarsCOI = (isAdmin && !isImpersonating) ||');
    expect(page).toContain("LIABILITY_COI_HANDLER_IDS");
    expect(layout).toContain("impersonating?.id");
  });
  it("preserves the custom renderer at a distinct server-checked owner-only route", () => {
    expect(routes).toContain('path="/kb/metrocars-coi-original" component={LegacyMetroCarsCOI}');
    expect(original).toContain('carrierMode="metrocars"');
    expect(original).toContain("trpc.kb.originalMetroCarsCoiAccess.useQuery");
    expect(original).toContain("!isImpersonating && !isError");
    expect(original).toContain("access.viewerId === user.id");
    expect(original).toContain("if (!hasOwnerAccess)");
  });
  it("renders a genuinely disabled gray original-form button rather than a hidden active anchor for nonowners", () => {
    expect(layout).toContain("canUseOriginalMetroCarsCoi ? (");
    expect(layout).toContain('disabled aria-disabled="true"');
    expect(layout).toContain("text-white/25 cursor-not-allowed");
    expect(layout).toContain('href="/kb/metrocars-coi-original"');
    expect(layout).toContain("certificateAccess?.viewerId === user.id");
  });
});
