import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("./db", () => ({ issueTotalReconPaymentReceipt: mocks.issue }));
import { docgenRouter } from "./routers/docgen";
import type { TrpcContext } from "./_core/context";
const fields = { receiptDate: "2026-11-04", owner: "Metrocars Leasing Corp.", vehicle: "2025 Toyota Camry", vin: "4T1G11AK1MU000001", licensePlate: "SAMPLE", color: "Silver", claimNumber: "TST-0000-555555-777777", roNumber: "SAMPLE-RO-1104", receivedFrom: "Sample Insurance", paymentMethod: "ach" as const, referenceNumber: "SAMPLE-REF", paymentDate: "2026-11-04", amountReceived: "4500.25", receivedBy: "Sample Receiver", totalBalanceDue: "5000.25", priorPayments: "500.00" };
const ctx = { user: { id: 7, name: "Test Handler", role: "user" }, req: {}, res: {} } as TrpcContext;
const input = { requestKey: "00000000-0000-4000-8000-000000000123", fields, paymentVerified: true as const };
beforeEach(() => mocks.issue.mockReset());
describe("protected Total Recon receipt endpoint", () => {
  it("rejects unauthenticated users before creating a receipt", async () => { await expect(docgenRouter.createCaller({ ...ctx, user: null }).issueTotalReconReceipt(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" }); expect(mocks.issue).not.toHaveBeenCalled(); });
  it("rejects an unverified payment and malformed request identity", async () => { const caller = docgenRouter.createCaller(ctx); await expect(caller.issueTotalReconReceipt({ ...input, paymentVerified: false } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" }); await expect(caller.issueTotalReconReceipt({ ...input, requestKey: "manual-counter" })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.issue).not.toHaveBeenCalled(); });
  it("rejects invalid totals before creating an immutable receipt record", async () => { await expect(docgenRouter.createCaller(ctx).issueTotalReconReceipt({ ...input, fields: { ...fields, amountReceived: "10000" } })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.issue).not.toHaveBeenCalled(); });
  it("derives creator identity only from the authenticated user and returns the server number", async () => { mocks.issue.mockResolvedValue({ receiptNumber: "00000123", fields, issuedAt: new Date("2026-11-04T23:00:00Z") }); const output = await docgenRouter.createCaller(ctx).issueTotalReconReceipt(input); expect(mocks.issue).toHaveBeenCalledWith({ requestKey: input.requestKey, fields, userId: 7, userName: "Test Handler" }); expect(output.receiptNumber).toBe("00000123"); });
});
