import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { RentalHandoffService, RENTAL_SUPPORT_MAX_BYTES, type RentalRepository, type RentalTable, type RentalQuery, type RentalDependencies, type RentalPdfInput } from "./rentalHandoffService";
import { createRentalHandoffRouter } from "./routers/rentalHandoff";
import { decryptRental, encryptRental, tokenHash, RENTAL_COOKIE } from "./rentalHandoffSecurity";
import { emptyRentalDraft, PICKUP_EVIDENCE_KINDS, RETURN_EVIDENCE_KINDS, DEFAULT_RENTAL_RATES, type RentalActor } from "../shared/rentalHandoff";

class MemoryRepo implements RentalRepository {
  rows: Record<RentalTable, any[]> = { locations: [], vehicles: [], records: [], assets: [], packets: [], audit: [], emails: [], settings: [], shopUsers: [], sessions: [] };
  calls: Array<{ table: RentalTable; query: RentalQuery }> = [];
  failInsert: RentalTable | null = null;
  duplicateVehicle = false;
  private tail: Promise<unknown> = Promise.resolve();
  async find(table: RentalTable, query: RentalQuery = {}): Promise<any[]> {
    this.calls.push({ table, query });
    let rows = this.rows[table].filter(row => Object.entries(query.eq || {}).every(([key, value]) => row[key] === value) && Object.entries(query.in || {}).every(([key, value]) => value.includes(row[key])));
    if (query.order) rows = [...rows].sort((a, b) => b[query.order!] - a[query.order!]);
    return structuredClone(rows.slice(0, query.limit || 500));
  }
  async insert(table: RentalTable, values: any): Promise<number> {
    if (table === this.failInsert) throw new Error("synthetic insert failure");
    if (table === "vehicles" && (this.duplicateVehicle || this.rows.vehicles.some(row => row.vin.toUpperCase() === values.vin.toUpperCase()))) throw new Error("wrapped database error", { cause: Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY", errno: 1062 }) });
    const id = values.id || Math.max(0, ...this.rows[table].map(row => row.id)) + 1;
    this.rows[table].push({ activePacketId: null, returnPayload: null, signerName: null, providerId: null, error: null, sentAt: null, ...structuredClone(values), id });
    return id;
  }
  async update(table: RentalTable, query: RentalQuery, values: any): Promise<number> { const found = await this.find(table, query); for (const row of found) Object.assign(this.rows[table].find(item => item.id === row.id), structuredClone(values)); return found.length; }
  async remove(table: RentalTable, query: RentalQuery): Promise<void> { const found = await this.find(table, query); this.rows[table] = this.rows[table].filter(row => !found.some(item => item.id === row.id)); }
  async transaction<T>(work: (tx: RentalRepository) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => { const before = structuredClone(this.rows); try { return await work(this); } catch (error) { this.rows = before; throw error; } });
    this.tail = run.catch(() => undefined); return run;
  }
}
const now = Date.parse("2026-11-10T17:00:00Z");
const admin: RentalActor = { key: "native:1", name: "Setup Administrator", role: "admin", locationIds: [] };
const claims: RentalActor = { ...admin, key: "native:2", role: "claims" };
const shop: RentalActor = { key: "shop:1", name: "Onsite Technician", role: "shop", locationIds: [1] };
const manual = { ymm: "2024 Toyota Camry", vin: "1HGCM82633A004355", plate: "SETUP01" };
const audit = { ipHash: "test-hash", device: "test-device" };
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0JcAAAAASUVORK5CYII=";
let repo: MemoryRepo, service: RentalHandoffService, deps: RentalDependencies;
function draft() { return { ...emptyRentalDraft(), renterName: "Synthetic Renter", claimNumber: "SETUP-001", locationId: 1, vehicleId: 0, odometerOut: 12345 }; }
function context(user: any = { id: 1, role: "admin", name: "Setup Administrator" }, cookie = "") { return { user, req: { protocol: "https", headers: { origin: "https://rentals.example.test", cookie, "user-agent": "test" }, ip: "192.0.2.1", get: (name: string) => name === "host" ? "rentals.example.test" : undefined } as any, res: { cookie: vi.fn(), clearCookie: vi.fn() } as any }; }
async function shopContext() { const token = "s".repeat(43); await repo.insert("shopUsers", { id: 1, name: shop.name, email: "shop@example.test", passwordHash: "test-only", active: true, locationIds: "[1]", createdAt: now }); await repo.insert("sessions", { tokenHash: tokenHash(token), shopUserId: 1, createdAt: now, expiresAt: now + 3600000 }); return context(null, `${RENTAL_COOKIE}=${token}`); }
async function pdfBase64() { const pdf = await PDFDocument.create(); pdf.addPage(); return Buffer.from(await pdf.save()).toString("base64"); }
beforeEach(async () => {
  process.env.JWT_SECRET = "synthetic-test-secret-no-live-use";
  repo = new MemoryRepo();
  await repo.insert("locations", { id: 1, name: "Synthetic Location", address: "Test address", phone: "555-0100", timezone: "America/New_York", active: true });
  await repo.insert("locations", { id: 2, name: "Other Location", address: "Test address", phone: "555-0100", timezone: "America/New_York", active: true });
  deps = { repo, now: () => now, put: vi.fn(async key => ({ key, url: "PRIVATE_URL_MUST_NOT_LEAK" })), read: vi.fn(async () => Buffer.from("synthetic-image")), buildPickup: vi.fn(async () => Buffer.from("%PDF-synthetic")), buildReturn: vi.fn(async () => Buffer.from("%PDF-synthetic-return")), sendEmail: vi.fn(async () => ({ providerId: "synthetic" })), providerReady: () => false };
  service = new RentalHandoffService(deps);
});
afterEach(() => vi.unstubAllGlobals());

describe("rental manual setup", () => {
  it("starts with no inventory and atomically creates a real inventory record and encrypted assigned draft", async () => {
    expect(repo.rows.vehicles).toHaveLength(0);
    const created = await createRentalHandoffRouter(service).createCaller(context()).create({ draft: { ...draft(), vehicleId: null }, vehicle: { ...manual, vin: manual.vin.toLowerCase() } });
    expect(created).toEqual({ id: 1, revision: 1 });
    expect(repo.rows.vehicles).toEqual([expect.objectContaining({ ...manual, id: 1, locationId: 1, active: true, lastOdometer: 12345 })]);
    expect(repo.rows.records[0]).toMatchObject({ vehicleId: 1, status: "Scheduled", rentalVinLastSix: "004355", plateSearch: "setup01 " });
    expect(decryptRental(repo.rows.records[0].payload)).toMatchObject({ vehicleId: 1, locationId: 1 });
    expect(repo.rows.audit.map(row => row.action)).toEqual(["vehicle.create", "rental.create"]);
    expect(deps.sendEmail).not.toHaveBeenCalled(); expect(deps.put).not.toHaveBeenCalled();
  });
  it.each(["", undefined, 0] as const)("accepts empty inventory selection %s with optional manual metadata", async vehicleId => {
    await service.create(claims, { ...draft(), vehicleId }, manual); expect(repo.rows.records[0].vehicleId).toBe(1);
  });
  it("schedules and saves an unassigned rental without inventory or a plate", async () => {
    const created = await service.create(claims, { ...draft(), claimNumber: "MDW-1234-123456-123456" });
    expect(repo.rows.vehicles).toHaveLength(0);
    expect(repo.rows.records[0]).toMatchObject({ vehicleId: 0, rentalVinLastSix: "", status: "Scheduled" });
    const stored = decryptRental<any>(repo.rows.records[0].payload);
    expect((await service.save(claims, created.id, 1, { ...stored, staffNote: "Prepare for arrival" })).revision).toBe(2);
    await expect(service.complete(shop, { id: created.id, revision: 2, requestId: "no-vehicle-pickup" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(deps.sendEmail).not.toHaveBeenCalled(); expect(repo.rows.packets).toHaveLength(0);
  });
  it("allows blank manual plates and assigns an unassigned rental on site with fresh mileage", async () => {
    const created = await service.create(claims, draft());
    await service.assignVehicle(shop, { ...created, vehicle: { ...manual, plate: "" } });
    expect(repo.rows.vehicles[0].plate).toBe("");
    expect(decryptRental<any>(repo.rows.records[0].payload)).toMatchObject({ vehicleId: 1, odometerOut: null });
    expect(repo.rows.audit.map(row => row.action)).toContain("vehicle.assign");
    await expect(service.assignVehicle({ ...shop, locationIds: [2] }, { id: created.id, revision: 2, vehicleId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    repo.rows.records[0].status = "Out";
    await expect(service.assignVehicle(shop, { id: created.id, revision: 2, vehicleId: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("serializes competing pickup assignments and never assigns the same vehicle twice", async () => {
    const a = await service.create(claims, draft()), b = await service.create(claims, draft());
    await repo.insert("vehicles", { ...manual, id: 1, locationId: 1, lastOdometer: 0, active: true });
    const results = await Promise.allSettled([service.assignVehicle(shop, { ...a, vehicleId: 1 }), service.assignVehicle(shop, { ...b, vehicleId: 1 })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(repo.rows.records.filter(r => r.vehicleId === 1)).toHaveLength(1);
  });
  it("invalidates pre-assignment condition images but retains their protected originals", async () => {
    const a = await service.create(claims, draft());
    for(const kind of [...PICKUP_EVIDENCE_KINDS,"extra"])await repo.insert("assets", { rentalId: a.id, kind, storageKey: `old-private-${kind}`, createdAt: now });
    await repo.insert("assets", { rentalId: a.id, kind: "licenseFront", storageKey: "private-license", createdAt: now });
    await repo.insert("assets", { rentalId: a.id, kind: "licenseBack", storageKey: "private-license-back", createdAt: now });
    const originals=structuredClone(repo.rows.assets);
    await service.assignVehicle(shop, { ...a, vehicle: { ...manual, plate: "" } });
    expect((await service.versionAssets(repo, a.id)).map(asset=>asset.kind).sort()).toEqual(["licenseBack","licenseFront"]);
    expect(repo.rows.assets).toEqual(originals);
    for(const kind of PICKUP_EVIDENCE_KINDS)await repo.insert("assets",{rentalId:a.id,kind,storageKey:`new-private-${kind}`,createdAt:now});
    const fresh=await service.versionAssets(repo,a.id);
    expect(fresh.filter(asset=>(PICKUP_EVIDENCE_KINDS as readonly string[]).includes(asset.kind))).toHaveLength(11);
    expect(fresh.filter(asset=>(PICKUP_EVIDENCE_KINDS as readonly string[]).includes(asset.kind)).every(asset=>asset.id>Math.max(...originals.map(a=>a.id)))).toBe(true);
  });
  it("reuses exact available VIN metadata without duplication or overwriting facts", async () => {
    await repo.insert("vehicles", { ...manual, id: 7, locationId: 1, lastOdometer: 12345, active: true });
    const original = structuredClone(repo.rows.vehicles);
    await service.create(claims, draft(), { ...manual, lastOdometer: 12345 });
    expect(repo.rows.vehicles).toEqual(original); expect(repo.rows.records[0].vehicleId).toBe(7);
    expect(decryptRental(repo.rows.audit[0].detail)).toMatchObject({ inventoryCreated: false });
  });
  it.each([{ ymm: "2025 Toyota Camry" }, { plate: "DIFFERENT" }, { locationId: 2 }, { active: false }, { lastOdometer: 12346 }])("rejects existing VIN conflicts without writes: %j", async differences => {
    await repo.insert("vehicles", { ...manual, locationId: 1, lastOdometer: 12345, active: true, ...differences });
    const before = structuredClone(repo.rows);
    await expect(service.create(admin, draft(), { ...manual, lastOdometer: 12345 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.rows).toEqual(before);
  });
  it.each(["Scheduled", "Out"])("rejects reuse of a VIN assigned to a %s rental", async status => {
    await repo.insert("vehicles", { ...manual, id: 1, locationId: 1, lastOdometer: 12345, active: true });
    await repo.insert("records", { id: 1, vehicleId: 1, locationId: 1, status });
    await expect(service.create(admin, draft(), manual)).rejects.toMatchObject({ code: "CONFLICT" }); expect(repo.rows.records).toHaveLength(1);
  });
  it("rolls inventory back if rental or audit insert fails", async () => {
    for (const table of ["records", "audit"] as const) {
      repo.failInsert = table;
      await expect(service.create(admin, draft(), manual)).rejects.toThrow("synthetic insert failure");
      expect(repo.rows.vehicles).toHaveLength(0); expect(repo.rows.records).toHaveLength(0); expect(repo.rows.audit).toHaveLength(0);
    }
  });
  it("rolls back a newly entered inventory record on odometer conflict", async () => {
    await expect(service.create(admin, draft(), { ...manual, lastOdometer: 15000 })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(repo.rows.vehicles).toHaveLength(0);
  });
  it.each(["SHORT", "1HGCM82633A00435I", "1HGCM82633A00435O", "1HGCM82633A00435Q", "1HGCM82633A00435!"])("validates manual VIN on the service: %s", async vin => {
    await expect(service.create(admin, draft(), { ...manual, vin })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(repo.rows.vehicles).toHaveLength(0);
  });
  it.each([{ ymm: "Camry" }, { ymm: "2024 Toyota" }, { lastOdometer: -1 }, { lastOdometer: 1.5 }, { lastOdometer: 2000001 }, { lastOdometer: "12345" }])("validates trusted manual facts: %j", async invalid => {
    await expect(service.create(admin, draft(), { ...manual, ...invalid } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(repo.rows.vehicles).toHaveLength(0);
  });
  it("keeps create Claims/Admin-only even for an onsite shop user", async () => {
    await expect(service.create(shop, draft(), manual)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createRentalHandoffRouter(service).createCaller(await shopContext()).create({ draft: draft(), vehicle: manual })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(repo.rows.vehicles).toHaveLength(0);
  });
  it("validates active location and rejects missing or ambiguous vehicle selection", async () => {
    await expect(service.create(admin, { ...draft(), locationId: 0 }, manual)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    repo.rows.locations[0].active = false;
    await expect(service.create(admin, draft(), manual)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.create(admin, draft())).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.create(admin, { ...draft(), vehicleId: 1 }, manual)).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(repo.rows.vehicles).toHaveLength(0);
  });
  it("retains the existing inventory selection path and its scheduled-draft behavior", async () => {
    await repo.insert("vehicles", { ...manual, id: 5, locationId: 1, lastOdometer: 12345, active: true });
    await service.create(admin, { ...draft(), vehicleId: 5 }); await service.create(admin, { ...draft(), vehicleId: 5 });
    expect(repo.rows.vehicles).toHaveLength(1); expect(repo.rows.records).toHaveLength(2);
    await expect(service.create(admin, { ...draft(), locationId: 2, vehicleId: 5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("does not fill missing pickup mileage from inventory and retains genuine zero readings", async () => {
    await repo.insert("vehicles", { ...manual, id: 5, locationId: 1, lastOdometer: 12345, active: true });
    await service.create(admin, { ...draft(), vehicleId: 5, odometerOut: null });
    expect(decryptRental<any>(repo.rows.records[0].payload).odometerOut).toBeNull();
    await service.create(admin, { ...draft(), odometerOut: 0 }, { ...manual, vin: "1HGCM82633A004356", plate: "ZERO" });
    expect(decryptRental<any>(repo.rows.records[1].payload).odometerOut).toBe(0);
    expect(repo.rows.vehicles[1].lastOdometer).toBe(0); expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("serializes competing manual setup and translates a unique VIN race into a safe conflict", async () => {
    const results = await Promise.allSettled([service.create(admin, draft(), manual), service.create(claims, draft(), manual)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(repo.rows.vehicles).toHaveLength(1); expect(repo.rows.records).toHaveLength(1);
    repo.rows.vehicles = []; repo.rows.records = []; repo.rows.audit = []; repo.duplicateVehicle = true;
    await expect(service.create(admin, draft(), manual)).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("another request") }); expect(repo.rows.records).toHaveLength(0);
  });
});

describe("authenticated VIN decoder", () => {
  const decodedResponse = () => new Response(JSON.stringify({ Results: [{ Variable: "Model Year", Value: "2024" }, { Variable: "Make", Value: "TOYOTA" }, { Variable: "Model", Value: "Camry" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  it("maps existing vPIC fields for both Claims and onsite shop without writing inventory", async () => {
    const fetcher = vi.fn(async () => decodedResponse()); vi.stubGlobal("fetch", fetcher);
    const router = createRentalHandoffRouter(service);
    expect(await router.createCaller(context({ id: 2, name: "Claims", role: "user" })).decodeVin({ vin: manual.vin.toLowerCase() })).toEqual({ year: "2024", make: "TOYOTA", model: "Camry" });
    expect(await router.createCaller(await shopContext()).decodeVin({ vin: manual.vin })).toEqual({ year: "2024", make: "TOYOTA", model: "Camry" });
    expect(fetcher).toHaveBeenCalledWith(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${manual.vin}?format=json`, expect.objectContaining({ redirect: "error" })); expect(repo.rows.vehicles).toHaveLength(0);
  });
  it("rejects anonymous/invalid requests before contacting vPIC", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const router = createRentalHandoffRouter(service);
    await expect(router.createCaller(context(null)).decodeVin({ vin: manual.vin })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(router.createCaller(context()).decodeVin({ vin: "INVALID" })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails safely for incomplete decoding and provider errors, preserving manual-entry fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Results: [] }), { status: 200 })));
    await expect(service.decodeVin(claims, manual.vin)).rejects.toMatchObject({ code: "NOT_FOUND" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("synthetic outage"); }));
    await expect(service.decodeVin(shop, manual.vin)).rejects.toMatchObject({ code: "BAD_GATEWAY", message: expect.stringContaining("manually") });
  });
});

describe("dedicated dashboard image uploads", () => {
  it.each(PICKUP_EVIDENCE_KINDS.slice(4,10))("accepts dedicated pickup %s append-only without signatory and enforces phase",async kind=>{
    const rental=await service.create(admin,draft(),manual);
    const caller=createRentalHandoffRouter(service).createCaller(context());
    const first=await caller.upload({id:rental.id,kind,base64:png});
    const second=await service.upload(shop,{id:rental.id,kind,base64:png},audit);
    expect((await service.versionAssets(repo,rental.id)).filter(a=>a.kind===kind).map(a=>a.id)).toEqual([second.id]);
    expect(repo.rows.assets.filter(a=>a.kind===kind)).toHaveLength(2);expect(first.signerName).toBeNull();
    repo.rows.records[0].status="Out";repo.rows.records[0].activePacketId=88;
    await expect(service.upload(shop,{id:rental.id,kind,base64:png},audit)).rejects.toMatchObject({code:"CONFLICT"});
    expect(JSON.stringify([first,second])).not.toContain("PRIVATE");
  });
  it.each(RETURN_EVIDENCE_KINDS.slice(4,10))("accepts dedicated return %s only during locked Out phase",async kind=>{
    const rental=await service.create(admin,draft(),manual);
    await expect(service.upload(shop,{id:rental.id,kind,base64:png},audit)).rejects.toMatchObject({code:"CONFLICT"});
    repo.rows.records[0].status="Out";repo.rows.records[0].activePacketId=88;
    expect(await createRentalHandoffRouter(service).createCaller(context()).upload({id:rental.id,kind,base64:png})).toMatchObject({kind,signerName:null});
    repo.rows.records[0].status="Returned";
    await expect(service.upload(shop,{id:rental.id,kind,base64:png},audit)).rejects.toMatchObject({code:"CONFLICT"});
    expect(deps.put).toHaveBeenCalledTimes(1);expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("accepts pickup and return dashboards through the image-only endpoint without a signatory", async () => {
    const rental = await service.create(admin, draft(), manual);
    const before = structuredClone(repo.rows.records[0]);
    const caller = createRentalHandoffRouter(service).createCaller(context());
    const pickup = await caller.upload({ id: rental.id, kind: "dashboard", base64: `data:image/png;base64,${png}` });
    const replacement = await service.upload(shop, { id: rental.id, kind: "dashboard", base64: png }, audit);
    expect(repo.rows.records[0]).toEqual(before);
    expect(pickup).toMatchObject({ kind: "dashboard", signerName: null, url: `/api/rental-handoff/files/asset/${pickup.id}` });
    expect((await service.versionAssets(repo, rental.id)).filter(a => a.kind === "dashboard").map(a => a.id)).toEqual([replacement.id]);
    expect(repo.rows.assets.filter(a => a.kind === "dashboard")).toHaveLength(2);
    repo.rows.records[0].status = "Out"; repo.rows.records[0].activePacketId = 88;
    const returned = await caller.upload({ id: rental.id, kind: "returnDashboard", base64: png });
    expect(returned).toMatchObject({ kind: "returnDashboard", signerName: null });
    expect(repo.rows.assets.every(a => a.mime === "image/png" && a.storageKey.endsWith(".png"))).toBe(true);
    expect(deps.put).toHaveBeenCalledTimes(3); expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify([pickup, replacement, returned])).not.toContain("PRIVATE");
  });
  it.each(["dashboard", "returnDashboard"] as const)("rejects PDF, HTML and spoofed MIME for %s before storing assets", async kind => {
    const rental = await service.create(admin, draft(), manual);
    if (kind === "returnDashboard") { repo.rows.records[0].status = "Out"; repo.rows.records[0].activePacketId = 88; }
    const before = structuredClone(repo.rows);
    for (const base64 of [await pdfBase64(), `data:application/pdf;base64,${await pdfBase64()}`, `data:image/png;base64,${await pdfBase64()}`, `data:image/jpeg;base64,${png}`, Buffer.from("<html>not an image</html>").toString("base64")]) {
      await expect(service.upload(shop, { id: rental.id, kind, base64 }, audit)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(service.uploadSupport(admin, { id: rental.id, kind, base64: png } as any, audit)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repo.rows).toEqual(before); expect(deps.put).not.toHaveBeenCalled(); expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("keeps dashboard upload phase restrictions and completed legacy records locked", async () => {
    const rental = await service.create(admin, draft(), manual);
    await expect(service.upload(shop, { id: rental.id, kind: "returnDashboard", base64: png }, audit)).rejects.toMatchObject({ code: "CONFLICT" });
    repo.rows.records[0].status = "Out"; repo.rows.records[0].activePacketId = 88;
    await expect(service.upload(shop, { id: rental.id, kind: "dashboard", base64: png }, audit)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.upload({ ...shop, locationIds: [2] }, { id: rental.id, kind: "returnDashboard", base64: png }, audit)).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const status of ["Returned", "Closed"]) {
      repo.rows.records[0].status = status;
      for (const kind of ["dashboard", "returnDashboard"] as const) await expect(service.upload(shop, { id: rental.id, kind, base64: png }, audit)).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(repo.rows.assets).toEqual([]); expect(deps.put).not.toHaveBeenCalled(); expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});

describe("retained estimate and renter-vehicle photos", () => {
  async function created() { return service.create(admin, draft(), manual); }
  it("retains PDF/image estimate and onsite photos append-only without changing draft, signatures, or exposing keys", async () => {
    const rental = await created();
    await repo.insert("assets", { rentalId: rental.id, kind: "renterSignature", mime: "image/png", storageKey: "private/signature", uploadedBy: shop.key, createdAt: now });
    const beforeRecord = structuredClone(repo.rows.records[0]);
    const estimate = await createRentalHandoffRouter(service).createCaller(context()).uploadSupport({ id: rental.id, kind: "claimEstimate", base64: `data:application/pdf;base64,${await pdfBase64()}`, fileName: "../../untrusted.html" });
    const firstPhoto = await service.uploadSupport(shop, { id: rental.id, kind: "claimPhoto", base64: png }, audit);
    const secondPhoto = await service.uploadSupport(shop, { id: rental.id, kind: "claimPhoto", base64: `data:image/png;base64,${png}` }, audit);
    await service.uploadSupport(claims, { id: rental.id, kind: "claimEstimate", base64: png }, audit);
    expect(firstPhoto.id).not.toBe(secondPhoto.id); expect(repo.rows.assets).toHaveLength(5); expect(repo.rows.records[0]).toEqual(beforeRecord);
    expect((await service.get(shop, rental.id)).assets).toHaveLength(5);
    expect((await service.versionAssets(repo, rental.id)).some(asset => asset.kind === "renterSignature")).toBe(true);
    expect(estimate).toMatchObject({ kind: "claimEstimate", url: `/api/rental-handoff/files/asset/${estimate.id}` }); expect(JSON.stringify(estimate)).not.toContain("PRIVATE");
    expect(await service.authorizeFile(shop, "asset", estimate.id)).toMatchObject({ mime: "application/pdf", filename: `rental-asset-${estimate.id}.pdf` });
    expect(repo.rows.audit.filter(row => row.action === "support.append")).toHaveLength(4); expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("allows support append to locked Out rental without altering its signed packet", async () => {
    const rental = await created(); repo.rows.records[0].status = "Out"; repo.rows.records[0].activePacketId = 88;
    const before = structuredClone(repo.rows.records[0]); await service.uploadSupport(shop, { id: rental.id, kind: "claimPhoto", base64: png }, audit); expect(repo.rows.records[0]).toEqual(before);
  });
  it.each(["Returned", "Closed"])("locks support after %s and rejects cross-location access before storage", async status => {
    const rental = await created();
    await expect(service.uploadSupport({ ...shop, locationIds: [2] }, { id: rental.id, kind: "claimPhoto", base64: png }, audit)).rejects.toMatchObject({ code: "NOT_FOUND" });
    repo.rows.records[0].status = status;
    await expect(service.uploadSupport(shop, { id: rental.id, kind: "claimPhoto", base64: png }, audit)).rejects.toMatchObject({ code: "CONFLICT" }); expect(deps.put).not.toHaveBeenCalled();
  });
  it("rejects invalid base64, HTML, spoofed MIME, truncated PDF, and PDF-as-photo before storage", async () => {
    const rental = await created();
    for (const base64 of ["!!!!", "Zg==\n", Buffer.from("<html>not a PDF</html>").toString("base64"), "data:application/pdf;base64," + png, Buffer.from("%PDF-fake").toString("base64"), Buffer.from([255, 216, 255, 0, 255, 217]).toString("base64")]) await expect(service.uploadSupport(admin, { id: rental.id, kind: "claimEstimate", base64 }, audit)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.uploadSupport(admin, { id: rental.id, kind: "claimPhoto", base64: await pdfBase64() }, audit)).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(deps.put).not.toHaveBeenCalled();
  });
  it("enforces the exact 10 MB byte limit", async () => {
    const rental = await created(); const oversized = Buffer.alloc(RENTAL_SUPPORT_MAX_BYTES + 1); Buffer.from("%PDF-").copy(oversized);
    await expect(service.uploadSupport(admin, { id: rental.id, kind: "claimEstimate", base64: oversized.toString("base64") }, audit)).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(deps.put).not.toHaveBeenCalled();
  });
  it("excludes support PDFs/photos before storage reads and PDF image embedding", async () => {
    const rental = await created();
    await service.uploadSupport(admin, { id: rental.id, kind: "claimEstimate", base64: await pdfBase64() }, audit);
    await service.uploadSupport(shop, { id: rental.id, kind: "claimPhoto", base64: png }, audit);
    await repo.insert("assets", { rentalId: rental.id, kind: "front", mime: "image/png", storageKey: "private/front", uploadedBy: shop.key, createdAt: now });
    const assets = await service.versionAssets(repo, rental.id);
    const input: RentalPdfInput = { rentalId: rental.id, version: 1, draft: { ...draft(), vehicleId: 1 }, vehicle: { ...repo.rows.vehicles[0], status: "Available" }, location: repo.rows.locations[0], rates: { ...DEFAULT_RENTAL_RATES }, assets: [], settings: { counselApproved: false, registrationConfirmed: false, financialResponsibilityReference: "", omitFinancialReference: false, retentionYears: 7, senderEmail: "", rates: { ...DEFAULT_RENTAL_RATES }, rateVersion: 1 } };
    await service.buildPacket(input, assets, false);
    expect(deps.read).toHaveBeenCalledTimes(1); expect(deps.read).toHaveBeenCalledWith("private/front", 5 * 1024 * 1024);
    expect((deps.buildPickup as any).mock.calls[0][0].assets.map((asset: any) => asset.kind)).toEqual(["front"]);
  });
  it("rejects support passed through the ordinary signature/photo upload endpoint", async () => {
    const rental = await created(); await expect(service.upload(admin, { id: rental.id, kind: "claimPhoto", base64: png }, audit)).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(deps.put).not.toHaveBeenCalled();
  });
});
