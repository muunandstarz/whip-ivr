import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ analyze: vi.fn(), storage: vi.fn(), write: vi.fn() }));
vi.mock("../insuranceDirectRepairAnalysis", () => ({ analyzeInsuranceDirectRepairUpload: mocks.analyze, MAX_REPAIR_BYTES: 20 * 1024 * 1024 }));
vi.mock("../storage", () => ({ storageGetSignedUrl: mocks.storage }));
vi.mock("../db", () => ({ createInsuranceDirectDvReview: mocks.write }));
import { docgenRouter } from "./docgen";
import type { TrpcContext } from "../_core/context";
const ctx = { user: { id: 7, name: "Synthetic Handler", role: "user" }, req: {}, res: {} } as TrpcContext;
const fileBase64 = Buffer.from("%PDF-1.7 synthetic bytes").toString("base64");
const input = { fileBase64, mimeType: "application/pdf", fileName: "untrusted-private-filename.pdf" };
const result = { modelId: "deterministic-repair", warnings: ["Review facts."], error: "Synthetic fixed result" };
beforeEach(() => { vi.clearAllMocks(); mocks.analyze.mockReset().mockResolvedValue(result); });
describe("protected transient Insurance Direct repair mutation", () => {
  it("exposes the separately named repair mutation", () => expect(Object.keys(docgenRouter._def.procedures)).toContain("readInsuranceDirectRepair"));
  it("blocks unauthenticated users before decoding/extraction/storage", async () => {
    await expect(docgenRouter.createCaller({ ...ctx, user: null }).readInsuranceDirectRepair(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.analyze).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, fileUrl: "https://private.invalid" }, { ...input, claimNumber: "WHIP-123" }, { ...input, userId: 123 }, { ...input, fileName: "x".repeat(256) },
    { ...input, mimeType: "image/svg+xml" }, { ...input, mimeType: "application/pdf; charset=utf-8" }, { ...input, mimeType: "IMAGE/PNG" },
    { ...input, fileBase64: "" }, { ...input, fileBase64: "SGVsbG8" }, { ...input, fileBase64: "AB==" }, { ...input, fileBase64: "SGVsbG8=\n" }, { ...input, fileBase64: "data:application/pdf;base64,SGVsbG8=" }, { ...input, fileBase64: "!!!!" },
  ])("strictly rejects invalid/untrusted request shapes before reading", async value => {
    await expect(docgenRouter.createCaller(ctx).readInsuranceDirectRepair(value)).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("allows only supported MIME values and optional bounded filenames", async () => {
    const caller = docgenRouter.createCaller(ctx);
    for (const mimeType of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) await expect(caller.readInsuranceDirectRepair({ fileBase64, mimeType })).resolves.toEqual(result);
    expect(mocks.analyze).toHaveBeenCalledTimes(4);
  });
  it("bounds the decoded size, including one extra byte whose base64 still fits the encoded cap", async () => {
    const schema = (docgenRouter._def.procedures.readInsuranceDirectRepair as any)._def.inputs[0];
    const exact = Buffer.alloc(20 * 1024 * 1024, 65); const extra = Buffer.alloc(20 * 1024 * 1024 + 1, 65);
    try {
      expect(exact.toString("base64").length).toBe(extra.toString("base64").length);
      expect(schema.safeParse({ fileBase64: exact.toString("base64"), mimeType: "application/pdf" }).success).toBe(true);
      expect(schema.safeParse({ fileBase64: extra.toString("base64"), mimeType: "application/pdf" }).success).toBe(false);
    } finally { exact.fill(0); extra.fill(0); }
  });
  it("passes only transient bytes and MIME, not filename/auth/source persistence metadata, and zeros caller bytes", async () => {
    let reference: Buffer | undefined;
    mocks.analyze.mockImplementation(async upload => { reference = upload.bytes; expect(upload).toEqual({ bytes: Buffer.from("%PDF-1.7 synthetic bytes"), mimeType: "application/pdf" }); return result; });
    await expect(docgenRouter.createCaller(ctx).readInsuranceDirectRepair(input)).resolves.toEqual(result);
    expect(reference?.every(byte => byte === 0)).toBe(true); expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it("clears caller bytes and hides source-bearing unexpected failures", async () => {
    let reference: Buffer | undefined;
    mocks.analyze.mockImplementation(async upload => { reference = upload.bytes; throw new Error("PRIVATE raw source exception"); });
    const output = await docgenRouter.createCaller(ctx).readInsuranceDirectRepair(input);
    expect(output.error).toContain("could not be read reliably"); expect(JSON.stringify(output)).not.toContain("PRIVATE"); expect(reference?.every(byte => byte === 0)).toBe(true);
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
});
