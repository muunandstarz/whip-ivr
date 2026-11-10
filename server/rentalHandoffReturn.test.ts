import { beforeEach, describe, expect, it, vi } from "vitest";

const live = vi.hoisted(() => ({ db: vi.fn(), put: vi.fn(), signedUrl: vi.fn(), mailgun: vi.fn(), sender: vi.fn() }));
vi.mock("./db", () => ({ getDb: live.db }));
vi.mock("./storage", () => ({ storagePut: live.put, storageGetSignedUrl: live.signedUrl }));
vi.mock("./rentalHandoffMailgun", () => ({ rentalSenderStatus: live.sender, sendRentalPacketMailgun: live.mailgun, RentalMailgunDeliveryUncertainError: class extends Error {}, RENTAL_MAILGUN_MAX_PDF_BYTES: 16 * 1024 * 1024, RENTAL_MAILGUN_SETTINGS_ID: 2, RENTAL_MAILGUN_SETTINGS_KEY: "mailgun_sender", verifyRentalSharedSenderConfig: vi.fn() }));

import { RentalHandoffService, type RentalDependencies, type RentalRepository, type RentalQuery, type RentalTable, type RentalPdfInput } from "./rentalHandoffService";
import { createRentalHandoffRouter } from "./routers/rentalHandoff";
import { encryptRental, decryptRental, tokenHash, RENTAL_COOKIE } from "./rentalHandoffSecurity";
import { CONDITION_AREAS, DEFAULT_RENTAL_RATES, emptyRentalDraft, type RentalActor, type RentalReturn } from "../shared/rentalHandoff";

class MemoryRepo implements RentalRepository {
  rows: Record<RentalTable, any[]> = { locations: [], vehicles: [], records: [], assets: [], packets: [], audit: [], emails: [], settings: [], shopUsers: [], sessions: [] };
  writes: Array<{ table: RentalTable; values: any; query?: RentalQuery }> = [];
  failRecordCas = false;
  private tail: Promise<unknown> = Promise.resolve();
  async find(table: RentalTable, query: RentalQuery = {}): Promise<any[]> {
    return structuredClone(this.rows[table].filter(row => Object.entries(query.eq || {}).every(([k, v]) => row[k] === v) && Object.entries(query.in || {}).every(([k, v]) => v.includes(row[k]))).slice(0, query.limit || 500));
  }
  async insert(table: RentalTable, values: any) {
    const id = values.id || Math.max(0, ...this.rows[table].map(r => r.id)) + 1;
    this.rows[table].push({ activePacketId: null, returnPayload: null, providerId: null, error: null, sentAt: null, ...structuredClone(values), id });
    this.writes.push({ table, values: structuredClone(values) }); return id;
  }
  async update(table: RentalTable, query: RentalQuery, values: any) {
    if (table === "records" && this.failRecordCas) return 0;
    const found = await this.find(table, query);
    for (const row of found) Object.assign(this.rows[table].find(r => r.id === row.id), structuredClone(values));
    this.writes.push({ table, query: structuredClone(query), values: structuredClone(values) }); return found.length;
  }
  async remove(table: RentalTable, query: RentalQuery) { const found = await this.find(table, query); this.rows[table] = this.rows[table].filter(r => !found.some(f => f.id === r.id)); }
  async transaction<T>(work: (tx: RentalRepository) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => { const before = structuredClone(this.rows); try { return await work(this); } catch (e) { this.rows = before; throw e; } });
    this.tail = run.catch(() => undefined); return run;
  }
}

