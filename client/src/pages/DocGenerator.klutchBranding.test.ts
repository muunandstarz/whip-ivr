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
const coiSource = source.slice(source.indexOf('export function UnifiedCOITab'), source.indexOf('function KlutchDecPageTab'));
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
  addPage() {}
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

async function setInput(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
  expect(input, `Missing COI input ${id}`).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function downloadCertificate(carrierMode: "auto" | "metrocars", initialState = "MD") {
  await act(async () => root.render(React.createElement(UnifiedCOITab, { carrierMode, initialState })));
  await setInput("coi-issue-start-date", "2026-07-01");
  await setInput("coi-exp", "2026-12-31");
  await setInput("coi-certno", "TEST-1234");
  const download = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Download");
  expect(download).toBeTruthy();
  await act(async () => download!.click());
  // The measured renderer preserves contents but wraps at cell boundaries.
  return h.text.mock.calls.map(([text]) => String(text)).join(" ").replace(/\s+/g, " ").trim();
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
    expect(coiSource.includes('...(isKlutch ? [coiText(signoff!.name, 8, "bold"), coiText(signoff!.title, 7.5)] : [])'), 'COI sign-off must stay canonical and Klutch-only').toBe(true);
    expect(coiSource.includes('coiText(sigLine, 7.5, "italic")'), 'COI representative label must remain after the signer').toBe(true);
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
    expect(printed.indexOf("Morgan Ellis")).toBeLessThan(printed.indexOf("Liability Claims Specialist"));
    expect(printed.indexOf("Liability Claims Specialist")).toBeLessThan(printed.indexOf("Authorized Representative, Klutch Risk Retention Group"));
  });

  // Independent approved fixtures: do not read expected limits from renderer rules.
  it.each([
    ["MD", "$30,000", "$60,000", "$15,000", "$2,500"],
    ["VA", "$30,000", "$60,000", "$20,000", ""],
    ["FL", "$10,000", "$20,000", "$10,000", "$10,000"],
    ["GA", "$25,000", "$50,000", "$25,000", ""],
    ["IL", "$25,000", "$50,000", "$20,000", ""],
    ["MA", "$20,000", "$40,000", "$5,000", "$8,000"],
    ["PA", "$15,000", "$30,000", "$5,000", "$5,000"],
    ["TX", "$30,000", "$60,000", "$25,000", ""],
  ])("preserves exact printed coverage rows, date values, and legal wording for %s", async (state, biPP, biPO, pd, pip) => {
    for (const carrierMode of ["auto", "metrocars"] as const) {
      h.text.mockClear(); h.save.mockClear(); h.requireApproved.mockClear();
      const printed = await downloadCertificate(carrierMode, state);
      expect(h.save).toHaveBeenCalledOnce();
      expect(h.requireApproved).toHaveBeenCalledTimes(carrierMode === "auto" ? 1 : 0);
      const rows = [
        ["BI", "BODILY INJURY LIABILITY", `PER PERSON ${biPP} PER OCCURRENCE ${biPO}`],
        ["PD", "PROPERTY DAMAGE LIABILITY", `PER OCCURRENCE ${pd}`],
        ["UM", "UNINSURED MOTORIST (UM)", state === "FL" ? "REJECTED BY NAMED INSURED" : `PER PERSON ${biPP} PER OCCURRENCE ${biPO}`],
        ["UIM", "UNDERINSURED MOTORIST (UIM)", state === "FL" ? "NOT APPLICABLE" : `PER PERSON ${biPP} PER OCCURRENCE ${biPO}`],
        ["PIP", "PERSONAL INJURY PROTECTION (PIP)", pip ? `PER PERSON — STATUTORY MIN ${pip}` : "NOT REQUIRED IN THIS STATE"],
        ["COL", "PHYSICAL DAMAGE — COLLISION", "SUBJECT TO MEMBER AGREEMENT INCLUDED"],
        ["COMP", "PHYSICAL DAMAGE — COMPREHENSIVE", "SUBJECT TO MEMBER AGREEMENT INCLUDED"],
      ];
      for (const [code, type, limits] of rows) {
        const additionalInsured = ["BI", "PD", "COL", "COMP"].includes(code) || (state === "MD" && ["UM", "UIM"].includes(code));
        expect(printed, `${state}/${carrierMode}/${code}`).toContain(`${code} ${additionalInsured ? "[X]" : "[ ]"} ${type} TEST-1234 07/01/2026 12/31/2026 ${limits}`);
        expect(h.text.mock.calls.filter(([text]) => text === code)).toHaveLength(1);
      }
      expect(h.text.mock.calls.filter(([text]) => text === "07/01/2026")).toHaveLength(8); // header + seven coverage rows
      expect(h.text.mock.calls.filter(([text]) => text === "12/31/2026")).toHaveLength(7);
      expect(printed).toContain("COVERAGE PERIOD July 1, 2026 — December 31, 2026 STATE OF LOSS " + state);
      expect(printed).toContain("THIS CERTIFICATE IS ISSUED AS PROOF OF FINANCIAL RESPONSIBILITY PURSUANT TO MARYLAND TRANSPORTATION ARTICLE § 17-103. IT DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER COVERAGE AFFORDED BY THE " + (carrierMode === "auto" ? "POLICY ISSUED BY KLUTCH RISK RETENTION GROUP. COVERAGE IS SUBJECT TO ALL TERMS, CONDITIONS, AND EXCLUSIONS OF THE POLICY." : "SELF-INSURANCE PROGRAM. COVERAGE IS SUBJECT TO ALL TERMS, CONDITIONS, AND EXCLUSIONS OF THE PROGRAM."));
      expect(printed).toContain("THIS IS TO CERTIFY THAT THE COVERAGES LISTED BELOW HAVE BEEN ISSUED TO THE INSURED NAMED ABOVE FOR THE COVERAGE PERIOD INDICATED. NOTWITHSTANDING ANY REQUIREMENT, TERM OR CONDITION OF ANY CONTRACT OR OTHER DOCUMENT WITH RESPECT TO WHICH THIS CERTIFICATE MAY BE ISSUED OR MAY PERTAIN, THE COVERAGE AFFORDED IS SUBJECT TO ALL TERMS, EXCLUSIONS AND CONDITIONS OF THE POLICY. LIMITS SHOWN MAY HAVE BEEN REDUCED BY PAID CLAIMS.");
      expect(printed).toContain("3. During any TNC period in which Uber/Lyft coverage is primary, this certificate provides contingent coverage only to the extent not covered by the TNC carrier.");
      expect(printed).toContain("4. Unauthorized/unlisted operator exclusion applies. PIP and UM/UIM are provided at statutory minimums only, per applicable state law.");
      expect(printed).toContain("SHOULD ANY OF THE ABOVE DESCRIBED COVERAGES BE CANCELLED BEFORE THE EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE WITH APPLICABLE MARYLAND STATUTORY REQUIREMENTS AND THE TERMS OF THE MEMBER AGREEMENT.");
      if (carrierMode === "metrocars") expect(printed).not.toContain("Morgan Ellis");
    }
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
