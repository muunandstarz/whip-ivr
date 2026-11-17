// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InsuranceDirectRepairUpload from "./InsuranceDirectRepairUpload";
import { reviewedRepairPatch, type InsuranceDirectRepairFacts, type RepairPrefillField } from "@shared/insuranceDirectRepair";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; (globalThis as any).React = React;
const facts: InsuranceDirectRepairFacts = { documentKind: "repair_invoice", claimNumber: "TST-1000-111111-222222", claimNumberRole: "our", vin: "5YJ3E1EA0PF000001", vehicle: "2024 Tesla Model 3", dateOfLoss: "2026-10-01", repairFacility: "Total Recon - Test", roNumber: "TEST-101", invoiceNumber: "TEST-INV-101", invoiceDate: "2026-10-22", repairStart: "2026-10-05", returnedToService: "2026-10-20", repairCompleted: "2026-10-19", repairTotal: "9876.54", sourcePages: { repairStart: "1", returnedToService: "2", repairTotal: "2" }, warnings: ["Review repair facts against the source."] };
let container: HTMLDivElement, root: Root, analyze: ReturnType<typeof vi.fn>, onApply: ReturnType<typeof vi.fn>;
let current: Record<RepairPrefillField, string>;
let nativeReader: typeof FileReader;
class Reader {
  result: string | null = null; onload?: () => void; onerror?: () => void; onabort?: () => void;
  readAsDataURL() { this.result = "data:application/pdf;base64,JVBERi0xLjc="; queueMicrotask(() => this.onload?.()); }
  abort() { this.onabort?.(); }
}
const mount = async () => { await act(async () => { root.render(React.createElement(InsuranceDirectRepairUpload, { current, analyze, onApply })); }); };
const button = (id: string) => container.querySelector<HTMLButtonElement>(`#${id}`)!;
const click = async (id: string) => { await act(async () => button(id).click()); };
async function upload(file = new File(["%PDF-1.7 synthetic"], "final-repair.pdf", { type: "application/pdf" })) {
  const input = container.querySelector<HTMLInputElement>('#lou-repair-file')!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
}
const check = async (id: string) => { await act(async () => container.querySelector<HTMLInputElement>(`#${id}`)!.click()); };
beforeEach(() => {
  nativeReader = globalThis.FileReader; (globalThis as any).FileReader = Reader;
  current = Object.fromEntries(["claimNumber", "vin", "vehicle", "dateOfLoss", "repairFacility", "roNumber", "repairStart", "returnedToService", "repairCompleted"].map(key => [key, ""])) as typeof current;
  analyze = vi.fn().mockResolvedValue({ facts, modelId: "deterministic-repair" }); onApply = vi.fn(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); globalThis.FileReader = nativeReader; });
