import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { Readable } from "node:stream";
import { TRPCError } from "@trpc/server";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), signed: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticate } }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.signed, storagePut: vi.fn() }));
import { registerRentalHandoffApi } from "./rentalHandoffApi";
const servers: Server[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve())); });
async function setup(actor: any, authorize = vi.fn(async () => ({ storageKey: "private-storage-key", mime: "application/pdf", filename: "packet.pdf" }))) {
  mocks.authenticate.mockImplementation(async () => { if (!actor) throw new Error("No native auth"); return actor; });
  mocks.signed.mockResolvedValue("https://private-storage.test/object");
  const repo = { find: vi.fn(async () => []) };
  const service = { repo, deps: { now: () => Date.now() }, authorizeFile: authorize } as any;
  const app = express(); registerRentalHandoffApi(app, service);
  const server = app.listen(0, "127.0.0.1"); servers.push(server); await new Promise<void>(resolve => server.once("listening", resolve));
  return { url: `http://127.0.0.1:${(server.address() as any).port}`, authorize, repo };
}
describe("rental file streaming security", () => {
  it("requires authentication and never resolves a storage URL for anonymous downloads", async () => {
    const { url, authorize } = await setup(null); const response = await fetch(`${url}/api/rental-handoff/files/packet/1`);
    expect(response.status).toBe(401); expect(authorize).not.toHaveBeenCalled(); expect(response.headers.get("location")).toBe(null); expect(await response.text()).not.toContain("storage");
  });
  it("rechecks file authorization before every storage fetch", async () => {
    const authorize = vi.fn(async () => { throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found." }); });
    const { url } = await setup({ id: 1, name: "Claims", role: "user" }, authorize); mocks.signed.mockClear();
    expect((await fetch(`${url}/api/rental-handoff/files/asset/12`)).status).toBe(404); expect(authorize).toHaveBeenCalledTimes(1); expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("streams bytes privately without redirects, source keys or signed URLs", async () => {
    const { url, authorize } = await setup({ id: 1, name: "Claims", role: "user" }); const nativeFetch = global.fetch;
    const spy = vi.spyOn(global, "fetch").mockImplementation(async (input: any, init?: any) => String(input).startsWith("https://private-storage.test") ? new Response(Readable.toWeb(Readable.from([Buffer.from("%PDF-private-test")])) as any, { headers: { "content-length": "17" } }) : nativeFetch(input, init));
    const response = await fetch(`${url}/api/rental-handoff/files/packet/1`); expect(response.status).toBe(200); expect(response.headers.get("location")).toBe(null); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("content-type")).toContain("application/pdf"); expect(await response.text()).toBe("%PDF-private-test");
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ role: "claims" }), "packet", 1); expect(spy).toHaveBeenCalledWith("https://private-storage.test/object", expect.objectContaining({ redirect: "error" }));
  });
});
