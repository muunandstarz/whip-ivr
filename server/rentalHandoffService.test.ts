import { beforeEach, describe, expect, it, vi } from "vitest";
import { RentalHandoffService, type RentalRepository, type RentalTable, type RentalQuery, type RentalDependencies } from "./rentalHandoffService";
import { encryptRental, decryptRental, tokenHash, resolveRentalActor, hashPassword, verifyPassword, decodeRentalImage, requireSameOrigin, RENTAL_COOKIE } from "./rentalHandoffSecurity";
import { createRentalHandoffRouter } from "./routers/rentalHandoff";
import { emptyRentalDraft, PICKUP_EVIDENCE_KINDS, RETURN_EVIDENCE_KINDS, DEFAULT_RENTAL_RATES, CONDITION_AREAS, type RentalActor, type RentalDraft, type RentalReturn, type LaunchSettings } from "../shared/rentalHandoff";

class FakeRepo implements RentalRepository {
  rows: Record<RentalTable, any[]> = { locations: [], vehicles: [], records: [], assets: [], packets: [], audit: [], emails: [], settings: [], shopUsers: [], sessions: [] };
  calls: Array<{ table: RentalTable; query: RentalQuery }> = [];
  private tail: Promise<unknown> = Promise.resolve();
  async find(table: RentalTable, query: RentalQuery = {}): Promise<any[]> {
    this.calls.push({ table, query });
    let rows = this.rows[table].filter(row => Object.entries(query.eq || {}).every(([k, v]) => row[k] === v) && Object.entries(query.in || {}).every(([k, v]) => v.includes(row[k])));
    if (query.search) rows = rows.filter(r => [r.renterNameSearch, r.rentalVinLastSix, r.renterVinLastSix, r.claimNumber, r.plateSearch].some(s => String(s).toLowerCase().includes(query.search!.toLowerCase())));
    if (query.order) rows = [...rows].sort((a, b) => b[query.order!] - a[query.order!]);
    return structuredClone(rows.slice(0, query.limit || 500));
  }
  async insert(table: RentalTable, values: any) { const id = values.id || Math.max(0, ...this.rows[table].map(r => r.id)) + 1; this.rows[table].push({ activePacketId: null, returnPayload: null, passwordHash: null, providerId: null, error: null, sentAt: null, activationHash: null, activationExpires: null, ...structuredClone(values), id }); return id; }
  async update(table: RentalTable, query: RentalQuery, values: any) { const found = await this.find(table, query); for (const item of found) Object.assign(this.rows[table].find(r => r.id === item.id), structuredClone(values)); return found.length; }
  async remove(table: RentalTable, query: RentalQuery) { const rows = await this.find(table, query); this.rows[table] = this.rows[table].filter(r => !rows.some(f => f.id === r.id)); }
  async transaction<T>(work: (tx: RentalRepository) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => { const before = structuredClone(this.rows); try { return await work(this); } catch (e) { this.rows = before; throw e; } });
    this.tail = run.catch(() => undefined); return run;
  }
}
const now = Date.parse("2026-11-10T17:00:00Z");
const admin: RentalActor = { key: "native:1", name: "Test Administrator", role: "admin", locationIds: [] };
const shop: RentalActor = { key: "shop:1", name: "Test Shop", role: "shop", locationIds: [1] };
const readySettings: LaunchSettings = { counselApproved: true, registrationConfirmed: true, financialResponsibilityReference: "owner-approved", omitFinancialReference: false, retentionYears: 7, senderEmail: "rentals@example.test", emailProviderReady: true, rates: { ...DEFAULT_RENTAL_RATES }, rateVersion: 1 };
function draftReady(): RentalDraft {
  const d = emptyRentalDraft();
  Object.assign(d, { renterName: "Test Renter", mobile: "555-0100", email: "renter@example.test", claimEmail: "claim@example.test", claimNumber: "TEST-123", locationId: 1, vehicleId: 1, renterVehicleYmm: "2020 Test Car", renterVehicleVin: "1HGCM82633A004352", scheduledPickup: "2026-11-10T15:00:00Z", expectedReturn: "2026-11-12T16:00:00Z", pickupAt: "2026-11-10T16:00:00Z", dob: "1990-02-01", license: "D123", licenseState: "MD", licenseExpiration: "2028-01-01", odometerOut: 1000, representativeName: "Test Shop" });
  d.condition = CONDITION_AREAS.map(area => ({ area, ok: true, note: "" })); d.election = "B"; d.insurance.noOtherLiability = true; d.insurance.noneProvided = true;
  d.initials = { election: "TR", "5": "TR", "6": "TR", "7": "TR", "8": "TR", "9": "TR", "10": "TR" };
  Object.assign(d.payment, { cardholderName: "Test Renter", billingAddress: "Test address", zip: "21201", phone: "555-0100", cardType: "Visa", lastFour: "1234", expiration: "12/28", holdEntered: true, witness: "Test Shop", photoIdChecked: true, authorizationAcknowledged: true }); return d;
}
function returnReady(): RentalReturn { return { returnedAt: "2026-11-11T16:00:00Z", odometer: 1100, fuel: "Full", condition: CONDITION_AREAS.map(area => ({ area, ok: true, note: "" })), noticeAt: "", tolls: 5, parking: 0, fines: 0, researchEvents: 1, cleaning: 10, roadside: 0, lossOfUseDays: 0, lossOfUseResponsible: false, damageNoticeNotes: "", notes: "", chargesSettled: true, representativeName: "Test Shop" }; }
function context(user: any = null, cookie = "", origin = "https://rentals.example.test") {
  const cookies: any[] = [], clears: any[] = [];
  return { ctx: { user, req: { protocol: "https", headers: { origin, cookie, "user-agent": "test" }, ip: "192.0.2.1", get: (name: string) => name === "host" ? "rentals.example.test" : undefined } as any, res: { cookie: (...a: any[]) => cookies.push(a), clearCookie: (...a: any[]) => clears.push(a) } as any }, cookies, clears };
}
let repo: FakeRepo, service: RentalHandoffService, deps: RentalDependencies;
beforeEach(async () => {
  process.env.JWT_SECRET = "test-only-secret-long-enough-no-live-use";
  repo = new FakeRepo();
  await repo.insert("locations", { id: 1, name: "Test Location", address: "Test address", phone: "555-0123", timezone: "America/New_York", active: true });
  await repo.insert("locations", { id: 2, name: "Other Test Location", address: "Test address", phone: "555-0123", timezone: "America/New_York", active: true });
  await repo.insert("vehicles", { id: 1, locationId: 1, ymm: "2020 Fleet Car", vin: "1HGCM82633A004355", plate: "FLEET01", lastOdometer: 1000, active: true });
  await repo.insert("settings", { id: 1, payload: encryptRental(readySettings), version: 1, updatedAt: now });
  deps = { repo, now: () => now, put: vi.fn(async key => ({ key, url: "SHOULD_NEVER_LEAK" })), read: vi.fn(async () => Buffer.from("%PDF-test")), buildPickup: vi.fn(async () => Buffer.from("%PDF-test")), buildReturn: vi.fn(async () => Buffer.from("%PDF-return")), sendEmail: vi.fn(async () => ({ providerId: "test-provider" })), providerReady: () => true };
  service = new RentalHandoffService(deps);
});
async function createReady(d = draftReady()) {
  const created = await service.create(admin, d);
  for (const kind of [...PICKUP_EVIDENCE_KINDS, "licenseFront", "licenseBack", "signedPayment", "renterSignature", "representativeSignature"]) await repo.insert("assets", { rentalId: created.id, kind, storageKey: `private/${kind}`, mime: "image/png", signerName: kind === "representativeSignature" ? "Test Shop" : "Test Renter", uploadedBy: shop.key, createdAt: now, device: "hashed", ipHash: "hashed" });
  return created;
}

