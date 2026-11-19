// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedCOITab } from "./DocGenerator";

const source = readFileSync(path.resolve("client/src/pages/DocGenerator.tsx"), "utf8");
const workspace = readFileSync(path.resolve("client/src/components/KlutchPolicyDocumentsWorkspace.tsx"), "utf8");
const declarations = readFileSync(path.resolve("client/public/klutch-policy-declarations.html"), "utf8");
const h = vi.hoisted(() => ({ requireApproved: vi.fn(), text: vi.fn(), save: vi.fn() }));
vi.mock("@/hooks/useKlutchSignoff", () => ({ useKlutchSignoff: (enabled = true) => ({
  ready: enabled,
  signoff: { name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 1 },
  revision: 1,
  identityKey: "branding-test",
  requireApprovedSignoff: h.requireApproved,
}) }));
vi.mock("jspdf", () => ({ jsPDF: class {
  internal = { pageSize: { getWidth: () => 216, getHeight: () => 279 } };
  setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {} line() {} rect() {} addImage() {} setFillColor() {}
  text(...args: unknown[]) { h.text(...args); }
  splitTextToSize(text: string) { return [text]; }
  output() { return "data:application/pdf;base64,c3ludGhldGlj"; }
  save(...args: unknown[]) { h.save(...args); }
} }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.requireApproved.mockResolvedValue({ name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 1 });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-branding-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function downloadCertificate(carrierMode: "auto" | "metrocars") {
  await act(async () => root.render(React.createElement(UnifiedCOITab, { carrierMode })));
  const issueDate = host.querySelector<HTMLInputElement>("#coi-issue-start-date")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(issueDate, "2026-07-01");
    issueDate.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const download = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Download");
  expect(download).toBeTruthy();
  await act(async () => download!.click());
  return h.text.mock.calls.map(([text]) => String(text)).join("\n");
}

describe("Klutch printed Risk Retention Group branding", () => {
  it("replaces issuer text in scoped renderers while retaining historic dropdown values", () => {
    for (const content of [source, workspace, declarations]) {
      expect(content).not.toMatch(/Klutch Insurance Company|KLUTCH INSURANCE COMPANY/);
      expect(content).toContain("Klutch Risk Retention Group");
      expect(content).toContain("424 Church Street, Suite 800");
      expect(content).toContain("Nashville, Tennessee 37219");
      expect(content).toContain("17966");
      expect(content).toContain("claims@klutchinsurance.com");
    }
    expect(source).toContain('"Klutch Insurance",');
    expect(source).toContain('set("carrier")("klutch")');
    expect(workspace).toContain("Form KIC-END-002 (Ed. 07/26)");
    expect(declarations).toContain("KLUTCH RISK RETENTION GROUP");
  });

  it("keeps the compatibility logo genuinely transparent and gives logos the exact brand alt label", () => {
    const compatibilityLogo = workspace.match(/<img src=\{KLUTCH_LOGO_URL\}[^>]*>/)?.[0];
    expect(compatibilityLogo).toContain('alt="Klutch Risk Retention Group"');
    expect(compatibilityLogo).not.toMatch(/bg-white|background/);
    const declarationLogos = declarations.match(/<img class="klutch-logo"[^>]*>/g) ?? [];
    expect(declarationLogos).toHaveLength(2);
    for (const logo of declarationLogos) expect(logo).toContain('alt="Klutch Risk Retention Group"');
    expect(source).toContain('alt="Klutch Risk Retention Group"');
    for (const content of [source, workspace, declarations]) {
      expect(content).toContain("/manus-storage/klutch-risk-retention-group-print_94cb75e0.png");
    }
    const png = Buffer.from(source.match(/const KLUTCH_LOGO_B64 = "([^"]+)";/)![1], "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1056);
    expect(png.readUInt32BE(20)).toBe(372);
    expect(png[25]).toBe(6); // PNG RGBA color type preserves the alpha channel.
    expect(source).not.toContain('doc.rect(0, 0, 70, 22, "F");\n    try');
  });

  it("retains approved sign-off hooks, read-only signer controls, and declaration print geometry", () => {
    expect(workspace).toContain("const signer = approved.name;");
    expect(workspace).toContain("const signerTitle = approved.title;");
    expect(workspace).toContain("value={docForm.handlerName} readOnly");
    expect(workspace).toContain("value={docForm.handlerTitle} readOnly");
    expect(source).toContain("useKlutchSignoff(isKlutch)");
    expect(source).toContain('doc.text(signoff!.name, cx2, y + 19);');
    expect(source).toContain('doc.text(signoff!.title, cx2, y + 22);');
    expect(declarations).toContain("@page { size: letter; margin: 0; }");
    expect(declarations).toContain("height: 11in;");
    expect(declarations).toContain(".klutch-logo { height: 48px !important; width: 120px !important;");
    expect(source).toContain('doc.addImage(KLUTCH_LOGO_B64, "PNG", lm, y + 1, 10 * (1056 / 372), 10)');
    expect(source).toContain('doc.addImage(KLUTCH_LOGO_B64, "PNG", rm - 10 * (1056 / 372), y, 10 * (1056 / 372), 10)');
    expect(workspace).toContain("width, width * (372 / 1056)");
  });

  it("prints the full new issuer name, unchanged carrier details, and Morgan approval on a Klutch COI", async () => {
    const printed = await downloadCertificate("auto");
    expect(h.requireApproved).toHaveBeenCalledOnce();
    expect(h.save).toHaveBeenCalledOnce();
    expect(printed).toContain("Issued by Klutch Risk Retention Group");
    expect(printed).toContain("KLUTCH RISK RETENTION GROUP");
    expect(printed).toContain("Klutch Risk Retention Group · NAIC 17966");
    expect(printed).toContain("Authorized Representative, Klutch Risk Retention Group");
    expect(printed).toContain("Morgan Ellis");
    expect(printed).toContain("Liability Claims Specialist");
    expect(printed).toContain("424 Church Street, Suite 800");
    expect(printed).toContain("Nashville, Tennessee 37219");
    expect(printed).toContain("claims@klutchinsurance.com");
    expect(printed).not.toMatch(/Klutch Insurance Company|KLUTCH INSURANCE COMPANY/);
  });

  it("leaves fixed MetroCars issuance and representative attribution unchanged", async () => {
    const printed = await downloadCertificate("metrocars");
    expect(h.requireApproved).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledOnce();
    expect(printed).toContain("Metrocars Leasing Corp");
    expect(printed).toContain("Maryland MVA / Self-Insured");
    expect(h.text).toHaveBeenCalledWith("Authorized Representative", expect.any(Number), expect.any(Number));
    expect(printed).not.toContain("Klutch Risk Retention Group");
    expect(printed).not.toContain("Morgan Ellis");
  });
});
