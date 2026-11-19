import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFleetValues, RENTAL_DEMO_VIN, type FleetSnapshot } from "./rentalFleetSource";
import { RentalHandoffService, type RentalRepository, type RentalTable, type RentalQuery, type RentalDependencies } from "./rentalHandoffService";
import { encryptRental, decryptRental } from "./rentalHandoffSecurity";
import { emptyRentalDraft, DEFAULT_RENTAL_RATES, type RentalActor } from "../shared/rentalHandoff";

const vin = "1HGCM82633A004352", otherVin = "1HGCM82633A004353", now = Date.parse("2026-11-19T20:00:00Z");
function values(rows: Array<{ vin?: string; status?: unknown; location?: unknown; year?: unknown }> = [{}]) {
  const prefix = [["LoanerID", "Year", "Make", "Model", "Vin", "Color", "Tag"], [], [], ["LoanerID", "Year", "Make", "Model", "Vin", "Color", "Tag"]];
  return { valueRanges: [
    { range: "FLEET!A1:G5000", values: [...prefix, ...rows.map(r => ["TEST", r.year ?? "2026", "Fictional", "Sedan", r.vin ?? vin, "Gray", "TEST-ONLY"])] },
    { range: "FLEET!M1:M5000", values: [["LOCATION"], [], [], ["LOCATION"], ...rows.map(r => [r.location ?? ""])] },
    { range: "FLEET!X1:X5000", values: [["STATUS"], [], [], ["STATUS"], ...rows.map(r => [r.status ?? "Available"])] },
  ] };
}
describe("privacy-minimized FLEET parsing", () => {
  it("uses row four headers, ignores metrics and imports only exact Available", () => {
    const data = values([{}, { vin: otherVin, status: "Occupied", location: "Laurel" }]);
    data.valueRanges[0].values[1] = ["PRIVATE METRICS NOT RETAINED"]; data.valueRanges[0].values[2] = ["TOTALS NOT RETAINED"];
    const snapshot = parseFleetValues(data, now);
    expect(snapshot).toMatchObject({ rows: 2, available: 1, excluded: 1 });
    expect(snapshot.vehicles[0]).toMatchObject({ row: 5, location: "", usable: true });
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE|TOTALS|customer|Daily Price|MILES DRIVEN/i);
  });
  it.each(["Occupied", "Coming Soon", "Maintenance", "Detail", "Remove", "available", " Available", "Available ", "", "new status", 42])("fails closed for status %j", status => {
    const snapshot = parseFleetValues(values([{ status }]), now);
    expect(snapshot.available).toBe(0); expect(snapshot.vehicles[0].usable).toBe(false);
  });
  it("rejects duplicate VINs even when one row is Available", () => {
    const snapshot = parseFleetValues(values([{}, { status: "Occupied" }]), now);
    expect(snapshot.available).toBe(0); expect(snapshot.unsafeVins).toEqual([vin]);
  });
  it("excludes malformed vehicle identity and flags unrecognized location rather than fabricating it", () => {
    const malformed = parseFleetValues(values([{ year: "year" }, { vin: otherVin, location: "New branch" }]), now);
    expect(malformed.unsafeVins).toEqual([vin]); expect(malformed.vehicles[1].location).toBe("New branch");
  });
  it("rejects header changes, full-tab ranges, truncated and unexpected columns", () => {
    const changed = values(); changed.valueRanges[0].values[3][4] = "Customer";
    expect(() => parseFleetValues(changed, now)).toThrow();
    const full = values(); full.valueRanges[0].range = "FLEET!A1:X5000";
    expect(() => parseFleetValues(full, now)).toThrow();
    const wide = values(); wide.valueRanges[0].values[4].push("FORBIDDEN COLUMN");
    expect(() => parseFleetValues(wide, now)).toThrow();
    const truncated = values(); truncated.valueRanges[0].values = Array.from({ length: 5000 }, () => []);
    expect(() => parseFleetValues(truncated, now)).toThrow();
  });
  it("demo VIN has 17 allowed characters, zero serial and calculated check digit", () => {
    const letters = "ABCDEFGHJKLMNPRSTUVWXYZ", numbers = [1,2,3,4,5,6,7,8,1,2,3,4,5,7,9,2,3,4,5,6,7,8,9];
    const weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
    const sum = RENTAL_DEMO_VIN.split("").reduce((total, c, i) => total + (/[0-9]/.test(c) ? Number(c) : numbers[letters.indexOf(c)]) * weights[i], 0) % 11;
    expect(RENTAL_DEMO_VIN).toMatch(/^1DEMV[A-HJ-NPR-Z0-9]{12}$/); expect(RENTAL_DEMO_VIN.slice(-6)).toBe("000000"); expect(RENTAL_DEMO_VIN[8]).toBe(sum === 10 ? "X" : String(sum));
  });
});
class Repo implements RentalRepository {
  rows: Record<RentalTable, any[]> = { locations: [], vehicles: [], records: [], assets: [], packets: [], audit: [], emails: [], settings: [], shopUsers: [], sessions: [] };
  private tail = Promise.resolve();
  async find(table: RentalTable, q: RentalQuery = {}): Promise<any[]> { return structuredClone(this.rows[table].filter(r => Object.entries(q.eq ?? {}).every(([k,v]) => r[k] === v) && Object.entries(q.in ?? {}).every(([k,v]) => v.includes(r[k]))).slice(0, q.limit ?? 500)); }
  async insert(table: RentalTable, values: any) { const id = values.id ?? Math.max(0, ...this.rows[table].map(r => r.id)) + 1; this.rows[table].push({ activePacketId: null, returnPayload: null, source: "manual", isDemo: false, sourceAvailable: null, sourceStatus: null, sourceCheckedAt: null, sourceRow: null, sourceLocationIssue: false, ...structuredClone(values), id }); return id; }
  async update(table: RentalTable, q: RentalQuery, values: any) { const matches = await this.find(table,q); for (const r of matches) Object.assign(this.rows[table].find(row => row.id === r.id), values); return matches.length; }
  async remove(table: RentalTable, q: RentalQuery) { const matches = await this.find(table,q); this.rows[table] = this.rows[table].filter(r => !matches.some(row => row.id === r.id)); }
  async transaction<T>(work: (tx: RentalRepository) => Promise<T>): Promise<T> { const run = this.tail.then(async () => { const before = structuredClone(this.rows); try { return await work(this); } catch(error) { this.rows = before; throw error; } }); this.tail = run.then(() => undefined, () => undefined); return run; }
}
const admin: RentalActor = { key: "native:test-admin", name: "Test Admin", role: "admin", locationIds: [] }, shop: RentalActor = { key: "shop:1", name: "Test Shop", role: "shop", locationIds: [1] };
let repo: Repo, service: RentalHandoffService, deps: RentalDependencies, source: FleetSnapshot;
beforeEach(async () => {
  process.env.JWT_SECRET = "test-only-fleet-no-live-credentials";
  repo = new Repo(); source = parseFleetValues(values(), now);
  deps = { repo, now: () => now, readFleet: vi.fn(async () => source), put: vi.fn(), read: vi.fn(), buildPickup: vi.fn(), buildReturn: vi.fn(), sendEmail: vi.fn(), providerReady: () => false };
  service = new RentalHandoffService(deps);
  for (const [id,name] of [[1,"Rockville"],[2,"Laurel"]] as const) await repo.insert("locations", { id, name, address: "Test", phone: "555-0100", timezone: "America/New_York", active: true });
});
const draft = (vehicleId = 0, locationId = 1) => ({ ...emptyRentalDraft(), renterName: "Test Renter", vehicleId, locationId });
describe("rental source synchronization and safety gates", () => {
  it("syncs idempotently, leaves blank locations at zero and ensures exactly one app-only demo on explicit sync", async () => {
    await service.refreshInventory(admin); await service.refreshInventory(admin);
    expect(repo.rows.vehicles).toHaveLength(2); expect(repo.rows.records).toHaveLength(0);
    expect(repo.rows.vehicles.filter(v => v.isDemo)).toHaveLength(1);
    expect(repo.rows.vehicles[0]).toMatchObject({ vin, locationId: 0, lastOdometer: 0, source: "sheet", sourceAvailable: true });
    expect(repo.rows.vehicles[1]).toMatchObject({ vin: RENTAL_DEMO_VIN, locationId: 0, source: "demo" });
    expect(JSON.stringify(repo.rows.audit.map(a => decryptRental(a.detail)))).not.toContain(vin);
    expect((await service.session(shop)).vehicles).toHaveLength(2);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("session refresh never seeds the demo and unauthenticated session never reads source", async () => {
    await service.session(null); expect(deps.readFleet).not.toHaveBeenCalled();
    await service.session(shop); expect(repo.rows.vehicles).toHaveLength(1); expect(repo.rows.records).toHaveLength(0);
    await service.session(shop); expect(deps.readFleet).toHaveBeenCalledTimes(1);
    await expect(service.refreshInventory(shop)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("maps only active exact known locations, flags unknown names and never invents locations", async () => {
    source = parseFleetValues(values([{ location: "Laurel" }, { vin: otherVin, location: "NEW BRANCH" }]), now);
    await service.refreshInventory(admin);
    expect(repo.rows.vehicles[0].locationId).toBe(2); expect(repo.rows.vehicles[1]).toMatchObject({ locationId: 0, sourceLocationIssue: true }); expect(repo.rows.locations).toHaveLength(2);
  });
  it("preserves existing identity, ID, staff-selected location and measured odometer", async () => {
    await repo.insert("vehicles", { id: 8, locationId: 2, vin, ymm: "2020 Existing Details", plate: "MEASURED", lastOdometer: 12345, active: true });
    await repo.insert("records", { id: 7, vehicleId: 8, locationId: 2, status: "Out", payload: encryptRental(draft(8,2)) });
    await service.refreshInventory(admin);
    expect(repo.rows.vehicles[0]).toMatchObject({ id: 8, locationId: 2, ymm: "2020 Existing Details", plate: "MEASURED", lastOdometer: 12345, source: "sheet" });
  });
  it("scoped staff assigns the common pool atomically; other locations cannot move assigned vehicles", async () => {
    await service.refreshInventory(admin); const vehicleId = repo.rows.vehicles[0].id;
    const scheduled = await service.create(admin, draft());
    await expect(service.assignVehicle({ ...shop, locationIds: [2] }, { ...scheduled, vehicleId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.assignVehicle(shop, { ...scheduled, vehicleId });
    expect(repo.rows.vehicles[0].locationId).toBe(1);
    const second = await service.create(admin, draft(0,2));
    await expect(service.assignVehicle({ ...shop, locationIds: [2] }, { ...second, vehicleId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(repo.rows.audit.some(a => a.action === "vehicle.location.assign")).toBe(true);
  });
  it("rejects stale actual reservation races even when a selector showed Available", async () => {
    await service.refreshInventory(admin); const vehicleId = repo.rows.vehicles[0].id;
    const a = await service.create(admin,draft()), b = await service.create(admin,draft());
    const results = await Promise.allSettled([service.assignVehicle(shop,{...a,vehicleId}),service.assignVehicle(shop,{...b,vehicleId})]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it.each(["Occupied", "Maintenance", "Remove", "Unknown", "Missing"])("always fresh-checks selection and blocks %s without changing rental facts", async status => {
    await service.refreshInventory(admin); const vehicleId = repo.rows.vehicles[0].id; const scheduled = await service.create(admin,draft());
    source = status === "Missing" ? parseFleetValues(values([]),now) : parseFleetValues(values([{ status }]),now);
    const before = structuredClone(repo.rows.records);
    await expect(service.assignVehicle(shop,{...scheduled,vehicleId})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    await expect(service.create(admin,draft(vehicleId))).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    expect(repo.rows.records).toEqual(before); expect(repo.rows.vehicles[0].locationId).toBe(0);
  });
  it("fresh sheet failure blocks direct save/create but manual inventory and drafts remain independent", async () => {
    await service.refreshInventory(admin); const vehicleId = repo.rows.vehicles[0].id;
    const scheduled = await service.create(admin,draft());
    vi.mocked(service.deps.readFleet!).mockRejectedValue(new Error("PRIVATE TOKEN ERROR"));
    await expect(service.save(admin,scheduled.id,1,draft(vehicleId))).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    await expect(service.save(admin,scheduled.id,1,draft(0,0))).rejects.toMatchObject({code:"BAD_REQUEST"});
    expect(repo.rows.records[0].vehicleId).toBe(0);
    const manual = await service.create(admin,draft(),{ ymm:"2026 Manual Sedan", vin:otherVin, plate:"" }); expect(manual.id).toBeGreaterThan(0);
    await service.refreshInventory(admin); expect(service.fleet.status.error).not.toContain("PRIVATE"); expect(service.fleet.status.updatedAt).toBe(now);
  });
  it("demo permits drafts but blocks final pickup and all packet sends before generation or email reservation", async () => {
    await service.refreshInventory(admin); const demo = repo.rows.vehicles.find(v => v.isDemo);
    const created = await service.create(admin,draft(demo.id));
    await expect(service.complete(shop,{...created,requestId:"demo-pickup"})).rejects.toMatchObject({code:"PRECONDITION_FAILED",message:expect.stringContaining("DEMO ONLY")});
    expect(deps.buildPickup).not.toHaveBeenCalled(); expect(repo.rows.packets).toHaveLength(0);
    const packetId = await repo.insert("packets",{rentalId:created.id,kind:"pickup",snapshot:encryptRental({vehicle:demo,draft:draft(demo.id)})});
    await expect(service.resend(admin,{packetId,requestId:"demo-email"})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    expect(repo.rows.emails).toHaveLength(0); expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("deleted/nonavailable source retains an Out vehicle and its immutable packet required for return", async () => {
    await service.refreshInventory(admin); const vehicle = repo.rows.vehicles[0]; vehicle.locationId = 1;
    const payload = encryptRental(draft(vehicle.id)); await repo.insert("records", { id: 1, vehicleId:vehicle.id,locationId:1,status:"Out",payload,activePacketId:1 });
    await repo.insert("packets", { id:1,rentalId:1,snapshot:encryptRental({ unchanged:true }) }); const packets = structuredClone(repo.rows.packets);
    source = parseFleetValues(values([]),now); await service.refreshInventory(admin);
    expect(repo.rows.vehicles[0]).toMatchObject({active:true,sourceAvailable:false,sourceStatus:"Missing"});
    expect(repo.rows.packets).toEqual(packets); expect(repo.rows.records[0].payload).toBe(payload);
    expect((await service.session(shop)).vehicles[0]).toMatchObject({status:"Out",pickupEligible:false});
  });
  it("new completion always freshly rejects an occupied vehicle before PDF work, regardless of cached Available", async () => {
    await service.refreshInventory(admin); const vehicleId = repo.rows.vehicles[0].id;
    const created = await service.create(admin,draft(vehicleId));
    source = parseFleetValues(values([{ status: "Occupied" }]),now);
    await expect(service.complete(shop,{...created,requestId:"fresh-completion"})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    expect(deps.buildPickup).not.toHaveBeenCalled(); expect(deps.sendEmail).not.toHaveBeenCalled(); expect(repo.rows.packets).toHaveLength(0);
  });
  it("immutable pickup replay succeeds first when source is down and never rechecks source", async () => {
    await service.refreshInventory(admin); const vehicle = repo.rows.vehicles[0]; vehicle.locationId = 1;
    await repo.insert("records",{id:1,vehicleId:vehicle.id,locationId:1,status:"Out",payload:encryptRental(draft(vehicle.id)),revision:2,activePacketId:1});
    await repo.insert("packets",{id:1,rentalId:1,kind:"pickup",requestId:"immutable-replay",snapshot:encryptRental({vehicle,draft:draft(vehicle.id)})});
    await repo.insert("emails",{id:1,rentalId:1,packetId:1,requestId:"pickup:immutable-replay",status:"sent",providerId:"already-accepted"});
    vi.mocked(deps.readFleet!).mockClear().mockRejectedValue(new Error("source down"));
    expect(await service.complete(shop,{id:1,revision:1,requestId:"immutable-replay"})).toMatchObject({packetId:1,status:"Out",emailStatus:"sent"});
    expect(deps.readFleet).not.toHaveBeenCalled(); expect(deps.buildPickup).not.toHaveBeenCalled(); expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});