describe("rental service security and lifecycle", () => {
  it.each(["cornerFrontDriver", "cornerFrontPassenger", "cornerRearDriver", "cornerRearPassenger", "windshield", "vinPlate"] as const)("blocks missing pickup %s before PDF work despite extras and all opposite-phase views", async kind => {
    const created = await createReady();repo.rows.assets = repo.rows.assets.filter(a => a.kind !== kind);
    for (const substitute of ["extra", "returnExtra", ...RETURN_EVIDENCE_KINDS]) await repo.insert("assets", { rentalId: created.id, kind: substitute, storageKey: "private/substitute", createdAt: now });
    const before = structuredClone(repo.rows);
    await expect(service.complete(shop, { ...created, requestId: `missing-${kind}` })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Step 2:") });
    expect(repo.rows).toEqual(before);expect(deps.buildPickup).not.toHaveBeenCalled();expect(deps.put).not.toHaveBeenCalled();expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("persists pickup manual warning-light notes and invalidates signatures without altering photos", async () => {
    const created = await createReady();const images = structuredClone(repo.rows.assets);
    await service.save(shop, created.id, 1, { ...draftReady(), dashboardAlertsOut: "ABS lamp observed while parked" });
    expect((await service.get(shop, created.id)).draft.dashboardAlertsOut).toBe("ABS lamp observed while parked");
    expect(repo.rows.assets).toEqual(images);expect((await service.versionAssets(repo, created.id)).some(a => a.kind.endsWith("Signature"))).toBe(false);
  });
  it("retires phone reminder consent on each A→B→A change in the same save transaction", async () => {
    const a = "+13015550100", b = "+13015550101";
    const created = await service.create(admin, { ...draftReady(), mobile: a });
    const retire = vi.fn();const originalTransaction = repo.transaction.bind(repo);
    const rootRetire = vi.fn(() => { throw new Error("Retirement must use the save transaction"); });
    repo.retireReminderConsent = rootRetire;
    repo.transaction = work => originalTransaction(tx => work(new Proxy(tx, { get(target, key) { if(key === "retireReminderConsent")return retire;const value=Reflect.get(target,key);return typeof value === "function" ? value.bind(target) : value; } })));
    const second = await service.save(admin, created.id, 1, { ...draftReady(), mobile: b });
    expect(retire).toHaveBeenNthCalledWith(1, created.id, now);
    await service.save(admin, created.id, second.revision, { ...draftReady(), mobile: a });
    expect(retire).toHaveBeenNthCalledWith(2, created.id, now);expect(rootRetire).not.toHaveBeenCalled();
    expect((await service.get(admin, created.id)).draft.mobile).toBe(a);
  });
  it("does not retire consent for a normalized-equivalent phone edit", async () => {
    const created = await service.create(admin, { ...draftReady(), mobile: "+13015550100" });
    const retire = vi.fn();repo.retireReminderConsent = retire;
    await service.save(admin, created.id, 1, { ...draftReady(), mobile: "(301) 555-0100" });
    expect(retire).not.toHaveBeenCalled();
  });
  it("normalizes an absent legacy dashboard note to blank without invalidating existing signatures",async()=>{
    const created=await createReady();const legacy=draftReady();delete legacy.dashboardAlertsOut;
    repo.rows.records[0].payload=encryptRental(legacy);
    await service.save(shop,created.id,1,legacy);
    expect((await service.get(shop,created.id)).draft.dashboardAlertsOut).toBe("");
    expect((await service.versionAssets(repo,created.id)).filter(a=>a.kind.endsWith("Signature"))).toHaveLength(2);
    expect(repo.rows.audit.some(a=>a.action==="signature.invalidate")).toBe(false);
  });
  it("replays an immutable pickup before the unassigned-vehicle guard and without vehicle lookup",async()=>{
    const created=await createReady();const request={...created,requestId:"unassigned-legacy-replay"};
    const issued=await service.complete(shop,request);
    repo.rows.records[0].vehicleId=0;repo.calls=[];
    expect(await service.complete(shop,request)).toEqual(issued);
    expect(repo.calls.some(call=>call.table==="vehicles")).toBe(false);expect(deps.buildPickup).toHaveBeenCalledTimes(1);
  });
  it("encrypts payloads with randomized authenticated encryption and rejects tampering", () => {
    const a = encryptRental({ name: "private" }), b = encryptRental({ name: "private" }); expect(a).not.toBe(b); expect(a).not.toContain("private"); expect(decryptRental(a)).toEqual({ name: "private" });
    const pieces = a.split("."); const corrupted = Buffer.from(pieces[3], "base64url"); corrupted[0] ^= 1; pieces[3] = corrupted.toString("base64url"); expect(() => decryptRental(pieces.join("."))).toThrow();
  });
  it("enforces SQL location filtering and defensive access for both records and files", async () => {
    const created = await createReady(); const outsider = { ...shop, locationIds: [2] };
    expect(await service.list(outsider)).toEqual([]); expect(repo.calls.some(c => c.table === "records" && c.query.in?.locationId?.[0] === 2)).toBe(true);
    await expect(service.get(outsider, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(service.authorizeFile(outsider, "asset", 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("does not misidentify full Snapsheet claim identifiers as card numbers at setup", async () => {
    const d = { ...draftReady(), claimNumber: "MDW-1234-123456-123456" };
    const created = await service.create(admin, d);
    expect((await service.get(admin, created.id)).draft.claimNumber).toBe(d.claimNumber);
    await expect(service.create(admin, { ...d, claimNumber: "4111 1111 1111 1111" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.create(admin, { ...d, claimNumber: d.claimNumber + " 4111111111111111" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each(["", "1", "12", "123", "1234"])("allows last-four draft typing %s without permitting a full PAN", async lastFour => {
    const d = draftReady(); d.payment.lastFour = lastFour;
    const created = await service.create(admin, d);
    expect((await service.get(admin, created.id)).draft.payment.lastFour).toBe(lastFour);
  });
  it("rejects full card fields and PANs hidden in free text", async () => {
    const draft = draftReady(); (draft.payment as any).cvv = "123"; await expect(service.create(admin, draft)).rejects.toThrow();
    delete (draft.payment as any).cvv; draft.staffNote = "4111 1111 1111 1111"; await expect(service.create(admin, draft)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    draft.staffNote = ""; draft.payment.lastFour = "12345"; await expect(service.create(admin, draft)).rejects.toThrow();
  });
  it("blocks missing ink authorization when configured for everyone and missing launch readiness", async () => {
    const created = await createReady(); repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "signedPayment"); repo.rows.settings[0].payload = encryptRental({ ...readySettings, forceInkForRenter: true });
    await expect(service.complete(shop, { ...created, requestId: "handoff-test-1" })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(repo.rows.packets).toHaveLength(0);
    repo.rows.settings[0].payload = encryptRental({ ...readySettings, counselApproved: false });
    await expect(service.complete(shop, { ...created, requestId: "handoff-test-1" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it.each(["extra", "returnExtra", "returnDashboard", "claimPhoto"])("blocks direct pickup completion when %s replaces the dedicated dashboard", async kind => {
    const created = await createReady();
    repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "dashboard");
    await repo.insert("assets", { rentalId: created.id, kind, storageKey: `private/${kind}`, mime: "image/png", uploadedBy: shop.key, createdAt: now });
    const before = structuredClone(repo.rows);
    await expect(service.complete(shop, { ...created, requestId: `missing-dashboard-${kind}` })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Step 2: Add the pickup dashboard / instrument-cluster photo showing alerts, fuel level, and odometer (mileage)." });
    expect(repo.rows).toEqual(before);
    expect(deps.buildPickup).not.toHaveBeenCalled(); expect(deps.put).not.toHaveBeenCalled(); expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("requires pickup mileage independently of the dashboard photo and permits a genuine zero reading", async () => {
    const created = await createReady({ ...draftReady(), odometerOut: null });
    await expect(service.complete(shop, { ...created, requestId: "missing-pickup-mileage" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Record pickup odometer (mileage)") });
    expect(decryptRental<RentalDraft>(repo.rows.records[0].payload).odometerOut).toBeNull();
    expect(deps.buildPickup).not.toHaveBeenCalled();
    repo.rows.vehicles[0].lastOdometer = 0;
    const saved = await service.save(shop, created.id, 1, { ...draftReady(), odometerOut: 0 });
    for (const kind of ["renterSignature", "representativeSignature"]) await repo.insert("assets", { rentalId: created.id, kind, storageKey: "private/fresh", mime: "image/png", signerName: kind === "representativeSignature" ? "Test Shop" : "Test Renter", uploadedBy: shop.key, createdAt: now });
    expect((await service.complete(shop, { id: created.id, revision: saved.revision, requestId: "zero-pickup-mileage" })).status).toBe("Out");
    expect(decryptRental<any>(repo.rows.packets[0].snapshot).draft.odometerOut).toBe(0);
  });
  it("retains dashboard originals but uses only the newest dedicated image in a new packet", async () => {
    const created = await createReady(); const old = structuredClone(repo.rows.assets.find(a => a.kind === "dashboard"));
    const id = await repo.insert("assets", { rentalId: created.id, kind: "dashboard", storageKey: "private/dashboard-new", mime: "image/jpeg", uploadedBy: shop.key, createdAt: now + 1 });
    await service.complete(shop, { ...created, requestId: "new-dashboard-snapshot" });
    expect(repo.rows.assets.find(a => a.id === old.id)).toEqual(old);
    expect(decryptRental<any>(repo.rows.packets[0].snapshot).assets.filter((a: any) => a.kind === "dashboard")).toEqual([expect.objectContaining({ id, kind: "dashboard" })]);
    expect(deps.read).not.toHaveBeenCalledWith(old.storageKey, 5 * 1024 * 1024);
  });
  it("replays and resends legacy issued pickup packets without retroactive dashboard or mileage gates", async () => {
    const created = await createReady(); const request = { ...created, requestId: "legacy-pickup-replay" };
    const issued = await service.complete(shop, request);
    // Model a packet issued before dedicated dashboard evidence was required.
    const snapshot = decryptRental<any>(repo.rows.packets[0].snapshot);
    snapshot.assets = snapshot.assets.filter((a: any) => a.kind !== "dashboard"); snapshot.draft.odometerOut = null;
    repo.rows.packets[0].snapshot = encryptRental(snapshot);
    repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "dashboard");
    repo.rows.records[0].payload = encryptRental({ ...draftReady(), odometerOut: null });
    const immutable = structuredClone({ records: repo.rows.records, packets: repo.rows.packets, assets: repo.rows.assets });
    expect(await service.complete(shop, request)).toEqual(issued);
    expect(await service.resend(admin, { packetId: issued.packetId, requestId: "legacy-pickup-resend" })).toMatchObject({ status: "sent" });
    expect({ records: repo.rows.records, packets: repo.rows.packets, assets: repo.rows.assets }).toEqual(immutable);
    expect(deps.buildPickup).toHaveBeenCalledTimes(1);
  });
  it("allows owner-approved electronic renter signatures but not a different cardholder without ink", async () => {
    const d = draftReady(); d.payment.witness = ""; const created = await createReady(d); repo.rows.assets = repo.rows.assets.filter(a => a.kind !== "signedPayment");
    expect((await service.complete(shop, { ...created, requestId: "e-sign-test-1" })).status).toBe("Out");
    repo.rows.records[0].status = "Returned";
    const other = draftReady(); other.payment.isRenter = false; other.payment.cardholderName = "Different Person"; const second = await createReady(other); repo.rows.assets = repo.rows.assets.filter(a => !(a.rentalId === second.id && a.kind === "signedPayment"));
    await expect(service.complete(shop, { ...second, requestId: "e-sign-test-2" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("checks optimistic revision and Claims-owned fields before saving", async () => {
    const created = await createReady(); await expect(service.save(shop, created.id, 2, draftReady())).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.save(shop, created.id, 1, { ...draftReady(), renterName: "Replacement" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await service.save(shop, created.id, 1, { ...draftReady(), keysOut: 2 })).toEqual({ revision: 2 });
  });
  it("invalidates prior signatures after changed facts without deleting historical objects", async () => {
    const created = await createReady(); await service.save(shop, created.id, 1, { ...draftReady(), keysOut: 2 });
    expect(repo.rows.assets).toHaveLength(PICKUP_EVIDENCE_KINDS.length + 5); expect((await service.get(shop, created.id)).assets.some(a => a.kind.endsWith("Signature"))).toBe(false);
    await expect(service.complete(shop, { id: created.id, revision: 2, requestId: "invalidate-test-1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const kind of ["renterSignature", "representativeSignature", "signedPayment"]) await repo.insert("assets", { rentalId: created.id, kind, storageKey: "private/new", mime: "image/png", signerName: kind === "representativeSignature" ? "Test Shop" : "Test Renter", uploadedBy: shop.key, createdAt: now });
    expect((await service.complete(shop, { id: created.id, revision: 2, requestId: "invalidate-test-1" })).status).toBe("Out"); expect(repo.rows.assets).toHaveLength(PICKUP_EVIDENCE_KINDS.length + 8);
  });
  it("issues one immutable packet with replay, locks edits, and never returns storage keys", async () => {
    const created = await createReady(); const request = { ...created, requestId: "handoff-test-2" };
    const issued = await service.complete(shop, request); expect(issued).toMatchObject({ status: "Out", emailStatus: "sent", url: "/api/rental-handoff/files/packet/1" });
    expect(await service.complete(shop, request)).toEqual(issued); expect(repo.rows.packets).toHaveLength(1); expect(deps.buildPickup).toHaveBeenCalledTimes(1); expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    await expect(service.save(shop, created.id, 2, draftReady())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(JSON.stringify(await service.get(shop, created.id))).not.toContain("private/"); expect(JSON.stringify(decryptRental(repo.rows.packets[0].snapshot))).not.toContain("bytes");
    expect(repo.calls.some(c => c.table === "vehicles" && c.query.lock)).toBe(true);
  });
  it("serializes competing handoffs and rejects double-booking", async () => {
    const a = await createReady(), b = await createReady();
    const results = await Promise.allSettled([service.complete(shop, { ...a, requestId: "booking-test-A" }), service.complete(shop, { ...b, requestId: "booking-test-B" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(repo.rows.packets).toHaveLength(1); expect(repo.rows.records.filter(r => r.status === "Out")).toHaveLength(1);
  });
  it("records email failures accurately while preserving the signed locked packet", async () => {
    deps.sendEmail = vi.fn(async () => { throw new Error("network failure"); }); const created = await createReady();
    const result = await service.complete(shop, { ...created, requestId: "failure-test-1" }); expect(result.emailStatus).toBe("failed"); expect(repo.rows.records[0]).toMatchObject({ status: "Out", activePacketId: result.packetId }); expect(repo.rows.emails[0].status).toBe("failed");
    deps.sendEmail = vi.fn(async () => ({ providerId: "retry-confirmed" })); expect(await service.resend(shop, { packetId: result.packetId, requestId: "failure-retry-1" })).toMatchObject({ status: "sent" });
  });
  it("uses the shared sender for every actor and only the signed renter plus claim-specific recipient", async () => {
    deps.senderStatus = vi.fn(async () => ({ connected: true, configured: true, email: "shared@example.test", provider: "gmail" as const, shared: true as const }));
    expect((await service.session(shop)).settings?.senderEmail).toBe("shared@example.test"); expect((await service.session(admin)).sender).toEqual((await service.session(shop)).sender);
    const created = await createReady(); const result = await service.complete(shop, { ...created, requestId: "mailgun-recipients-1" }); expect(result.emailStatus).toBe("sent");
    expect(deps.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ actorKey: shop.key, sender: "shared@example.test", recipient: "renter@example.test", claimEmail: "claim@example.test" }));
    expect(decryptRental(repo.rows.emails[0].recipient)).toEqual({ renterEmail: "renter@example.test", claimEmail: "claim@example.test" });
  });
  it("blocks blind resend after Mailgun delivery is uncertain even with a new request key", async () => {
    deps.sendEmail = vi.fn(async () => { throw Object.assign(new Error("uncertain"), { deliveryUncertain: true }); });
    const created = await createReady(); const result = await service.complete(shop, { ...created, requestId: "mailgun-uncertain-1" }); expect(result.emailStatus).toBe("uncertain");
    expect(await service.resend(shop, { packetId: result.packetId, requestId: "mailgun-uncertain-2" })).toEqual({ status: "uncertain" }); expect(deps.sendEmail).toHaveBeenCalledTimes(1); expect(repo.rows.emails).toHaveLength(1);
  });
  it("retains immutable recipient selection even if the editable record changes", async () => {
    const created = await createReady(); const result = await service.complete(shop, { ...created, requestId: "immutable-email-1" });
    repo.rows.records[0].payload = encryptRental({ ...draftReady(), email: "replacement@example.test", claimEmail: "other-claim@example.test" });
    await service.resend(admin, { packetId: result.packetId, requestId: "immutable-email-2" });
    expect(deps.sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ recipient: "renter@example.test", claimEmail: "claim@example.test" }));
  });
  it("reserves one pending POST despite concurrent actors and different request IDs", async () => {
    const created = await createReady(); const issued = await service.complete(shop, { ...created, requestId: "concurrent-email-initial" });
    let release!: (value: { providerId: string }) => void;
    deps.sendEmail = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const first = service.resend(shop, { packetId: issued.packetId, requestId: "concurrent-email-A" });
    await vi.waitFor(() => expect(deps.sendEmail).toHaveBeenCalledTimes(1));
    expect(await service.resend(admin, { packetId: issued.packetId, requestId: "concurrent-email-B" })).toEqual({ status: "pending" });
    release({ providerId: "single-confirmed" }); expect(await first).toEqual({ status: "sent", providerId: "single-confirmed" });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1); expect(repo.rows.emails).toHaveLength(2);
  });
  it("marks a missing acceptance ID uncertain and blocks the next request", async () => {
    deps.sendEmail = vi.fn(async () => ({ providerId: "" }));
    const created = await createReady(); const result = await service.complete(shop, { ...created, requestId: "missing-confirmation-1" });
    expect(result.emailStatus).toBe("uncertain");
    expect(await service.resend(admin, { packetId: result.packetId, requestId: "missing-confirmation-2" })).toEqual({ status: "uncertain" });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });
  it("keeps provider acceptance uncertain when post-send DB persistence fails and wipes PDF bytes", async () => {
    const update = repo.update.bind(repo);
    repo.update = async (table, query, values) => { if (table === "emails" && values.status === "sent") throw new Error("DB write failed"); return update(table, query, values); };
    const bytes = Buffer.from("%PDF-private-test"); deps.read = vi.fn(async () => bytes);
    const created = await createReady(); const result = await service.complete(shop, { ...created, requestId: "persist-failure-1" });
    expect(result.emailStatus).toBe("uncertain"); expect(bytes.every(b => b === 0)).toBe(true);
    expect(await service.resend(admin, { packetId: result.packetId, requestId: "persist-failure-2" })).toEqual({ status: "uncertain" });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid immutable recipients and cross-location resend before transport", async () => {
    const created = await createReady(); const issued = await service.complete(shop, { ...created, requestId: "address-test-initial" });
    vi.mocked(deps.sendEmail).mockClear();
    await expect(service.resend({ ...shop, locationIds: [2] }, { packetId: issued.packetId, requestId: "outsider-email" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const snapshot = decryptRental<any>(repo.rows.packets[0].snapshot); snapshot.draft.email = "renter@example.test\r\nBcc:evil@example.test"; repo.rows.packets[0].snapshot = encryptRental(snapshot);
    await expect(service.resend(admin, { packetId: issued.packetId, requestId: "invalid-snapshot-email" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("preserves original assets and requires new signatures for a replacement version", async () => {
    const created = await createReady(); await service.complete(shop, { ...created, requestId: "version-test-1" }); const original = structuredClone(repo.rows.packets[0]);
    await expect(service.newVersion(shop, created.id, 2, "Correction")).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(await service.newVersion(admin, created.id, 2, "Correction")).toEqual({ revision: 3 });
    expect(repo.rows.records[0]).toMatchObject({ status: "Out", activePacketId: null }); expect(repo.rows.assets).toHaveLength(PICKUP_EVIDENCE_KINDS.length + 5);
    expect((await service.get(shop, created.id)).assets.some(a => a.kind.endsWith("Signature"))).toBe(false);
    await expect(service.complete(shop, { id: created.id, revision: 3, requestId: "version-test-2" })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(repo.rows.packets[0]).toEqual(original);
  });
  it("makes a separate return packet, releases fleet availability, restricts closed licenses", async () => {
    const created = await createReady(); await service.complete(shop, { ...created, requestId: "return-test-1" });
    for (const kind of [...RETURN_EVIDENCE_KINDS, "returnRenterSignature", "returnRepresentativeSignature"]) await repo.insert("assets", { rentalId: created.id, kind, storageKey: `private/${kind}`, mime: "image/png", signerName: "Test", uploadedBy: shop.key, createdAt: now + 1 });
    deps.now = () => now + 86400000;
    await expect(service.returnComplete(shop, { id: created.id, revision: 2, requestId: "return-test-2", data: { ...returnReady(), odometer: 999 } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const returned = await service.returnComplete(shop, { id: created.id, revision: 2, requestId: "return-test-2", data: returnReady() }); expect(returned.status).toBe("Returned"); expect(repo.rows.packets).toHaveLength(2); expect(repo.rows.vehicles[0].lastOdometer).toBe(1100);
    await service.close(admin, created.id, 3); const record = await service.get(shop, created.id); expect(record.assets.some(a => a.kind === "licenseFront")).toBe(false); expect(record.draft.license).toBe("");
    const license = repo.rows.assets.find(a => a.kind === "licenseFront"); await expect(service.authorizeFile(shop, "asset", license.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect((await service.session(shop)).vehicles[0].status).toBe("Available");
    expect(record.packets).toEqual([]);
    const originalPacket = repo.rows.packets[0];
    await expect(service.authorizeFile(shop, "packet", originalPacket.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.resend(shop, { packetId: originalPacket.id, requestId: "closed-shop-cannot-email" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await service.get(admin, created.id)).packets).toHaveLength(2);
    expect((await service.authorizeFile(admin, "packet", originalPacket.id)).storageKey).toBe(originalPacket.storageKey);
  });
  it("rejects unapproved background PDF prices and client-forged provider readiness", async () => {
    await expect(service.saveSettings(admin, { ...readySettings, rates: { ...DEFAULT_RENTAL_RATES, optionA: 99 } })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); deps.providerReady = () => false;
    const settings = await service.saveSettings(admin, { ...readySettings, emailProviderReady: true }); expect(settings.emailProviderReady).toBe(false); expect((await service.session(shop)).launchGaps).not.toEqual([]);
  });
});

describe("shared Gmail sender authorization API", () => {
  const config = { domain: "mg.example.test", fromEmail: "shared@example.test", apiKey: "mock-secret-never-live", region: "US" as const };
  function oauth() {
    deps.connectSharedGmail = vi.fn(async () => ({ url: "https://accounts.google.com/o/oauth2/v2/auth?mock" }));
    deps.disconnectSharedGmail = vi.fn(async () => ({ success: true as const }));
    deps.finishSharedGmail = vi.fn(async () => ({ email: "shared@example.test" }));
  }
  it("admin authorizes once through dedicated shared mutation, without changing launch settings or sending mail", async () => {
    oauth(); const launchRow = structuredClone(repo.rows.settings[0]);
    const caller = createRentalHandoffRouter(service).createCaller(context({ id: 1, name: admin.name, role: "admin" }).ctx);
    expect(await caller.connectSharedGmail()).toEqual({ url: "https://accounts.google.com/o/oauth2/v2/auth?mock" });
    expect(deps.connectSharedGmail).toHaveBeenCalledWith(admin);
    expect(await caller.disconnectSharedGmail()).toEqual({ success: true });
    expect(deps.disconnectSharedGmail).toHaveBeenCalledWith(admin);
    expect(repo.rows.settings).toEqual([launchRow]);
    expect(repo.rows.audit).toHaveLength(0);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated, Claims and cross-origin requests before OAuth operations", async () => {
    oauth(); const router = createRentalHandoffRouter(service);
    for (const method of ["connectSharedGmail", "disconnectSharedGmail"] as const) {
      await expect(router.createCaller(context().ctx)[method]()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(router.createCaller(context({ id: 2, role: "user" }).ctx)[method]()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(router.createCaller(context({ id: 1, role: "admin" }, "", "https://evil.test").ctx)[method]()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service[method](shop)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(service.finishSharedGmail(shop, "code", "state")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.connectSharedGmail).not.toHaveBeenCalled();
    expect(deps.disconnectSharedGmail).not.toHaveBeenCalled();
    expect(deps.finishSharedGmail).not.toHaveBeenCalled();
  });
  it("rejects supplied shared owner and sender override inputs instead of accepting a rebind", async () => {
    oauth(); const caller = createRentalHandoffRouter(service).createCaller(context({ id: 1, role: "admin" }).ctx);
    await expect((caller.connectSharedGmail as any)({ actorKey: "shared:rental-gmail", senderEmail: "spoof@example.test" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect((caller.disconnectSharedGmail as any)({ actorKey: "native:2" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(deps.connectSharedGmail).not.toHaveBeenCalled();
    expect(deps.disconnectSharedGmail).not.toHaveBeenCalled();
  });
  it("returns shared-only status and ignores launch sender override and forged readiness", async () => {
    deps.senderStatus = vi.fn(async () => ({ connected: true, configured: true, email: "shared@example.test", provider: "gmail" as const, shared: true as const }));
    await service.saveSettings(admin, { ...readySettings, senderEmail: "spoof@example.test", emailProviderReady: true });
    for (const actor of [admin, shop, { ...admin, role: "claims" as const }, { ...shop, key: "shop:2", locationIds: [2] }]) {
      const result = await service.session(actor);
      expect(result.settings?.senderEmail).toBe("shared@example.test");
      expect(result.sender).toEqual({ connected: true, configured: true, email: "shared@example.test", provider: "gmail", shared: true });
    }
  });
  it("preserves safe canonical setup guidance without leaking OAuth errors", async () => {
    oauth(); deps.connectSharedGmail = vi.fn(async () => { throw new Error("private-client-secret"); });
    await expect(service.connectSharedGmail(admin)).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("https://whipclaimsivr.com/api/rental-handoff/gmail/callback") });
  });
  it("disables old Mailgun saving and personal Gmail mutations without DB writes", async () => {
    const router = createRentalHandoffRouter(service), caller = router.createCaller(context({ id: 1, role: "admin" }).ctx);
    await expect(caller.connectSender()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(caller.disconnectSender()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(caller.saveSharedSender(config)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(service.saveSharedSender(shop, config)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context().ctx).connectSender()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(repo.rows.settings).toHaveLength(1); expect(repo.rows.audit).toHaveLength(0);
  });
});

describe("rental-only shop identity", () => {
  it("invites once, stores only hashes, activates without Manus and revokes on signOut", async () => {
    const invite = await service.inviteShop(admin, { name: "Invited Staff", email: "staff@example.test", locationIds: [1] }); expect(repo.rows.shopUsers[0].activationHash).toBe(tokenHash(invite.activationToken)); expect(JSON.stringify(repo.rows.shopUsers)).not.toContain(invite.activationToken);
    const r = createRentalHandoffRouter(service), auth = context(); await r.createCaller(auth.ctx).activate({ token: invite.activationToken, password: "very-secure-test-password" });
    expect(auth.cookies[0][0]).toBe(RENTAL_COOKIE); expect(auth.cookies[0][2]).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/api", maxAge: 8 * 3600000 }); const token = auth.cookies[0][1]; expect(repo.rows.sessions[0].tokenHash).toBe(tokenHash(token)); expect(JSON.stringify(repo.rows.sessions)).not.toContain(token);
    expect(repo.rows.shopUsers[0].activationHash).toBe(null); expect(repo.rows.shopUsers[0].passwordHash).not.toContain("very-secure-test-password");
    const loggedIn = context(null, `${RENTAL_COOKIE}=${token}`); const session = await r.createCaller(loggedIn.ctx).session(); expect(session.actor).toEqual({ key: "shop:1", name: "Invited Staff", role: "shop", locationIds: [1] }); expect(loggedIn.ctx.user).toBe(null);
    await r.createCaller(loggedIn.ctx).signOut(); expect(repo.rows.sessions).toHaveLength(0); expect(loggedIn.clears[0][0]).toBe(RENTAL_COOKIE);
  });
  it("rechecks active location membership every request and rejects expired sessions", async () => {
    const passwordHash = await hashPassword("membership-test-password"); await repo.insert("shopUsers", { id: 1, email: "staff@example.test", name: "Staff", passwordHash, active: true, locationIds: "[1]", createdAt: now });
    const token = "a".repeat(43); await repo.insert("sessions", { tokenHash: tokenHash(token), shopUserId: 1, expiresAt: now + 1000, createdAt: now }); const { ctx } = context(null, `${RENTAL_COOKIE}=${token}`);
    expect((await resolveRentalActor(ctx, repo, now))?.locationIds).toEqual([1]); repo.rows.locations[0].active = false; expect((await resolveRentalActor(ctx, repo, now))?.locationIds).toEqual([]);
    expect(await resolveRentalActor(ctx, repo, now + 1001)).toBe(null); repo.rows.shopUsers[0].active = false; expect(await resolveRentalActor(ctx, repo, now)).toBe(null);
  });
  it("native dashboard users need no new auth and anonymous session reveals no settings", async () => {
    const r = createRentalHandoffRouter(service); expect(await r.createCaller(context().ctx).session()).toEqual({ actor: null, settings: null, locations: [], vehicles: [], launchGaps: [] });
    const ctx = context({ id: 9, name: "Claims Test", role: "user" }).ctx; expect((await r.createCaller(ctx).session()).actor?.role).toBe("claims");
    await expect(r.createCaller(context().ctx).list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("requires same-origin mutations and uses constant-time scrypt verification", async () => {
    const hash = await hashPassword("test-password-long"); expect(await verifyPassword("test-password-long", hash)).toBe(true); expect(await verifyPassword("wrong", hash)).toBe(false); expect(await verifyPassword("wrong", null)).toBe(false);
    expect(() => requireSameOrigin(context(null, "", "https://evil.test").ctx.req)).toThrow(); expect(() => requireSameOrigin(context().ctx.req)).not.toThrow();
  });
  it("rejects non-images, MIME spoofing and oversize image input", () => {
    expect(() => decodeRentalImage(Buffer.from("not a png").toString("base64"))).toThrow(); expect(() => decodeRentalImage("A".repeat(7000000))).toThrow();
    const jpeg = Buffer.from([255,216,255,0,255,217]); expect(decodeRentalImage(jpeg.toString("base64")).mime).toBe("image/jpeg"); expect(() => decodeRentalImage(`data:image/png;base64,${jpeg.toString("base64")}`)).toThrow();
  });
});
