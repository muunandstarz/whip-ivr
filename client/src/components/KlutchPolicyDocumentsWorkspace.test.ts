// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KlutchPolicyDocumentsWorkspace from "./KlutchPolicyDocumentsWorkspace";

const h = vi.hoisted(() => ({
  ready: true, canEdit: false, error: null as Error | null,
  approved: { name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 1 },
  requireApproved: vi.fn(), issue: vi.fn(), record: vi.fn(), cancel: vi.fn(), text: vi.fn(), pdf: vi.fn(),
}));
vi.mock("@/hooks/useKlutchSignoff", async (original) => ({
  ...(await original<typeof import("@/hooks/useKlutchSignoff")>()),
  useKlutchSignoff: () => ({ signoff: h.ready ? h.approved : undefined, ready: h.ready, canEdit: h.ready && h.canEdit, error: h.error, identityKey: "test", requireApprovedSignoff: h.requireApproved }),
}));
const policy = { id: 1, policyNumber: "KIC-MD-TEST", leaseId: "TEST-CLAIM", state: "MD", effectiveOn: "2026-07-01", expiresOn: "2027-07-01", status: "active", terms: { memberName: "Synthetic Member", vehicle: "Synthetic Vehicle", vin: "TEST", memberNumber: "TEST", coverages: [], totalPremium: 35 } };
const invalidate = vi.fn(async () => {});
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ klutchPolicies: { list: { invalidate }, get: { invalidate } } }),
  klutchPolicies: {
    list: { useQuery: () => ({ data: [policy], refetch: vi.fn() }) },
    get: { useQuery: () => ({ data: { claims: [], documents: [] } }) },
    issue: { useMutation: () => ({ mutateAsync: h.issue, isPending: false }) },
    recordDocument: { useMutation: () => ({ mutateAsync: h.record, isPending: false }) },
    cancelAndRecord: { useMutation: () => ({ mutateAsync: h.cancel, isPending: false }) },
  },
} }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => React.createElement("select", { value, onChange: (event: any) => onValueChange(event.target.value) }, children),
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: any) => React.createElement("option", { value }, children),
}));
vi.mock("jspdf", () => ({ jsPDF: class {
  constructor() { h.pdf(); }
  setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {} line() {} addPage() {} addImage() {}
  text(...args: any[]) { h.text(...args); }
  splitTextToSize(text: string) { return [text]; }
  output() { return new Blob(["synthetic pdf"]); }
} }));
let host: HTMLDivElement; let root: Root;
async function render() { await act(async () => root.render(React.createElement(KlutchPolicyDocumentsWorkspace))); }
async function selectPolicy() {
  const select = host.querySelector("select")!;
  await act(async () => { select.value = "1"; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
function button(text: string) { const result = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text)); expect(result).toBeTruthy(); return result!; }
beforeEach(() => {
  (globalThis as any).React = React; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); h.ready = true; h.canEdit = false; h.error = null;
  h.approved = { name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 1 };
  h.requireApproved.mockImplementation(async () => { if (!h.ready) throw new Error("Approved sign-off unavailable"); return h.approved; });
  h.record.mockResolvedValue({ klutchClaimNumber: "KIC-TEST", deliveryStatus: "CREATED_NOT_SENT" });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Test omits logo"); }));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Klutch React compatibility workspace", () => {
  it("renders approved attribution read-only for handlers, other admins, and owners; only owner gets shared-setting link", async () => {
    await render(); await selectPolicy();
    for (const canEdit of [false, true]) {
      h.canEdit = canEdit; await render();
      const name = host.querySelector<HTMLInputElement>("#klutch-handler-name")!;
      const title = host.querySelector<HTMLInputElement>("#klutch-handler-title")!;
      expect(name.readOnly).toBe(true); expect(title.readOnly).toBe(true);
      expect(name.value).toBe(h.approved.name); expect(title.value).toBe(h.approved.title);
      expect(Boolean(host.querySelector('a[href="/kb/klutch-policy-documents"]'))).toBe(canEdit);
    }
  });

  it("normalizes current state after approval updates and uses canonical values in document snapshots and printed output", async () => {
    await render(); await selectPolicy();
    h.approved = { name: "Approved Owner Update", title: "Approved Shared Title", revision: 2 }; await render();
    expect(host.querySelector<HTMLInputElement>("#klutch-handler-name")?.value).toBe(h.approved.name);
    await act(async () => button("Create record & download").click());
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ snapshot: expect.objectContaining({ handlerName: h.approved.name, handlerTitle: h.approved.title, signer: h.approved.name, signerTitle: h.approved.title }) }));
    expect(h.text).toHaveBeenCalledWith(["Prepared by:", h.approved.name, h.approved.title], 15, expect.any(Number), expect.any(Object));
  });

  it("blocks issuance, previews, recording, and preview-download links while approval is unresolved or failed", async () => {
    h.ready = false; h.error = new Error("Offline"); await render();
    expect(button("Issue 12-month policy").disabled).toBe(true); expect(button("Preview declaration").disabled).toBe(true);
    await selectPolicy();
    expect(button("Preview PDF").disabled).toBe(true); expect(button("Create record & download").disabled).toBe(true);
    expect(host.querySelector("a[download]")).toBeNull();
    expect(host.querySelector<HTMLInputElement>("#klutch-handler-name")?.value).toBe("");
    expect(h.issue).not.toHaveBeenCalled(); expect(h.record).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled(); expect(h.pdf).not.toHaveBeenCalled();
  });

  it("fails closed if the last-moment canonical fetch fails, before creating any audit record or PDF", async () => {
    await render(); await selectPolicy();
    h.requireApproved.mockRejectedValueOnce(new Error("Canonical fetch failed"));
    await act(async () => button("Create record & download").click());
    expect(h.record).not.toHaveBeenCalled(); expect(h.pdf).not.toHaveBeenCalled();
  });
});
