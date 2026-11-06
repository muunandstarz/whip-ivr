// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableIframePageLoading":true}}}
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ issue: vi.fn(), pdf: vi.fn(), template: vi.fn(), download: vi.fn(), key: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { docgen: { issueTotalReconReceipt: { useMutation: () => ({ mutateAsync: mocks.issue }) } } } }));
vi.mock("@/lib/totalReconReceiptPdf", () => ({ createTotalReconReceiptPdf: mocks.pdf, loadTotalReconReceiptTemplate: mocks.template }));
vi.mock("@/lib/receiptBrowser", () => ({ createReceiptRequestKey: mocks.key, downloadReceipt: mocks.download }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));
import TotalReconReceiptForm from "./TotalReconReceiptForm";
import { totalReconReceiptSchema } from "@shared/totalReconReceipt";

const fields = { receiptDate: "2026-11-06", owner: "Sample Owner", vehicle: "2024 Tesla Model 3", vin: "5YJ3E1EA1RF000001", licensePlate: "SAMPLE", color: "Silver", claimNumber: "TST-0000-888888-111111", roNumber: "SAMPLE-1106", receivedFrom: "Sample Payer", paymentMethod: "check" as const, referenceNumber: "SAMPLE-REF", paymentDate: "2026-11-06", amountReceived: "1456.78", receivedBy: "José Sample", totalBalanceDue: "1456.78", priorPayments: "0.00" };
let root: Root;
let container: HTMLDivElement;
const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.includes(label))!;
const confirm = () => container.querySelector<HTMLButtonElement>("#tr-verified")!;
async function click(element: HTMLElement) { await act(async () => { element.click(); }); }
async function mount() { await act(async () => { root.render(React.createElement(TotalReconReceiptForm, { initialDraft: { ...fields, receiptTemplateVersion: "total-recon-v1" } })); }); }

beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.template.mockResolvedValue(new ArrayBuffer(8));
  mocks.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.key.mockReturnValue("a41e674d-3dc5-479f-aa1a-e83ed51d63e2");
  mocks.issue.mockResolvedValue({ receiptNumber: "00090001", fields });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:receipt-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await mount();
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Total Recon receipt generation controls", () => {
  it("places the still-required confirmation next to Generate with a visible blocking explanation", () => {
    expect(button("Generate new receipt").disabled).toBe(true);
    const actions = container.querySelector("#tr-receipt-actions")!;
    expect(actions.contains(confirm())).toBe(true);
    expect(actions.contains(button("Generate new receipt"))).toBe(true);
    expect(container.querySelector("#tr-generation-status")?.textContent).toContain("To enable Generate");
    expect(button("Generate new receipt").getAttribute("aria-describedby")).toBe("tr-generation-status");
  });
  it("previews without issuing and explains that PREVIEW is not a numbered receipt", async () => {
    await click(button("Preview receipt"));
    expect(mocks.pdf).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.any(Object), "PREVIEW");
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.key).not.toHaveBeenCalled();
    expect(button("Generate new receipt").disabled).toBe(true);
  });
  it("enables generation after explicit confirmation and returns only the server-issued number", async () => {
    await click(confirm());
    expect(button("Generate new receipt").disabled).toBe(false);
    await click(button("Generate new receipt"));
    expect(mocks.issue).toHaveBeenCalledWith({ requestKey: "a41e674d-3dc5-479f-aa1a-e83ed51d63e2", fields, paymentVerified: true });
    expect(mocks.download).toHaveBeenCalledWith("blob:receipt-test", "Total_Recon_Payment_Receipt_00090001.pdf");
    await click(button("Re-download this receipt"));
    expect(mocks.issue).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledTimes(2);
  });
  it("clears confirmation and stale PDF when any receipt field changes", async () => {
    await click(confirm()); await click(button("Preview receipt"));
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>("#tr-receivedBy")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Updated Receiver");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirm().getAttribute("data-state")).toBe("unchecked");
    expect(button("Generate new receipt").disabled).toBe(true);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("#tr-generation-status")?.textContent).toContain("To enable Generate");
  });
  it("retains the same request key after server response failure", async () => {
    mocks.issue.mockRejectedValueOnce(Error("Network disconnected"));
    await click(confirm()); await click(button("Generate new receipt"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Network disconnected");
    await click(button("Generate new receipt"));
    expect(mocks.key).toHaveBeenCalledOnce();
    expect(mocks.issue.mock.calls[0][0].requestKey).toBe(mocks.issue.mock.calls[1][0].requestKey);
  });
  it("retains the retry key if Blob URL creation fails after issuance", async () => {
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw Error("Blob unavailable"); });
    await click(confirm()); await click(button("Generate new receipt"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Blob unavailable");
    await click(button("Generate new receipt"));
    expect(mocks.key).toHaveBeenCalledOnce();
    expect(mocks.issue.mock.calls[0][0].requestKey).toBe(mocks.issue.mock.calls[1][0].requestKey);
  });
  it("keeps the numbered PDF for explicit re-download when automatic delivery is blocked", async () => {
    mocks.download.mockImplementationOnce(() => { throw Error("Browser blocked"); });
    await click(confirm()); await click(button("Generate new receipt"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("do not generate another receipt");
    expect(container.querySelector("iframe")).not.toBeNull();
    await click(button("Re-download this receipt"));
    expect(mocks.issue).toHaveBeenCalledOnce();
  });
  it("preserves ISO date-only fields and exact USD cents with decomposed Spanish names", () => {
    const parsed = totalReconReceiptSchema.parse({ ...fields, receivedBy: "Jose\u0301 Sample", owner: "Mun\u0303oz Sample" });
    expect(parsed.receivedBy).toBe("José Sample"); expect(parsed.owner).toBe("Muñoz Sample");
    expect(parsed.receiptDate).toBe("2026-11-06"); expect(parsed.paymentDate).toBe("2026-11-06"); expect(parsed.amountReceived).toBe("1456.78");
  });
});