const now = Date.parse("2026-11-11T17:00:00Z");
const admin: RentalActor = { key: "native:1", name: "Admin", role: "admin", locationIds: [] };
const claims: RentalActor = { key: "native:2", name: "Claims", role: "claims", locationIds: [] };
const shop: RentalActor = { key: "shop:1", name: "Shop", role: "shop", locationIds: [1] };
const outsider: RentalActor = { ...shop, key: "shop:2", locationIds: [2] };
function data(): RentalReturn {
  return { returnedAt: "2026-11-11T16:00:00Z", odometer: 1100, fuel: "Full", condition: CONDITION_AREAS.map(area => ({ area, ok: true, note: "" })), noticeAt: "", tolls: 5, parking: 0, fines: 0, researchEvents: 1, cleaning: 0, roadside: 0, lossOfUseDays: 0, lossOfUseResponsible: false, damageNoticeNotes: "", notes: "", chargesSettled: false, representativeName: "Shop" };
}
let repo: MemoryRepo, service: RentalHandoffService, deps: RentalDependencies;
beforeEach(async () => {
  process.env.JWT_SECRET = "return-test-only-secret-never-live";
  vi.clearAllMocks();
  repo = new MemoryRepo();
  const forbidden = async () => { throw new Error("Unexpected external dependency"); };
  deps = { repo, now: () => now, put: vi.fn(forbidden), read: vi.fn(forbidden), buildPickup: vi.fn(forbidden), buildReturn: vi.fn(forbidden), sendEmail: vi.fn(forbidden), providerReady: () => false };
  service = new RentalHandoffService(deps);
  await repo.insert("locations", { id: 1, active: true, timezone: "America/New_York", name: "Location", address: "", phone: "" });
  await repo.insert("locations", { id: 2, active: true });
  await repo.insert("vehicles", { id: 1, locationId: 1, lastOdometer: 1000, active: true });
  const draft = { ...emptyRentalDraft(), locationId: 1, vehicleId: 1, odometerOut: 1000, pickupAt: "2026-11-10T16:00:00Z", expectedReturn: "2026-11-12T16:00:00Z", renterName: "Renter", election: "B" as const, email: "renter@example.test", claimEmail: "claims@example.test" };
  await repo.insert("records", { id: 1, locationId: 1, vehicleId: 1, status: "Out", revision: 2, activePacketId: 1, payload: encryptRental(draft), rateSnapshot: encryptRental(DEFAULT_RENTAL_RATES), updatedAt: now });
  const snapshot = { rentalId: 1, version: 1, draft, vehicle: { id: 1 }, location: { timezone: "America/New_York" }, rates: DEFAULT_RENTAL_RATES, settings: {}, assets: [{ id: 1, kind: "renterSignature" }, { id: 2, kind: "representativeSignature" }] };
  await repo.insert("packets", { id: 1, rentalId: 1, kind: "pickup", version: 1, storageKey: "immutable-pickup.pdf", snapshot: encryptRental(snapshot), createdAt: now - 86400000, requestId: "pickup-original" });
  for (const [id, kind] of [[1, "renterSignature"], [2, "representativeSignature"]] as const) await repo.insert("assets", { id, rentalId: 1, kind, createdAt: now - 86400000, storageKey: `private/${id}` });
  repo.writes = [];
});
function expectNoExternalCalls() {
  for (const fn of [deps.put, deps.read, deps.buildPickup, deps.buildReturn, deps.sendEmail, ...Object.values(live)]) expect(fn).not.toHaveBeenCalled();
}
async function returnEvidence() {
  for (const kind of ["returnFront", "returnRear", "returnDriver", "returnPassenger", "returnDashboard", "returnRenterSignature", "returnRepresentativeSignature"]) await repo.insert("assets", { rentalId: 1, kind, storageKey: `private/${kind}`, mime: "image/png", signerName: "Test", uploadedBy: shop.key, createdAt: now });
}
async function finishReturn() {
  await returnEvidence();
  // Replace only in-memory packet construction/delivery; no DB/S3/email access.
  vi.spyOn(service, "buildPacket").mockResolvedValue("immutable-return.pdf");
  vi.spyOn(service, "resend").mockResolvedValue({ status: "sent" });
  return service.returnComplete(shop, { id: 1, revision: 2, requestId: "return-finished", data: data() });
}
function ctx(user: any = null, cookie = "", origin = "https://rentals.example.test") {
  return { user, req: { protocol: "https", headers: { origin, cookie }, get: (name: string) => name === "host" ? "rentals.example.test" : undefined } as any, res: {} as any };
}
async function shopCaller(locationIds = [1], origin?: string) {
  const token = "s".repeat(43);
  await repo.insert("shopUsers", { id: 1, name: "Shop", active: true, passwordHash: "activated-test-hash", locationIds: JSON.stringify(locationIds) });
  await repo.insert("sessions", { tokenHash: tokenHash(token), shopUserId: 1, expiresAt: now + 10000, createdAt: now });
  return createRentalHandoffRouter(service).createCaller(ctx(null, `${RENTAL_COOKIE}=${token}`, origin));
}

