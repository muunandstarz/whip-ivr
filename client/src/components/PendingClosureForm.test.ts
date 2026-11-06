// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableIframePageLoading":true}}}
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pdf: vi.fn(), download: vi.fn(), draft: vi.fn(), copy: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/pendingClosurePdf", () => ({ createPendingClosurePdf: mocks.pdf }));
vi.mock("@/lib/receiptBrowser", () => ({ downloadReceipt: mocks.download }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast, error: mocks.toast } }));
import PendingClosureForm from "./PendingClosureForm";
import { emptyPendingClosureFields } from "@shared/pendingClosure";
const complete = { ...emptyPendingClosureFields(), letter_date: "2026-11-06", claimant_name: "Sample Claimant", claimant_address: "100 Example St\nRockville, MD 20850", claim_number: "TST-0000-111111-555555", date_of_loss: "2026-10-01", last_contact_date: "2026-10-30", additional_info_needed: "Please send the missing photographs.", response_days: "14", handler_name: "Sample Handler", handler_title: "Claims Handler" };
let root: Root; let container: HTMLDivElement;
const button = (name: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === name || b.textContent?.endsWith(name))!;
async function click(element: HTMLElement) { await act(async () => { element.click(); }); }
async function change(id: string, value: string) {
  await act(async () => {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#${id}`)!;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function mount(fields: unknown = complete, extra = {}) {
  await act(async () => { root.render(React.createElement(PendingClosureForm, { initialDraft: { pendingClosureFields: fields, ...extra }, onDraftChange: mocks.draft, logoBase64: "test-logo" })); });
}
beforeEach(async () => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.values(mocks).forEach(m => m.mockReset());
  mocks.pdf.mockReturnValue({ output: () => new Blob(["sample"], { type: "application/pdf" }) });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pending-closure-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.copy.mockResolvedValue(undefined) } });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Pending Closure Letter workflow", () => {
  it("exposes every source field, blank identities and a generic non-deadline paragraph", async () => {
    await mount({});
    expect(container.querySelector<HTMLInputElement>("#pc-claimant_name")!.value).toBe("");
    expect(container.querySelector<HTMLTextAreaElement>("#pc-sol_language")!.value).toContain("may be subject");
    expect(container.querySelector("#pc-response_days")!.getAttribute("max")).toBe("365");
    expect(container.textContent).toContain("does not close a claim");
    expect(container.querySelectorAll('select#pc-sol-state option')).toHaveLength(52);
  });
  it("allows placeholder preview but does not download an incomplete final letter", async () => {
    await mount({}); await click(button("Preview letter"));
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ claimant_name: "" }), { logoBase64: "test-logo", draft: true });
    expect(container.querySelector("iframe")).not.toBeNull();
    await click(button("Download PDF")); expect(mocks.download).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Claimant");
  });
  it("downloads a completed same-record PDF without any receipt/claim issuance", async () => {
    await mount(); await click(button("Download PDF"));
    expect(mocks.pdf).toHaveBeenCalledWith(complete, { logoBase64: "test-logo", draft: false });
    expect(mocks.download).toHaveBeenCalledWith("blob:pending-closure-test", "Whip_Pending_Closure_TST-0000-111111-555555.pdf");
  });
  it("clears a stale PDF on a field edit and revokes the owned Blob", async () => {
    await mount(); await click(button("Preview letter")); await change("pc-claimant_name", "Updated Claimant");
    expect(container.querySelector("iframe")).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pending-closure-test");
  });
  it("never replaces time-limits language or calculates expiry on a state selection", async () => {
    await mount(); await change("pc-sol-state", "AL");
    expect(container.querySelector<HTMLTextAreaElement>("#pc-sol_language")!.value).toBe(complete.sol_language);
    expect(container.textContent).toContain("VERIFY"); expect(container.textContent).toContain("sources split");
    await change("pc-sol-state", "CA"); expect(container.textContent).toContain("CA RULE");
    expect(container.textContent).toContain("Not met by this form letter alone");
    await change("pc-sol-state", "MD"); expect(container.textContent).toContain("not counsel-approved");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("copies the supplied email, allows editing, and resets stale custom wording after claim changes", async () => {
    await mount(); await click(button("Accompanying email"));
    expect(container.querySelector<HTMLInputElement>("#pc-email-subject")!.value).toContain(complete.claim_number);
    await change("pc-email-body", "Custom message"); await click(button("Copy email"));
    expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining("Custom message"));
    await change("pc-claimant_name", "Different Claimant");
    expect(container.querySelector<HTMLTextAreaElement>("#pc-email-body")!.value).toContain("Different Claimant,");
    expect(container.querySelector<HTMLTextAreaElement>("#pc-email-body")!.value).toContain("is being sent to you separately");
  });
  it("saves only input text and optional state-reference selection, never PDF URLs or bytes", async () => {
    await mount(complete, { pdfUrl: "private-upload", sourceBytes: "private-bytes" }); await click(button("Preview letter"));
    const value = mocks.draft.mock.calls.at(-1)![0];
    expect(value.pendingClosureFields).toEqual(complete);
    expect(Object.keys(value).sort()).toEqual(["emailBodyOverride", "emailSubjectOverride", "pendingClosureFields", "solReferenceState"]);
    expect(JSON.stringify(value)).not.toMatch(/blob:|private-upload|private-bytes/);
  });
  it("clears identities, request details, state lookup, email overrides and preview without deleting records", async () => {
    await mount(); await click(button("Preview letter")); await change("pc-sol-state", "FL"); await click(button("Clear this form"));
    expect(container.querySelector<HTMLInputElement>("#pc-claimant_name")!.value).toBe("");
    expect(container.querySelector<HTMLSelectElement>("#pc-sol-state")!.value).toBe("");
    expect(container.querySelector("iframe")).toBeNull(); expect(mocks.draft.mock.calls.at(-1)![0].pendingClosureFields).toEqual(emptyPendingClosureFields());
  });
});