describe("Insurance Direct repair-document review", () => {
  it("labels bills separately and never reads or applies anything on mount", async () => {
    await mount(); expect(container.textContent).toContain("Final Repair Bill / Estimate"); expect(container.textContent).toContain("not diminished value or loss of use"); expect(analyze).not.toHaveBeenCalled(); expect(onApply).not.toHaveBeenCalled();
  });
  it("requires source verification before applying selected repair fields; invoice total/date never become demand values", async () => {
    await mount(); await upload(); expect(button('lou-repair-apply').disabled).toBe(true); expect(container.textContent).toContain('$9876.54'); expect(container.textContent).toContain('10/22/2026 — not a return date');
    await check('lou-repair-reviewed'); await click('lou-repair-apply'); expect(onApply).toHaveBeenCalledOnce(); expect(onApply.mock.calls[0][0]).toMatchObject({ claimNumber: facts.claimNumber, repairStart: "2026-10-05", returnedToService: "2026-10-20", repairCompleted: "2026-10-19" }); expect(onApply.mock.calls[0][0]).not.toHaveProperty('dvAmount'); expect(onApply.mock.calls[0][0]).not.toHaveProperty('repairTotal'); expect(onApply.mock.calls[0][0]).not.toHaveProperty('invoiceDate'); expect(container.textContent).toContain('Selected repair fields applied');
  });
  it("defaults only blank fields selected, preserves existing values and allows a reviewed explicit replacement", async () => {
    current.vehicle = '2024 Tesla Model 3 Long Range'; current.repairFacility = 'Existing confirmed shop'; await mount(); await upload(); expect(container.querySelector<HTMLInputElement>('#lou-repair-select-vehicle')!.checked).toBe(false); expect(container.querySelector<HTMLInputElement>('#lou-repair-select-repairFacility')!.checked).toBe(false);
    await check('lou-repair-select-repairFacility'); await check('lou-repair-reviewed'); await click('lou-repair-apply'); expect(onApply.mock.calls[0][0].repairFacility).toBe(facts.repairFacility); expect(onApply.mock.calls[0][0]).not.toHaveProperty('vehicle');
  });
  it.each(['vin','claimNumber'] as const)("blocks a mismatched %s", async key => {
    current[key] = 'OTHER-IDENTITY'; await mount(); await upload(); expect(container.querySelector<HTMLInputElement>('#lou-repair-reviewed')!.disabled).toBe(true); expect(button('lou-repair-apply').disabled).toBe(true); expect(container.textContent).toContain('does not match'); expect(onApply).not.toHaveBeenCalled();
  });
  it("never assigns an unknown claim reference to Whip", async () => {
    analyze.mockResolvedValue({ facts: { ...facts, claimNumberRole: 'unknown' }, modelId: 'test' }); await mount(); await upload(); expect(container.querySelector('#lou-repair-select-claimNumber')).toBeNull(); await check('lou-repair-reviewed'); await click('lou-repair-apply'); expect(onApply.mock.calls[0][0]).not.toHaveProperty('claimNumber');
  });
  it("keeps missing source dates blank rather than deriving return from invoice or hours", async () => {
    analyze.mockResolvedValue({ facts: { ...facts, repairStart: '', returnedToService: '', repairCompleted: '' }, modelId: 'test' }); await mount(); await upload(); await check('lou-repair-reviewed'); await click('lou-repair-apply'); expect(onApply.mock.calls[0][0]).not.toHaveProperty('repairStart'); expect(onApply.mock.calls[0][0]).not.toHaveProperty('returnedToService'); expect(onApply.mock.calls[0][0]).not.toHaveProperty('repairCompleted');
  });
  it("gives a clear opposite-document message for DV appraisals without applying them", async () => {
    analyze.mockResolvedValue({ facts: { ...facts, documentKind: 'dv_appraisal' }, modelId: 'test' }); await mount(); await upload(); expect(container.textContent).toContain('This is a DV appraisal'); expect(container.querySelector('#lou-repair-apply')).toBeNull(); expect(onApply).not.toHaveBeenCalled();
  });
  it("clears a previous review on upload failure and permits same-file retry", async () => {
    await mount(); await upload(); analyze.mockRejectedValueOnce(new Error('Reader unavailable')); await upload(); expect(container.querySelector('#lou-repair-apply')).toBeNull(); expect(container.textContent).toContain('Reader unavailable'); await upload(); expect(container.querySelector('#lou-repair-apply')).not.toBeNull(); expect(onApply).not.toHaveBeenCalled();
  });
  it("rejects bad file types, empty files and oversized sources without an API call", async () => {
    await mount(); await upload(new File([], 'empty.pdf', { type: 'application/pdf' })); expect(container.textContent).toContain('nonempty'); await upload(new File(['fake'], 'bad.txt', { type: 'text/plain' })); expect(container.textContent).toContain('Use a repair PDF'); const huge = new File(['x'], 'big.pdf', { type: 'application/pdf' }); Object.defineProperty(huge, 'size', { value: 20 * 1024 * 1024 + 1 }); await upload(huge); expect(container.textContent).toContain('up to 20 MB'); expect(analyze).not.toHaveBeenCalled();
  });
  it("ignores a delayed response after the review is cleared", async () => {
    let resolve!: (value: unknown) => void; analyze.mockImplementation(() => new Promise(done => { resolve = done; })); await mount(); await upload(); expect(button('lou-repair-read').disabled).toBe(true); await click('lou-repair-clear'); await act(async () => resolve({ facts, modelId: 'test' })); expect(container.querySelector('#lou-repair-apply')).toBeNull(); expect(button('lou-repair-read').disabled).toBe(false); expect(onApply).not.toHaveBeenCalled();
  });
  it("ignores a delayed response after the claim changes", async () => {
    let resolve!: (value: unknown) => void; analyze.mockImplementation(() => new Promise(done => { resolve = done; })); await mount(); await upload(); current = { ...current, claimNumber: 'NEW-CLAIM' }; await mount(); await act(async () => resolve({ facts, modelId: 'test' })); expect(container.querySelector('#lou-repair-apply')).toBeNull(); expect(onApply).not.toHaveBeenCalled();
  });
  it("requires a fresh review after changing existing form data or field selections", async () => {
    await mount(); await upload(); await check('lou-repair-reviewed'); current = { ...current, repairFacility: 'Edited manually' }; await mount(); expect(button('lou-repair-apply').disabled).toBe(true); await check('lou-repair-reviewed'); await check('lou-repair-select-roNumber'); expect(button('lou-repair-apply').disabled).toBe(true);
  });
  it("ignores unknown selected fields at the shared patch boundary", () => {
    const patch = reviewedRepairPatch(facts, ['repairTotal','invoiceDate','dvAmount','vehicle'] as unknown as RepairPrefillField[]); expect(patch).toEqual({ vehicle: facts.vehicle });
  });
});
