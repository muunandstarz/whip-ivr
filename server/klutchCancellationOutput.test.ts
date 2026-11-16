import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
function model(status = "cancelled", cancelledOn: string | null = "2026-11-12") {
  const policy = { id: 999998, policyNumber: "KIC-VA-999998", status, cancelledOn };
  const plain = vi.fn(async (path: string) => path.startsWith("/policy/") ? { policy } : { result: { documentId: 999997, klutchClaimNumber: "KIC-CLM-999998" } });
  const context = vm.createContext({ F: { cdate: "2026-11-12", snap: "SYNTHETIC CLAIM" }, plain, srcDocType: { can: "cancellation_notice", end: "endorsement" }, snapshot: () => ({ cdate: "2026-11-12", hn: "Morgan Ellis", ht: "Liability Claims Specialist" }), clean: (v: string) => v.trim(), validMdDate: (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v).toISOString().slice(0, 10) === v, serverPolicies: new Map(), K: { pols: {} }, asLegacy: (p: unknown) => p });
  vm.runInContext(html.slice(html.indexOf("  function cancellationOutputAction("), html.indexOf("  let klutchPrintBusy=")), context);
  return { context, policy, plain };
}
describe("Klutch cancellation output is not a second cancellation", () => {
  it("first output cancels an active policy and immediately updates the local register cache", async () => {
    const m = model("active", null);
    await m.context.recordDocumentForSource("can", m.policy);
    expect(m.plain).toHaveBeenCalledWith("/cancel", expect.anything());
    expect(m.context.serverPolicies.get(m.policy.policyNumber)).toMatchObject({ status: "cancelled", cancelledOn: "2026-11-12" });
  });
  it("an already-cancelled notice is recorded through the document path rather than cancelling again", async () => {
    const m = model();
    await m.context.recordDocumentForSource("can", m.policy);
    expect(m.plain).toHaveBeenCalledTimes(1);
    expect(m.plain.mock.calls[0][0]).toBe("/document");
    expect(JSON.parse((m.plain.mock.calls[0] as any)[1].body)).toMatchObject({ documentType: "cancellation_notice", snapshot: { cdate: "2026-11-12" } });
  });
  it("refreshes server state before writing any packet documents, including stale-tab reprints", async () => {
    const m = model();
    const fresh = await m.context.prepareCancellationOutput({ ...m.policy, status: "active", cancelledOn: null }, ["dec", "can", "end"]);
    expect(fresh.status).toBe("cancelled");
    expect(m.plain).toHaveBeenCalledTimes(1);
    expect(m.plain).toHaveBeenCalledWith("/policy/999998");
    await m.context.recordDocumentForSource("can", fresh);
    expect(m.plain.mock.calls.map(c => c[0])).toEqual(["/policy/999998", "/document"]);
  });
  it("rejects a changed recorded date in preflight before any packet mutation", async () => {
    const m = model("cancelled", "2026-11-11");
    await expect(m.context.prepareCancellationOutput(m.policy, ["dec", "can", "end"])).rejects.toThrow("Use the recorded cancellation date");
    expect(m.plain.mock.calls.map(c => c[0])).toEqual(["/policy/999998"]);
  });
  it.each([null, "", "2026-02-30"])("does not reprint a cancelled record with invalid recorded date %s", date => {
    const m = model("cancelled", date);
    expect(() => m.context.cancellationOutputAction(m.policy, "2026-11-12")).toThrow("recorded cancellation date");
  });
  it("rejects expired and missing policies rather than silently treating them as cancelled", () => {
    const m = model("expired", null);
    expect(() => m.context.cancellationOutputAction(m.policy, "2026-11-12")).toThrow("Only an active policy");
    expect(() => m.context.cancellationOutputAction(null, "2026-11-12")).toThrow("not found");
  });
  it("does not read or cancel a policy when only unrelated documents are being output", async () => {
    const m = model();
    expect(await m.context.prepareCancellationOutput(m.policy, ["end"])).toBe(m.policy);
    expect(m.plain).not.toHaveBeenCalled();
  });
  it("preserves the registered status/date in restored form values rather than stale initial terms", () => {
    const context = vm.createContext({});
    vm.runInContext(html.slice(html.indexOf("  const asLegacy ="), html.indexOf("  const policyTerms =")).replace("const asLegacy =", "var asLegacy ="), context);
    const restored = context.asLegacy({ policyNumber: "KIC-VA-999998", status: "cancelled", cancelledOn: "2026-11-12", terms: { leaseStatus: "active", cancellationDate: "2026-11-10" } });
    expect(restored.lease).toBe("t"); expect(restored.cdate).toBe("2026-11-12");
  });
});
