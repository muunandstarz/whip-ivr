// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InsuranceDirectDvReview, { type InsuranceDirectDvReviewProps } from "./InsuranceDirectDvReview";
import type { DvReportFacts } from "@shared/insuranceDirectDv";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; (globalThis as any).React = React;
const report: DvReportFacts = { reportId: "TEST-DV-01", reportDate: "2026-11-01", appraiser: "Synthetic Appraisal", methodology: "Market comparison", claimNumber: "TST-1000-111111-222222", claimNumberRole: "our", claimantName: "Synthetic claimant", vehicleYear: "2024", vehicleMake: "Tesla", vehicleModel: "Model 3", vin: "5YJ3E1EA0PF000001", dateOfLoss: "2026-10-01", repairFacility: "Synthetic shop", dvAmount: "1250.00", adjustedVehicleValue: "25000.00", prelossValue: "", postlossValue: "", carfaxReported: true, dvSourcePage: "Section 4, page 6", warnings: [] };
let container: HTMLDivElement, root: Root, props: InsuranceDirectDvReviewProps, fetcher: ReturnType<typeof vi.fn>;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const success = () => response({ report, currency: "USD", amountUnit: "dollars" });
const mount = async () => { await act(async () => root.render(React.createElement(InsuranceDirectDvReview, props))); };
const button = (id: string) => container.querySelector<HTMLButtonElement>(`#${id}`)!;
const click = async (id: string) => { await act(async () => button(id).click()); };
async function upload(file = new File(["%PDF-1.7 synthetic"], "completed-dv.pdf", { type: "application/pdf" })) {
  const input = container.querySelector<HTMLInputElement>("#lou-dv-report-file")!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
}
beforeEach(() => {
  fetcher = vi.fn().mockImplementation(async () => success()); vi.stubGlobal("fetch", fetcher);
  props = { current: { claimNumber: report.claimNumber, vin: report.vin, dvAmount: "", dvMethod: "", prelossValue: "", postlossValue: "" }, confirmed: false, onApply: vi.fn(), onInvalidate: vi.fn(), onManualConfirm: vi.fn() };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("Completed DV report final-stage review", () => {
  it("does not request, poll, import, or expose manual bypass on mount", async () => {
    await mount(); expect(fetcher).not.toHaveBeenCalled(); expect(props.onApply).not.toHaveBeenCalled(); expect(container.querySelector("#lou-dv-manual-fallback")).toBeNull(); expect(container.textContent).toContain("Opening the calculator does not submit a request");
  });
  it("reads only the chosen source using the exact existing authenticated USD contract and requires reviewed apply", async () => {
    await mount(); await upload(); expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][0]).toBe("/api/insurance-direct/dv-report/analyze"); expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include" }); expect(fetcher.mock.calls[0][1].body.has("file")).toBe(false);
    expect(container.textContent).toContain("$1250.00"); expect(button("lou-dv-apply-report").disabled).toBe(true); expect(props.onApply).not.toHaveBeenCalled(); await click("lou-dv-reviewed"); await click("lou-dv-apply-report"); expect(props.onApply).toHaveBeenCalledWith(report); expect(container.textContent).toContain("does not confirm a separate Carfax enclosure");
  });
  it.each(["vin", "claimNumber"] as const)("blocks a mismatched %s and offers no manual bypass", async key => {
    props.current[key] = "OTHER-IDENTITY"; await mount(); await upload(); expect(button("lou-dv-apply-report").disabled).toBe(true); expect(container.querySelector<HTMLInputElement>("#lou-dv-reviewed")!.disabled).toBe(true); expect(container.textContent).toContain("does not match"); expect(container.querySelector("#lou-dv-manual-fallback")).toBeNull();
  });
  it("keeps unknown claim roles explicit rather than treating them as Whip", async () => {
    fetcher.mockResolvedValue(response({ report: { ...report, claimNumberRole: "unknown" }, currency: "USD", amountUnit: "dollars" })); props.current.claimNumber = "OTHER-CLAIM"; await mount(); await upload(); expect(container.textContent).toContain("role unknown; not assigned to Whip"); expect(container.querySelector<HTMLInputElement>("#lou-dv-reviewed")!.disabled).toBe(false);
  });
  it("allows explicit completed-source attestation only after genuine parser failure", async () => {
    fetcher.mockResolvedValue(response({ error: "The supported report-reading model is unavailable. Enter the report facts manually." }, 422)); await mount(); await upload(); expect(container.querySelector("#lou-dv-manual-fallback")).not.toBeNull(); expect(props.onManualConfirm).not.toHaveBeenCalled(); await click("lou-dv-manual-confirmed"); expect(props.onManualConfirm).toHaveBeenCalledWith(true); expect(props.onApply).not.toHaveBeenCalled();
  });
  it.each([401, 400])("does not use HTTP %s as parser-failure bypass", async status => {
    fetcher.mockResolvedValue(response({ error: "Sign in or choose a valid file" }, status)); await mount(); await upload(); expect(container.querySelector("#lou-dv-manual-fallback")).toBeNull();
  });
  it("does not let a repair invoice rejection become a DV source bypass", async () => {
    fetcher.mockResolvedValue(response({ error: "This is a repair invoice or estimate, not a DV appraisal." }, 422)); await mount(); await upload(); expect(container.querySelector("#lou-dv-manual-fallback")).toBeNull();
  });
  it.each([{ currency: "USD", amountUnit: "cents" }, { currency: "CAD", amountUnit: "dollars" }])("rejects incompatible currency contracts %j", async units => {
    fetcher.mockResolvedValue(response({ report, ...units })); await mount(); await upload(); expect(container.textContent).toContain("unverified currency units"); expect(container.querySelector("#lou-dv-apply-report")).toBeNull(); expect(container.querySelector("#lou-dv-manual-fallback")).toBeNull();
  });
  it("rejects empty, unsupported and oversized files without API calls", async () => {
    await mount(); await upload(new File([], "empty.pdf", { type: "application/pdf" })); await upload(new File(["bad"], "bad.txt", { type: "text/plain" })); const huge = new File(["x"], "huge.pdf", { type: "application/pdf" }); Object.defineProperty(huge, "size", { value: 20 * 1024 * 1024 + 1 }); await upload(huge); expect(fetcher).not.toHaveBeenCalled(); expect(container.querySelector("#lou-dv-manual-fallback")).toBeNull();
  });
  it("ignores late responses after reset, permitting same-file retry without stale apply", async () => {
    let resolve!: (value: Response) => void; fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; })); await mount(); await upload(); await click("lou-dv-reset-review"); await act(async () => resolve(success())); expect(container.querySelector("#lou-dv-apply-report")).toBeNull(); expect(button("lou-dv-read-report").disabled).toBe(false); await upload(); expect(button("lou-dv-apply-report").disabled).toBe(true);
  });
  it("ignores late responses after identity change", async () => {
    let resolve!: (value: Response) => void; fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; })); await mount(); await upload(); props.current = { ...props.current, vin: "OTHER-VIN" }; await mount(); await act(async () => resolve(success())); expect(container.querySelector("#lou-dv-apply-report")).toBeNull(); expect(props.onApply).not.toHaveBeenCalled();
  });
  it("aborts and ignores late responses after unmount", async () => {
    let resolve!: (value: Response) => void; fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done; })); await mount(); await upload(); const signal = fetcher.mock.calls[0][1].signal; await act(async () => root.render(null)); expect(signal.aborted).toBe(true); await act(async () => resolve(success())); expect(props.onApply).not.toHaveBeenCalled();
  });
  it("requires a fresh review when the manually entered amount changes", async () => {
    await mount(); await upload(); await click("lou-dv-reviewed"); props.current = { ...props.current, dvAmount: "1500.00" }; await mount(); expect(button("lou-dv-apply-report").disabled).toBe(true);
  });
});
