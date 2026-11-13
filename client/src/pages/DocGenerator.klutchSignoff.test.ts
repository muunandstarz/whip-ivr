// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedCOITab } from "./DocGenerator";

const h = vi.hoisted(() => ({
  ready: true, name: "Approved Shared Name", title: "Approved Shared Title", revision: 4,
  requireApproved: vi.fn(), hook: vi.fn(), text: vi.fn(), save: vi.fn(), pdf: vi.fn(),
}));
vi.mock("@/hooks/useKlutchSignoff", () => ({ useKlutchSignoff: (enabled = true) => {
  h.hook(enabled);
  return { ready: enabled && h.ready, signoff: h.ready ? { name: h.name, title: h.title, revision: h.revision } : undefined, revision: h.revision, identityKey: "test", requireApprovedSignoff: h.requireApproved };
} }));
vi.mock("jspdf", () => ({ jsPDF: class {
  internal = { pageSize: { getWidth: () => 216, getHeight: () => 279 } };
  constructor() { h.pdf(); }
  setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {} line() {} rect() {} addImage() {}
  setFillColor() {}
  text(...args: any[]) { h.text(...args); }
  splitTextToSize(text: string) { return [text]; }
  output() { return "data:application/pdf;base64,c3ludGhldGlj"; }
  save(...args: any[]) { h.save(...args); }
} }));
let host: HTMLDivElement; let root: Root;
async function render(carrierMode: "auto" | "metrocars" = "auto") { await act(async () => root.render(React.createElement(UnifiedCOITab, { carrierMode }))); }
async function setIssueDate(value: string) {
  const input = host.querySelector<HTMLInputElement>("#coi-issue-start-date")!;
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
  expect(button).toBeTruthy(); await act(async () => button!.click());
}
beforeEach(() => {
  (globalThis as any).React = React; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); h.ready = true; h.name = "Approved Shared Name"; h.title = "Approved Shared Title"; h.revision = 4;
  h.requireApproved.mockImplementation(async () => { if (!h.ready) throw new Error("Canonical sign-off unavailable"); return { name: h.name, title: h.title, revision: h.revision }; });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("about:blank");
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("COI canonical Klutch-only attribution", () => {
  it("revalidates and prints the approved sign-off above the existing Klutch representative label", async () => {
    await render(); await setIssueDate("2026-07-01"); await click("Download");
    expect(h.requireApproved).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledOnce();
    expect(h.text).toHaveBeenCalledWith(h.name, expect.any(Number), expect.any(Number));
    expect(h.text).toHaveBeenCalledWith(h.title, expect.any(Number), expect.any(Number));
    expect(h.text).toHaveBeenCalledWith("Authorized Representative, Klutch Insurance Company", expect.any(Number), expect.any(Number));
  });

  it("blocks preview and download before constructing a PDF if the canonical sign-off has not loaded", async () => {
    h.ready = false; await render(); await setIssueDate("2026-07-01"); await click("Preview"); await click("Download");
    expect(h.pdf).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled(); expect(host.querySelector("iframe")).toBeNull();
  });

  it("blocks last-moment canonical query failure even with previously loaded approval", async () => {
    await render(); await setIssueDate("2026-07-01"); h.requireApproved.mockRejectedValueOnce(new Error("Offline")); await click("Download");
    expect(h.pdf).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  });

  it("does not query or add Klutch attribution to the fixed MetroCars certificate, even after the cutoff", async () => {
    h.ready = false; await render("metrocars"); await setIssueDate("2026-07-01"); await click("Download");
    expect(h.hook).toHaveBeenLastCalledWith(false); expect(h.requireApproved).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledOnce(); expect(h.text).toHaveBeenCalledWith("Authorized Representative", expect.any(Number), expect.any(Number));
    expect(h.text).not.toHaveBeenCalledWith(h.name, expect.any(Number), expect.any(Number));
    expect(h.text).not.toHaveBeenCalledWith(h.title, expect.any(Number), expect.any(Number));
  });

  it("preserves pre-cutoff automatic MetroCars issuance and removes old Klutch previews on approved revision changes", async () => {
    await render(); await setIssueDate("2026-06-30"); await click("Download"); expect(h.requireApproved).not.toHaveBeenCalled();
    await setIssueDate("2026-07-01"); await click("Preview"); expect(host.querySelector("iframe")).not.toBeNull();
    h.revision = 5; await render(); expect(host.querySelector("iframe")).toBeNull();
  });
});