describe("return draft lifecycle", () => {
  it("saves encrypted incomplete scalar drafts while Out and returns them without altering signed pickup", async () => {
    const packets = structuredClone(repo.rows.packets);
    const incomplete = { ...data(), returnedAt: "", odometer: 0, representativeName: "", condition: CONDITION_AREAS.map(area => ({ area, ok: false, note: "" })) };
    expect(await service.saveReturn(shop, { id: 1, revision: 2, data: incomplete })).toEqual({ revision: 3 });
    expect(repo.rows.records[0].returnPayload).not.toContain("returnedAt");
    expect((await service.get(shop, 1)).returnData).toEqual(incomplete);
    expect(repo.rows.packets).toEqual(packets); expect(repo.rows.vehicles[0].lastOdometer).toBe(1000);
    expectNoExternalCalls();
  });
  it("permits Claims/Admin and assigned shops, but rejects outsiders, unlocked, missing pickup and wrong states", async () => {
    await expect(service.saveReturn(outsider, { id: 1, revision: 2, data: data() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const actor of [claims, admin]) { const revision = repo.rows.records[0].revision; await service.saveReturn(actor, { id: 1, revision, data: data() }); }
    const revision = repo.rows.records[0].revision;
    for (const status of ["Scheduled", "Returned", "Closed"]) { repo.rows.records[0].status = status; await expect(service.saveReturn(shop, { id: 1, revision, data: data() })).rejects.toMatchObject({ code: "CONFLICT" }); }
    repo.rows.records[0].status = "Out"; repo.rows.records[0].activePacketId = null;
    await expect(service.saveReturn(shop, { id: 1, revision, data: data() })).rejects.toMatchObject({ code: "CONFLICT" });
    repo.rows.records[0].activePacketId = 1; repo.rows.packets[0].kind = "return";
    await expect(service.saveReturn(shop, { id: 1, revision, data: data() })).rejects.toMatchObject({ code: "CONFLICT" });
    expectNoExternalCalls();
  });
  it("rejects settlement on drafts, stale revisions and zero affected-row CAS", async () => {
    await expect(service.saveReturn(shop, { id: 1, revision: 2, data: { ...data(), chargesSettled: true } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.saveReturn(shop, { id: 1, revision: 1, data: data() })).rejects.toMatchObject({ code: "CONFLICT" });
    repo.failRecordCas = true;
    await expect(service.saveReturn(shop, { id: 1, revision: 2, data: data() })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.rows.records[0]).toMatchObject({ revision: 2, returnPayload: null }); expect(repo.rows.audit).toHaveLength(0); expectNoExternalCalls();
  });
  it("allows only one concurrent draft save per revision", async () => {
    const results = await Promise.allSettled([service.saveReturn(shop, { id: 1, revision: 2, data: data() }), service.saveReturn(claims, { id: 1, revision: 2, data: { ...data(), cleaning: 25 } })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    expect(repo.rows.records[0].revision).toBe(3); expect(repo.rows.audit).toHaveLength(1); expectNoExternalCalls();
  });
  it("invalidates only prior return signatures on changed facts and requires new signatures", async () => {
    await service.saveReturn(shop, { id: 1, revision: 2, data: data() }); await returnEvidence();
    const changed = { ...data(), cleaning: 25 };
    await expect(service.returnComplete(shop, { id: 1, revision: 3, requestId: "changed-return", data: changed })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const oldAssets = structuredClone(repo.rows.assets); await service.saveReturn(shop, { id: 1, revision: 3, data: changed });
    const current = await service.get(shop, 1);
    expect(current.assets.filter(a => a.kind.startsWith("return"))).toHaveLength(5);
    expect(current.assets.filter(a => a.kind === "renterSignature" || a.kind === "representativeSignature")).toHaveLength(2);
    expect(repo.rows.assets).toEqual(oldAssets);
    const audit = decryptRental<any>(repo.rows.audit.at(-1).detail);
    expect(audit).toMatchObject({ fields: ["cleaning"], assetCutoffId: 9, resignRequired: true });
    await expect(service.returnComplete(shop, { id: 1, revision: 4, requestId: "changed-return", data: changed })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const kind of ["returnRenterSignature", "returnRepresentativeSignature"]) await repo.insert("assets", { rentalId: 1, kind, createdAt: now, storageKey: "private/new-signature" });
    await service.saveReturn(shop, { id: 1, revision: 4, data: changed }); // No-op save retains fresh evidence.
    expect((await service.get(shop, 1)).assets.filter(a => a.kind.startsWith("return") && a.kind.endsWith("Signature"))).toHaveLength(2);
    vi.spyOn(service, "buildPacket").mockResolvedValue("immutable-return.pdf"); vi.spyOn(service, "resend").mockResolvedValue({ status: "sent" });
    expect((await service.returnComplete(shop, { id: 1, revision: 5, requestId: "changed-return", data: changed })).status).toBe("Returned");
    expectNoExternalCalls();
  });
  it("still validates final odometer, condition/time and evidence after draft saves", async () => {
    for (const incomplete of [{ ...data(), odometer: 0 }, { ...data(), returnedAt: "" }, { ...data(), representativeName: "" }, { ...data(), condition: CONDITION_AREAS.map(area => ({ area, ok: false, note: "" })) }, data()]) {
      const revision = repo.rows.records[0].revision;
      await service.saveReturn(shop, { id: 1, revision, data: incomplete });
      await expect(service.returnComplete(shop, { id: 1, revision: revision + 1, requestId: "invalid-final-return", data: incomplete })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(repo.rows.packets).toHaveLength(1); expectNoExternalCalls();
  });
  it("rejects a stale completion racing a draft save before any PDF or payment work", async () => {
    await service.saveReturn(shop, { id: 1, revision: 2, data: data() }); await returnEvidence();
    const pickup = structuredClone(repo.rows.packets[0]);
    const results = await Promise.allSettled([service.saveReturn(shop, { id: 1, revision: 3, data: { ...data(), cleaning: 25 } }), service.returnComplete(shop, { id: 1, revision: 3, requestId: "racing-return", data: data() })]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
    expect(repo.rows.records[0]).toMatchObject({ status: "Out", revision: 4 }); expect(repo.rows.packets).toEqual([pickup]); expectNoExternalCalls();
  });
});

describe("required return instrument-cluster evidence", () => {
  it("blocks direct service completion without a dashboard even when four photos and signatures are present", async () => {
    await returnEvidence(); repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "returnDashboard");
    const before = structuredClone(repo.rows);
    await expect(service.returnComplete(shop, { id: 1, revision: 2, requestId: "direct-return-missing-dashboard", data: data() })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Add the return dashboard / instrument-cluster photo showing alerts, fuel level, and odometer (mileage)." });
    expect(repo.rows).toEqual(before); expectNoExternalCalls();
  });
  it.each(["extra", "returnExtra", "dashboard", "claimPhoto"])("does not treat %s as return dashboard evidence", async kind => {
    await returnEvidence(); repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "returnDashboard");
    await repo.insert("assets", { rentalId: 1, kind, storageKey: "private/substitute", mime: "image/png", createdAt: now });
    await expect(service.returnComplete(shop, { id: 1, revision: 2, requestId: `return-dashboard-substitute-${kind}`, data: data() })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("return dashboard / instrument-cluster") });
    expect(repo.rows.records[0]).toMatchObject({ status: "Out", revision: 2 }); expect(repo.rows.packets).toHaveLength(1); expectNoExternalCalls();
  });
  it("blocks an authenticated router completion bypass when a dashboard is missing", async () => {
    await returnEvidence(); repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "returnDashboard");
    await expect(createRentalHandoffRouter(service).createCaller(ctx({ id: 1, name: "Admin", role: "admin" })).returnComplete({ id: 1, revision: 2, requestId: "router-missing-dashboard", data: data() })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("odometer (mileage)") });
    expectNoExternalCalls();
  });
  it("requires return dashboard evidence from the issued pickup or later, selecting the newest image append-only", async () => {
    await returnEvidence(); const old = repo.rows.assets.find(a => a.kind === "returnDashboard"); old.createdAt = repo.rows.packets[0].createdAt - 1;
    await expect(service.returnComplete(shop, { id: 1, revision: 2, requestId: "stale-return-dashboard", data: data() })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("return dashboard") });
    const first = await repo.insert("assets", { rentalId: 1, kind: "returnDashboard", storageKey: "private/return-dashboard-first", mime: "image/png", createdAt: now });
    const newest = await repo.insert("assets", { rentalId: 1, kind: "returnDashboard", storageKey: "private/return-dashboard-newest", mime: "image/jpeg", createdAt: now });
    const originals = structuredClone(repo.rows.assets);
    vi.spyOn(service, "buildPacket").mockResolvedValue("immutable-return.pdf"); vi.spyOn(service, "resend").mockResolvedValue({ status: "sent" });
    expect((await service.returnComplete(shop, { id: 1, revision: 2, requestId: "stale-return-dashboard", data: data() })).status).toBe("Returned");
    expect(repo.rows.assets).toEqual(originals);
    const snapshot = decryptRental<RentalPdfInput>(repo.rows.packets[1].snapshot);
    expect(snapshot.assets.filter(a => a.kind === "returnDashboard")).toEqual([expect.objectContaining({ id: newest })]);
    expect(snapshot.assets.some(a => a.id === first)).toBe(false); expectNoExternalCalls();
  });
  it.each([NaN,Infinity,-Infinity,-1,2000001,null,undefined,"1100"])("rejects invalid return mileage %s before completion or any external write", async odometer => {
    await returnEvidence();
    await expect(service.returnComplete(shop, { id: 1, revision: 2, requestId: "invalid-return-mileage", data: { ...data(), odometer } as any })).rejects.toThrow();
    expect(repo.rows.records[0]).toMatchObject({ status: "Out", revision: 2 }); expect(repo.rows.packets).toHaveLength(1); expectNoExternalCalls();
  });
  it("allows genuine zero return mileage while preserving lower-than-pickup and fleet guards", async () => {
    await returnEvidence();
    await expect(service.returnComplete(shop, { id: 1, revision: 2, requestId: "zero-return", data: { ...data(), odometer: 0 } })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Return odometer cannot be below pickup or fleet odometer." });
    const snapshot = decryptRental<RentalPdfInput>(repo.rows.packets[0].snapshot); snapshot.draft.odometerOut = 0;
    repo.rows.packets[0].snapshot = encryptRental(snapshot);
    await expect(service.returnComplete(shop, { id: 1, revision: 2, requestId: "zero-return", data: { ...data(), odometer: 0 } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    repo.rows.vehicles[0].lastOdometer = 0;
    vi.spyOn(service, "buildPacket").mockResolvedValue("immutable-return.pdf"); vi.spyOn(service, "resend").mockResolvedValue({ status: "sent" });
    expect((await service.returnComplete(shop, { id: 1, revision: 2, requestId: "zero-return", data: { ...data(), odometer: 0 } })).status).toBe("Returned");
    expect(decryptRental<any>(repo.rows.records[0].returnPayload).odometer).toBe(0); expect(repo.rows.vehicles[0].lastOdometer).toBe(0); expectNoExternalCalls();
  });
  it.each(["Returned", "Closed"])("replays a legacy %s return without new evidence or snapshot/fleet mutations", async status => {
    const returned = await finishReturn();
    repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "returnDashboard");
    const snapshot = decryptRental<RentalPdfInput>(repo.rows.packets[1].snapshot); snapshot.assets = snapshot.assets.filter(a => a.kind !== "returnDashboard");
    repo.rows.packets[1].snapshot = encryptRental(snapshot); repo.rows.records[0].status = status;
    const immutable = structuredClone(repo.rows);
    expect((await service.get(admin, 1)).status).toBe(status);
    expect(await service.returnComplete(admin, { id: 1, revision: 2, requestId: "return-finished", data: { ...data(), odometer: 0 } })).toEqual(returned);
    expect(repo.rows).toEqual(immutable); expect(service.buildPacket).toHaveBeenCalledTimes(1); expectNoExternalCalls();
  });
});

describe("charges-settled/posting confirmation", () => {
  it("confirms after an unsettled signed return and closes without rewriting PDF or making payments/hold calls", async () => {
    await finishReturn();
    await expect(service.close(claims, 1, 3)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const immutable = structuredClone({ packets: repo.rows.packets, assets: repo.rows.assets, vehicles: repo.rows.vehicles, emails: repo.rows.emails, pickupPayload: repo.rows.records[0].payload });
    const originalReturn = decryptRental<RentalPdfInput>(repo.rows.packets[1].snapshot);
    const before = decryptRental<any>(repo.rows.records[0].returnPayload); repo.writes = [];
    expect(await service.confirmSettlement(claims, { id: 1, revision: 3, confirmed: true })).toEqual({ revision: 4, status: "Returned", chargesSettled: true });
    expect(decryptRental(repo.rows.records[0].returnPayload)).toEqual({ ...before, chargesSettled: true });
    expect((await service.get(claims, 1)).returnData?.chargesSettled).toBe(true);
    expect(originalReturn.returnData?.chargesSettled).toBe(false);
    expect(decryptRental<any>(repo.rows.audit.at(-1).detail)).toMatchObject({ revision: 4, postingConfirmed: true, chargesSettled: true, paymentActionPerformed: false, securityHoldActionPerformed: false });
    expect(repo.rows.audit.at(-1)).toMatchObject({ actorKey: claims.key, action: "return.settlement.confirm" });
    await expect(service.close(shop, 1, 4)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await service.close(admin, 1, 4)).toEqual({ revision: 5, status: "Closed" });
    expect({ packets: repo.rows.packets, assets: repo.rows.assets, vehicles: repo.rows.vehicles, emails: repo.rows.emails, pickupPayload: repo.rows.records[0].payload }).toEqual(immutable);
    expect(repo.writes.every(w => ["records", "audit"].includes(w.table))).toBe(true); expect(service.buildPacket).toHaveBeenCalledTimes(1); expect(service.resend).toHaveBeenCalledTimes(1); expectNoExternalCalls();
  });
  it("rejects shop confirmation, false attestation, pre-return/closed states and stale revisions", async () => {
    await expect(service.confirmSettlement(shop, { id: 1, revision: 2, confirmed: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.confirmSettlement(admin, { id: 1, revision: 2, confirmed: false as any })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.confirmSettlement(admin, { id: 1, revision: 2, confirmed: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await finishReturn();
    await expect(service.confirmSettlement(admin, { id: 1, revision: 2, confirmed: true })).rejects.toMatchObject({ code: "CONFLICT" });
    repo.rows.records[0].status = "Closed";
    await expect(service.confirmSettlement(admin, { id: 1, revision: 3, confirmed: true })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expectNoExternalCalls();
  });
  it("serializes competing confirmations and fails failed CAS without an audit or closure", async () => {
    await finishReturn(); const auditCount = repo.rows.audit.length;
    repo.failRecordCas = true;
    await expect(service.confirmSettlement(admin, { id: 1, revision: 3, confirmed: true })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.rows.audit).toHaveLength(auditCount); expect(decryptRental<any>(repo.rows.records[0].returnPayload).chargesSettled).toBe(false);
    repo.failRecordCas = false;
    const results = await Promise.allSettled([service.confirmSettlement(admin, { id: 1, revision: 3, confirmed: true }), service.confirmSettlement(claims, { id: 1, revision: 3, confirmed: true }), service.close(claims, 1, 3)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(repo.rows.records[0]).toMatchObject({ revision: 4, status: "Returned" });
    expect(repo.rows.audit.filter(a => a.action === "return.settlement.confirm")).toHaveLength(1); expectNoExternalCalls();
  });
});

describe("return router auth contracts", () => {
  it("requires authentication and literal confirmation", async () => {
    const router = createRentalHandoffRouter(service);
    await expect(router.createCaller(ctx()).saveReturn({ id: 1, revision: 2, data: data() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(router.createCaller(ctx()).confirmSettlement({ id: 1, revision: 2, confirmed: true })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(router.createCaller(ctx({ id: 2, role: "user" })).confirmSettlement({ id: 1, revision: 2, confirmed: false as any })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expectNoExternalCalls();
  });
  it("inherits shop same-origin/location checks and denies shop settlement", async () => {
    const caller = await shopCaller();
    await expect(caller.confirmSettlement({ id: 1, revision: 2, confirmed: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await caller.saveReturn({ id: 1, revision: 2, data: data() })).toEqual({ revision: 3 });
    const evil = createRentalHandoffRouter(service).createCaller(ctx(null, `${RENTAL_COOKIE}=${"s".repeat(43)}`, "https://evil.example.test"));
    await expect(evil.saveReturn({ id: 1, revision: 3, data: data() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    repo.rows.shopUsers[0].locationIds = "[2]";
    await expect(caller.saveReturn({ id: 1, revision: 3, data: data() })).rejects.toMatchObject({ code: "NOT_FOUND" }); expectNoExternalCalls();
  });
  it("allows native Claims/Admin to confirm through the same authenticated router", async () => {
    await finishReturn(); const router = createRentalHandoffRouter(service);
    expect(await router.createCaller(ctx({ id: 2, name: "Claims", role: "user" })).confirmSettlement({ id: 1, revision: 3, confirmed: true })).toMatchObject({ revision: 4, chargesSettled: true });
    expect(await router.createCaller(ctx({ id: 1, name: "Admin", role: "admin" })).close({ id: 1, revision: 4 })).toMatchObject({ status: "Closed" }); expectNoExternalCalls();
  });
});
