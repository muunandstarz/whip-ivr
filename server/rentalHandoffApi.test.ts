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
async function setup(actor: any, authorize = vi.fn(async () => ({ storageKey: "private-storage-key", mime: "application/pdf", filename: "packet.pdf" })), finish = vi.fn(async () => ({ email: "shared@example.test" }))) {
  mocks.authenticate.mockImplementation(async () => { if (!actor) throw new Error("No native auth"); return actor; });
  mocks.signed.mockResolvedValue("https://private-storage.test/object");
  const repo = { find: vi.fn(async () => []) };
  const service = { repo, deps: { now: () => Date.now() }, authorizeFile: authorize, finishSharedGmail: finish } as any;
  const app = express(); registerRentalHandoffApi(app, service);
  const server = app.listen(0, "127.0.0.1"); servers.push(server); await new Promise<void>(resolve => server.once("listening", resolve));
  return { url: `http://127.0.0.1:${(server.address() as any).port}`, authorize, repo, finish };
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
  it("permits validated support assets above 5MB and provides a server-side download disposition", async () => {
    const { url } = await setup({ id: 1, name: "Claims", role: "user" });
    const nativeFetch = global.fetch;
    const bytes = Buffer.alloc(6 * 1024 * 1024, 65);
    vi.spyOn(global, "fetch").mockImplementation(async (input: any, init?: any) => String(input).startsWith("https://private-storage.test")
      ? new Response(Readable.toWeb(Readable.from([bytes])) as any, { headers: { "content-length": String(bytes.length) } }) : nativeFetch(input, init));
    const response = await fetch(`${url}/api/rental-handoff/files/asset/1?download=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="packet.pdf"');
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await response.arrayBuffer()).byteLength).toBe(bytes.length);
  });
  it("never exchanges tokens through unauthenticated Gmail callbacks", async () => {
    const { url, finish } = await setup(null);
    mocks.authenticate.mockClear();
    const response = await fetch(`${url}/api/rental-handoff/gmail/callback?code=obsolete&state=obsolete`, { redirect: "manual" });
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain("rental Admin");
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
  });
  it("rejects authenticated Claims callbacks before token exchange", async () => {
    const { url, finish } = await setup({ id: 1, role: "user" });
    expect((await fetch(`${url}/api/rental-handoff/gmail/callback?code=code&state=${"A".repeat(43)}`, { redirect: "manual" })).status).toBe(403);
    expect(finish).not.toHaveBeenCalled();
  });
  it("authenticates the real admin and passes only code/state to shared completion, then redirects without secrets", async () => {
    const { url, finish } = await setup({ id: 3, name: "Admin Three", role: "admin" });
    const state = "A".repeat(43);
    const response = await fetch(`${url}/api/rental-handoff/gmail/callback?code=private-code&state=${state}&senderEmail=spoof@example.test`, { redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/rental-handoff/admin?gmail=connected");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(finish).toHaveBeenCalledWith({ key: "native:3", name: "Admin Three", role: "admin", locationIds: [] }, "private-code", state);
    expect(await response.text()).not.toMatch(/private-code|spoof@example/);
  });
  it("handles wrong-admin state/replay errors with controlled redirects and no raw provider data", async () => {
    const finish = vi.fn(async () => { throw new Error("private-access-token admin@example.test"); });
    const { url } = await setup({ id: 2, role: "admin" }, undefined, finish);
    const response = await fetch(`${url}/api/rental-handoff/gmail/callback?code=code&state=${"A".repeat(43)}`, { redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/rental-handoff/admin?gmail=error");
    expect(await response.text()).not.toMatch(/private-access-token|admin@example/);
  });
  it.each(["code=code&state=bad", `code=code&state=${"A".repeat(43)}&error=access_denied`, `code=first&code=second&state=${"A".repeat(43)}`])("rejects malformed/denied OAuth callback %s before completion", async query => {
    const { url, finish } = await setup({ id: 1, role: "admin" });
    const response = await fetch(`${url}/api/rental-handoff/gmail/callback?${query}`, { redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/rental-handoff/admin?gmail=error");
    expect(finish).not.toHaveBeenCalled();
  });
});
