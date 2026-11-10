import { TRPCError } from "@trpc/server";
import { and, eq, inArray, like, or, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import * as tables from "../drizzle/rentalSchema";
import { getDb } from "./db";
import { storagePut, storageGetSignedUrl } from "./storage";
import { sharedGmailStatus, connectSharedGmail, finishSharedGmail, disconnectSharedGmail, sendRentalPacketSharedGmail, RentalGmailDeliveryUncertainError, RENTAL_GMAIL_MAX_PDF_BYTES, type RentalSharedGmailStatus } from "./rentalHandoffGmail";
import { ASSET_KINDS, DEFAULT_RENTAL_RATES, RENTAL_FORM_VERSION, CONDITION_AREAS, rentalDraftSchema, rentalReturnSchema, handoffMissing, launchMissing, calculateRentalCharges, type RentalActor, type RentalDraft, type RentalReturn, type LaunchSettings, type RentalRates, type RentalVehicle, type RentalLocation } from "../shared/rentalHandoff";
import { encryptRental, decryptRental, enforceDraftCardSafety, decodeRentalImage, hashPassword, verifyPassword, randomToken, tokenHash } from "./rentalHandoffSecurity";

const tableMap = { locations: tables.rentalLocations, vehicles: tables.rentalVehicles, records: tables.rentalRecords, assets: tables.rentalAssets, packets: tables.rentalPackets, audit: tables.rentalAudit, emails: tables.rentalEmailLog, settings: tables.rentalSettings, shopUsers: tables.rentalShopUsers, sessions: tables.rentalSessions };
export type RentalTable = keyof typeof tableMap;
export type RentalRows = { [K in RentalTable]: (typeof tableMap)[K]["$inferSelect"] };
export type RentalInserts = { [K in RentalTable]: (typeof tableMap)[K]["$inferInsert"] };
export type RentalQuery = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; search?: string; order?: string; limit?: number; lock?: boolean };
export interface RentalRepository {
  find<K extends RentalTable>(table: K, query?: RentalQuery): Promise<RentalRows[K][]>;
  insert<K extends RentalTable>(table: K, values: RentalInserts[K]): Promise<number>;
  update<K extends RentalTable>(table: K, query: RentalQuery, values: Partial<RentalInserts[K]>): Promise<number>;
  remove(table: RentalTable, query: RentalQuery): Promise<void>;
  transaction<T>(work: (tx: RentalRepository) => Promise<T>): Promise<T>;
}
// Generic operations remain private to the repository; every query value is parameterized.
function whereFor(table: any, query: RentalQuery) {
  const parts = Object.entries(query.eq || {}).map(([k, v]) => v === null ? sql`${table[k]} is null` : eq(table[k], v));
  for (const [k, values] of Object.entries(query.in || {})) parts.push(values.length ? inArray(table[k], values) : sql`false`);
  if (query.search) {
    const pattern = `%${query.search.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    parts.push(or(...["renterNameSearch", "rentalVinLastSix", "renterVinLastSix", "claimNumber", "plateSearch"].map(k => like(table[k], pattern)))!);
  }
  return parts.length ? and(...parts) : undefined;
}
export function createDrizzleRentalRepository(connection?: any): RentalRepository {
  const db = async () => { const result = connection || await getDb(); if (!result) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Rental database is unavailable." }); return result; };
  return {
    async find(name, query = {}) {
      const table = tableMap[name];
      let request = (await db()).select().from(table).where(whereFor(table, query));
      if (query.order) request = request.orderBy(desc((table as any)[query.order]));
      request = request.limit(query.limit || 500);
      if (query.lock) request = request.for("update");
      return await request;
    },
    async insert(name, values) { const ids = await (await db()).insert(tableMap[name]).values(values).$returningId(); return ids[0]?.id || (values as any).id; },
    async update(name, query, values) { const [result] = await (await db()).update(tableMap[name]).set(values).where(whereFor(tableMap[name], query)); return Number(result.affectedRows); },
    async remove(name, query) { await (await db()).delete(tableMap[name]).where(whereFor(tableMap[name], query)); },
    async transaction(work) { return (await db()).transaction((tx: any) => work(createDrizzleRentalRepository(tx))); },
  };
}
export type RentalPdfInput = { rentalId: number; version: number; draft: RentalDraft; vehicle: RentalVehicle; location: RentalLocation; rates: RentalRates; assets: Array<{ id: number; kind: string; signerName: string | null; createdAt: number; bytes?: Buffer }>; settings: LaunchSettings; returnData?: RentalReturn; charges?: ReturnType<typeof calculateRentalCharges> };
export interface RentalDependencies {
  repo: RentalRepository;
  now: () => number;
  put: typeof storagePut;
  read: (key: string, maxBytes?: number) => Promise<Buffer>;
  buildPickup: (input: RentalPdfInput) => Promise<Buffer>;
  buildReturn: (input: RentalPdfInput & { returnData: RentalReturn; charges: ReturnType<typeof calculateRentalCharges> }) => Promise<Buffer>;
  sendEmail: (input: { actorKey: string; sender: string; recipient: string; claimEmail: string; kind: string; bytes: Buffer; idempotencyKey: string }) => Promise<{ providerId: string }>;
  senderStatus?: (actorKey: string) => Promise<RentalSharedGmailStatus>;
  providerReady: (sender: string) => boolean;
  connectSharedGmail?: typeof connectSharedGmail;
  finishSharedGmail?: typeof finishSharedGmail;
  disconnectSharedGmail?: typeof disconnectSharedGmail;
}
export async function readRentalStorage(key: string, maxBytes = 30 * 1024 * 1024): Promise<Buffer> {
  const url = await storageGetSignedUrl(key);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: "error" });
  if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > maxBytes) throw new TRPCError({ code: "BAD_GATEWAY", message: "Rental file could not be read." });
  const chunks: Buffer[] = []; let total = 0;
  try { for await (const chunk of response.body as any) { const b = Buffer.from(chunk); total += b.length; if (total > maxBytes) throw new Error("File too large"); chunks.push(b); } return Buffer.concat(chunks); }
  catch { throw new TRPCError({ code: "BAD_GATEWAY", message: "Rental file could not be read." }); }
  finally { for (const b of chunks) b.fill(0); }
}
export const defaultRentalDependencies: RentalDependencies = {
  repo: createDrizzleRentalRepository(), now: Date.now, put: storagePut, read: readRentalStorage, senderStatus: sharedGmailStatus, providerReady: () => false, connectSharedGmail, finishSharedGmail, disconnectSharedGmail,
  sendEmail: async input => { const sent = await sendRentalPacketSharedGmail({ actorKey: input.actorKey, renterEmail: input.recipient, claimEmail: input.claimEmail, pdf: input.bytes, kind: input.kind === "return" ? "return" : "handoff", requestId: input.idempotencyKey }); return { providerId: sent.providerId }; },
  buildPickup: async input => { const pdf = await import("./rentalHandoffPdf"); return pdf.buildRentalPacket(input as any); },
  buildReturn: async input => { const pdf = await import("./rentalHandoffPdf"); return pdf.buildRentalReturnPacket(input as any); },
};
export const rentalSettingsSchema = z.object({ counselApproved: z.boolean(), registrationConfirmed: z.boolean(), financialResponsibilityReference: z.string().max(500), omitFinancialReference: z.boolean(), retentionYears: z.number().int().min(1).max(100), senderEmail: z.union([z.literal(""), z.email().max(254)]), emailProviderReady: z.boolean().optional(), forceInkForRenter: z.boolean().optional(), rates: z.object({ optionA: z.number(), optionB: z.number(), hold: z.number(), late: z.number(), lossOfUse: z.number(), research: z.number() }).strict(), rateVersion: z.number().int().positive() }).strict();
const defaults = (): LaunchSettings => ({ counselApproved: false, registrationConfirmed: false, financialResponsibilityReference: "", omitFinancialReference: false, retentionYears: 7, senderEmail: "", emailProviderReady: false, rates: { ...DEFAULT_RENTAL_RATES }, rateVersion: 1 });
const fail = (code: ConstructorParameters<typeof TRPCError>[0]["code"], message: string): never => { throw new TRPCError({ code, message }); };
export function assertRentalAccess(actor: RentalActor, record: { locationId: number }) { if (actor.role === "shop" && !actor.locationIds.includes(record.locationId)) fail("NOT_FOUND", "Rental record not found."); }
function claimsOnly(actor: RentalActor) { if (actor.role === "shop") fail("FORBIDDEN", "Claims or Admin access is required."); }
function adminOnly(actor: RentalActor) { if (actor.role !== "admin") fail("FORBIDDEN", "Admin access is required."); }
function assertFixedRates(rates: RentalRates) { if (Object.entries(DEFAULT_RENTAL_RATES).some(([k, v]) => rates[k as keyof RentalRates] !== v)) fail("PRECONDITION_FAILED", "Rates must match the approved v7 PDF: A $20, B $40, hold/late/loss of use $50, research $25. An approved PDF revision is required for other prices."); }
function checkRevision(record: RentalRows["records"], revision: number) { if (record.revision !== revision) fail("CONFLICT", "This rental changed. Reload before saving."); }
const CLAIMS_FIELDS: (keyof RentalDraft)[] = ["renterName", "mobile", "email", "claimEmail", "claimNumber", "locationId", "vehicleId", "scheduledPickup", "expectedReturn", "renterVehicleYmm", "renterVehicleVin", "renterVehiclePlate", "staffNote"];
function redactClosedDraft(draft: RentalDraft, actor: RentalActor, status: string): RentalDraft {
  if (actor.role !== "shop" || status !== "Closed") return draft;
  return { ...draft, dob: "", license: "", licenseExpiration: "", additionalDrivers: draft.additionalDrivers.map(d => ({ ...d, license: "", expiration: "" })), insurance: { ...draft.insurance, policy: "", contact: "", phone: "", notes: "" }, payment: { ...draft.payment, billingAddress: "", zip: "", phone: "", expiration: "" } };
}
function assetPublic(a: RentalRows["assets"]) { return { id: a.id, kind: a.kind, signerName: a.signerName, createdAt: a.createdAt, url: `/api/rental-handoff/files/asset/${a.id}` }; }
function packetPublic(p: RentalRows["packets"]) { return { id: p.id, kind: p.kind, version: p.version, createdAt: p.createdAt, url: `/api/rental-handoff/files/packet/${p.id}` }; }
function packetUrl(id: number) { return `/api/rental-handoff/files/packet/${id}`; }
function selectCurrentAssets(assets: RentalRows["assets"][]) {
  // Uploads are append-only; current signatures/photos select the newest item,
  // while old objects stay available to immutable signed snapshots.
  const current = new Map<string, RentalRows["assets"]>();
  const support = assets.filter(a => isRentalSupport(a.kind));
  const extra = assets.filter(a => a.kind === "extra" || a.kind === "returnExtra");
  for (const a of assets) if (!isRentalSupport(a.kind) && a.kind !== "extra" && a.kind !== "returnExtra" && (!current.has(a.kind) || current.get(a.kind)!.id < a.id)) current.set(a.kind, a);
  const selected = [...Array.from(current.values()), ...extra];
  if (selected.length > 48) fail("BAD_REQUEST", "Limit selected packet evidence to 48 images.");
  return [...selected, ...support];
}
// Only setup accepts an empty inventory selection; persisted drafts always have a real ID.
export const rentalCreateDraftSchema = rentalDraftSchema.extend({
  vehicleId: z.union([z.number().int().nonnegative(), z.literal(""), z.null()]).optional().transform(value => typeof value === "number" ? value : 0),
}).strict();
export const rentalManualVehicleSchema = z.object({
  ymm: z.string().trim().min(1).max(120).regex(/^(?:19|20)\d{2}\s+\S+\s+\S.*$/, "Enter the vehicle year, make and model.").regex(/^[^\u0000-\u001f\u007f]+$/),
  vin: z.string().trim().length(17).regex(/^[A-HJ-NPR-Z0-9]{17}$/i, "VIN must contain 17 valid characters (no I, O or Q).").transform(value => value.toUpperCase()),
  plate: z.string().trim().min(1).max(30).regex(/^[^\u0000-\u001f\u007f]+$/),
  lastOdometer: z.number().int().nonnegative().max(2000000).optional(),
}).strict();
type RentalCreateDraft = z.input<typeof rentalCreateDraftSchema>;
type RentalManualVehicle = z.input<typeof rentalManualVehicleSchema>;
export const RENTAL_SUPPORT_KINDS = ["claimEstimate", "claimPhoto"] as const;
export const RENTAL_SUPPORT_MAX_BYTES = 10 * 1024 * 1024;
const isRentalSupport = (kind: string) => (RENTAL_SUPPORT_KINDS as readonly string[]).includes(kind);
async function decodeRentalSupport(base64: string, kind: typeof RENTAL_SUPPORT_KINDS[number]): Promise<{ bytes: Buffer; mime: string; extension: string }> {
  if (typeof base64 !== "string" || base64.length > Math.ceil(RENTAL_SUPPORT_MAX_BYTES / 3) * 4 + 64) fail("BAD_REQUEST", "Support files must be no larger than 10 MB.");
  const match = /^(?:data:(application\/pdf|image\/(?:png|jpeg));base64,)?([A-Za-z0-9+/]*={0,2})$/.exec(base64);
  if (!match || !match[2] || match[2].length % 4 !== 0) return fail("BAD_REQUEST", "Upload a PDF estimate or a PNG/JPEG vehicle photo.");
  const bytes = Buffer.from(match[2], "base64");
  try {
    if (!bytes.length || bytes.length > RENTAL_SUPPORT_MAX_BYTES || bytes.toString("base64") !== match[2]) fail("BAD_REQUEST", "Invalid support file encoding or size.");
    const pdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR";
    const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
    const mime = pdf ? "application/pdf" : png ? "image/png" : jpeg ? "image/jpeg" : null;
    if (!mime || (match[1] && match[1] !== mime) || (kind === "claimPhoto" && pdf)) return fail("BAD_REQUEST", "Support file content does not match an allowed PDF or photo format.");
    if (pdf) {
      const document = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
      if (!document.getPageCount()) fail("BAD_REQUEST", "Estimate PDF must contain at least one page.");
    } else {
      if (png && (!bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 40000000)) fail("BAD_REQUEST", "Photo dimensions exceed the supported limit.");
      const document = await PDFDocument.create();
      const image = png ? await document.embedPng(bytes) : await document.embedJpg(bytes);
      if (!image.width || !image.height || image.width * image.height > 40000000) fail("BAD_REQUEST", "Photo dimensions exceed the supported limit.");
    }
    return { bytes, mime, extension: pdf ? "pdf" : png ? "png" : "jpg" };
  } catch (error) {
    bytes.fill(0);
    if (error instanceof TRPCError) throw error;
    return fail("BAD_REQUEST", "Support file could not be validated. Upload a valid PDF, PNG or JPEG.");
  }
}
function isRentalSetupDuplicate(error: unknown): boolean {
  // Drizzle wraps MySQL constraint errors in a cause; never expose raw SQL/VINs.
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const details = current as { code?: string; errno?: number; cause?: unknown };
    if (details.code === "ER_DUP_ENTRY" || details.errno === 1062) return true;
    current = details.cause;
  }
  return false;
}
export class RentalHandoffService {
  constructor(readonly deps: RentalDependencies = defaultRentalDependencies) {}
  get repo() { return this.deps.repo; }
  async settings(repo = this.repo): Promise<LaunchSettings> { const row = (await repo.find("settings", { eq: { id: 1 } }))[0]; const settings = row ? decryptRental<LaunchSettings>(row.payload) : defaults(); return { ...settings, emailProviderReady: this.deps.providerReady(settings.senderEmail) }; }
  /** Legacy credentials path is deliberately inactive; Gmail owns the shared sender. */
  async saveSharedSender(actor: RentalActor, _input: unknown): Promise<never> {
    adminOnly(actor);
    return fail("PRECONDITION_FAILED", "Mailgun configuration is retired. A rental Admin must connect the shared Gmail account.");
  }
  async connectSharedGmail(actor: RentalActor) {
    adminOnly(actor);
    if (!this.deps.connectSharedGmail) return fail("SERVICE_UNAVAILABLE", "Shared Gmail authorization is unavailable.");
    try { return await this.deps.connectSharedGmail(actor); }
    catch { return fail("PRECONDITION_FAILED", "Shared Gmail could not be connected. Configure GMAIL_CLIENT_ID/SECRET and register https://whipclaimsivr.com/api/rental-handoff/gmail/callback on that OAuth client, then authorize send-only access as rental Admin."); }
  }
  async finishSharedGmail(actor: RentalActor, code: string, state: string) {
    adminOnly(actor);
    if (!this.deps.finishSharedGmail) return fail("SERVICE_UNAVAILABLE", "Shared Gmail authorization is unavailable.");
    return this.deps.finishSharedGmail(actor, code, state);
  }
  async disconnectSharedGmail(actor: RentalActor) {
    adminOnly(actor);
    if (!this.deps.disconnectSharedGmail) return fail("SERVICE_UNAVAILABLE", "Shared Gmail authorization is unavailable.");
    try { return await this.deps.disconnectSharedGmail(actor); }
    catch { return fail("SERVICE_UNAVAILABLE", "Shared Gmail disconnect could not be completed. Check the shared connection before sending."); }
  }
  async actorSettings(actor: RentalActor, repo = this.repo) {
    const settings = await this.settings(repo);
    if (!this.deps.senderStatus) return { settings, sender: { connected: settings.emailProviderReady === true, email: settings.senderEmail || null, configured: settings.emailProviderReady === true, provider: "gmail" as const, shared: true as const } };
    let sender: RentalSharedGmailStatus;
    try { sender = await this.deps.senderStatus(actor.key); } catch { sender = { connected: false, email: null, configured: false, provider: "gmail", shared: true }; }
    return { settings: { ...settings, senderEmail: sender.email || "", emailProviderReady: sender.connected && sender.configured }, sender };
  }
  async audit(repo: RentalRepository, actor: RentalActor, rentalId: number | null, action: string, detail: unknown) { await repo.insert("audit", { rentalId, actorKey: actor.key, actorName: actor.name, action, detail: encryptRental(detail), createdAt: this.deps.now() }); }
  async record(actor: RentalActor, id: number, repo = this.repo, lock = false) { const r = (await repo.find("records", { eq: { id }, lock }))[0]; if (!r) fail("NOT_FOUND", "Rental record not found."); assertRentalAccess(actor, r); return r; }
  async locationVehicle(draft: RentalDraft, repo = this.repo) {
    const location = (await repo.find("locations", { eq: { id: draft.locationId, active: true } }))[0];
    const vehicle = (await repo.find("vehicles", { eq: { id: draft.vehicleId, locationId: draft.locationId, active: true } }))[0];
    if (!location || !vehicle) fail("BAD_REQUEST", "Choose an active location and a vehicle assigned to it.");
    return { location, vehicle };
  }
  async session(actor: RentalActor | null) {
    if (!actor) return { actor: null, settings: null, locations: [], vehicles: [], launchGaps: [] };
    const { settings, sender } = await this.actorSettings(actor);
    const scope = actor.role === "shop" ? { in: { id: actor.locationIds } } : {};
    const locations = await this.repo.find("locations", { ...scope, eq: { active: true } });
    const vehicles = await this.repo.find("vehicles", { eq: { active: true }, in: { locationId: locations.map(l => l.id) } });
    const out = await this.repo.find("records", { eq: { status: "Out" }, in: { locationId: locations.map(l => l.id) } });
    return { actor: { key: actor.key, name: actor.name, role: actor.role, locationIds: actor.locationIds }, settings, sender, locations, vehicles: vehicles.map(v => { const rental = out.find(r => r.vehicleId === v.id); return { id: v.id, locationId: v.locationId, ymm: v.ymm, vin: v.vin, plate: v.plate, lastOdometer: v.lastOdometer, status: rental ? "Out" as const : "Available" as const, renterName: rental ? decryptRental<RentalDraft>(rental.payload).renterName : null }; }), launchGaps: launchMissing(settings) };
  }
  async list(actor: RentalActor, input: { search?: string; status?: string } = {}) {
    const rows = await this.repo.find("records", { ...(actor.role === "shop" ? { in: { locationId: actor.locationIds } } : {}), ...(input.status ? { eq: { status: input.status } } : {}), search: input.search?.trim().slice(0, 180), order: "updatedAt", limit: 500 });
    return rows.map(r => { assertRentalAccess(actor, r); return { id: r.id, status: r.status, revision: r.revision, locationId: r.locationId, vehicleId: r.vehicleId, draft: redactClosedDraft(decryptRental<RentalDraft>(r.payload), actor, r.status), updatedAt: r.updatedAt }; });
  }
  async get(actor: RentalActor, id: number) {
    const r = await this.record(actor, id);
    const [history, packets, emails, audit] = await Promise.all([this.repo.find("assets", { eq: { rentalId: id }, limit: 2000 }), this.repo.find("packets", { eq: { rentalId: id }, limit: 2000 }), this.repo.find("emails", { eq: { rentalId: id }, order: "createdAt", limit: 2000 }), this.repo.find("audit", { eq: { rentalId: id }, order: "createdAt", limit: 2000 })]);
    const assets = r.status === "Out" ? [...(r.activePacketId === null ? await this.versionAssets(this.repo, id) : history.filter(a => !a.kind.startsWith("return"))), ...await this.returnAssets(this.repo, id)] : r.activePacketId === null && r.status === "Scheduled" ? [...await this.versionAssets(this.repo, id), ...history.filter(a => a.kind.startsWith("return"))] : history;
    return { id: r.id, status: r.status as "Scheduled" | "Out" | "Returned" | "Closed", locationId: r.locationId, vehicleId: r.vehicleId, updatedAt: r.updatedAt, revision: r.revision, activePacketId: r.activePacketId, draft: redactClosedDraft(decryptRental<RentalDraft>(r.payload), actor, r.status), rates: decryptRental<RentalRates>(r.rateSnapshot), assets: assets.filter(a => !(actor.role === "shop" && r.status === "Closed" && ["licenseFront", "licenseBack"].includes(a.kind))).map(assetPublic), packets: actor.role === "shop" && r.status === "Closed" ? [] : packets.map(packetPublic), emails: emails.map(e => ({ id: e.id, packetId: e.packetId, recipient: decryptRental<string>(e.recipient), status: e.status, providerId: e.providerId, error: e.error ? decryptRental<string>(e.error) : null, createdAt: e.createdAt, sentAt: e.sentAt })), audit: audit.map(a => ({ id: a.id, actorName: a.actorName, action: a.action, detail: decryptRental<unknown>(a.detail), createdAt: a.createdAt })), returnData: r.returnPayload ? decryptRental<RentalReturn & { charges?: unknown }>(r.returnPayload) : null };
  }
  async create(actor: RentalActor, inputDraft: RentalCreateDraft, manualInput?: RentalManualVehicle) {
    if (actor.role !== "admin" && actor.role !== "claims") fail("FORBIDDEN", "Claims or Admin access is required.");
    const draft = rentalCreateDraftSchema.parse(inputDraft); enforceDraftCardSafety(draft);
    const parsedVehicle = manualInput === undefined ? undefined : rentalManualVehicleSchema.safeParse(manualInput);
    if (parsedVehicle && !parsedVehicle.success) fail("BAD_REQUEST", "Enter a valid year/make/model, 17-character VIN, plate and whole-number odometer (0–2,000,000).");
    const manual = parsedVehicle?.success ? parsedVehicle.data : undefined;
    if (draft.locationId <= 0) fail("BAD_REQUEST", "Choose an active location.");
    if (manual && draft.vehicleId > 0) fail("BAD_REQUEST", "Choose inventory or enter a vehicle manually, not both.");
    if (!manual && draft.vehicleId <= 0) fail("BAD_REQUEST", "Choose an inventory vehicle or enter its year/make/model, VIN and plate.");
    if (manual && draft.odometerOut !== null && !Number.isInteger(draft.odometerOut)) fail("BAD_REQUEST", "Pickup odometer must be a whole number.");
    assertRentalAccess(actor, { locationId: draft.locationId });
    try {
      return await this.repo.transaction(async tx => {
        // Validate and lock location before touching inventory; no fleet is seeded.
        const location = (await tx.find("locations", { eq: { id: draft.locationId, active: true }, lock: true }))[0];
        if (!location) fail("BAD_REQUEST", "Choose an active location.");
        const settings = await this.settings(tx); assertFixedRates(settings.rates);
        let vehicle: RentalRows["vehicles"];
        let inventoryCreated = false;
        if (manual) {
          const existing = (await tx.find("vehicles", { eq: { vin: manual.vin }, lock: true }))[0];
          if (existing) {
            if (existing.vin !== manual.vin || existing.locationId !== location.id || !existing.active || existing.ymm !== manual.ymm || existing.plate !== manual.plate || (manual.lastOdometer !== undefined && existing.lastOdometer !== manual.lastOdometer)) fail("CONFLICT", "This VIN already exists with different vehicle details or is unavailable at this location. Use the existing inventory or contact Admin.");
            const assigned = await tx.find("records", { eq: { vehicleId: existing.id }, in: { status: ["Scheduled", "Out"] }, lock: true, limit: 1 });
            if (assigned.length) fail("CONFLICT", "This VIN is already assigned to an active rental.");
            vehicle = existing;
          } else {
            const lastOdometer = manual.lastOdometer ?? draft.odometerOut ?? 0;
            const values = { locationId: location.id, ymm: manual.ymm, vin: manual.vin, plate: manual.plate, lastOdometer, active: true };
            const vehicleId = await tx.insert("vehicles", values);
            vehicle = { ...values, id: vehicleId };
            inventoryCreated = true;
          }
          if (draft.odometerOut !== null && draft.odometerOut < vehicle.lastOdometer) fail("BAD_REQUEST", "Pickup odometer cannot be below the inventory odometer.");
        } else {
          const selected = (await tx.find("vehicles", { eq: { id: draft.vehicleId, locationId: location.id, active: true }, lock: true }))[0];
          if (!selected) fail("BAD_REQUEST", "Choose an active location and a vehicle assigned to it.");
          vehicle = selected;
        }
        const savedDraft = rentalDraftSchema.parse({ ...draft, vehicleId: vehicle.id });
        const now = this.deps.now();
        const id = await tx.insert("records", { status: "Scheduled", locationId: savedDraft.locationId, vehicleId: vehicle.id, ...this.searchFields(savedDraft, vehicle.vin, vehicle.plate), payload: encryptRental(savedDraft), revision: 1, rateSnapshot: encryptRental(settings.rates), createdBy: actor.key, createdAt: now, updatedAt: now });
        if (inventoryCreated) await this.audit(tx, actor, id, "vehicle.create", { vehicleId: vehicle.id, source: "rental.setup" });
        await this.audit(tx, actor, id, "rental.create", { revision: 1, vehicleId: vehicle.id, inventoryCreated });
        return { id, revision: 1 };
      });
    } catch (error) {
      // The global unique VIN index is the final guard when two locations race.
      if (isRentalSetupDuplicate(error)) fail("CONFLICT", "This VIN was added by another request. Reload inventory before creating the rental.");
      throw error;
    }
  }
  async decodeVin(actor: RentalActor, inputVin: string): Promise<{ year: string; make: string; model: string }> {
    if (!["claims", "admin", "shop"].includes(actor.role)) fail("FORBIDDEN", "Rental access is required.");
    const checked = rentalManualVehicleSchema.shape.vin.safeParse(inputVin);
    if (!checked.success) fail("BAD_REQUEST", "VIN must contain 17 valid characters (no I, O or Q).");
    try {
      // Matches DocGenerator's vPIC fields, but the server owns the URL and VIN validation.
      const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${checked.data}?format=json`, { signal: AbortSignal.timeout(10000), redirect: "error" });
      if (!response.ok || Number(response.headers.get("content-length") || 0) > 2 * 1024 * 1024) fail("BAD_GATEWAY", "VIN decoding is unavailable. Enter the year, make and model manually.");
      const data: unknown = await response.json();
      const results = z.object({ Results: z.array(z.object({ Variable: z.string(), Value: z.string().nullable() })).max(1000) }).safeParse(data);
      if (!results.success) return fail("BAD_GATEWAY", "VIN decoding returned an invalid response. Enter the vehicle manually.");
      const value = (variable: string) => results.data.Results.find(row => row.Variable === variable)?.Value?.trim().slice(0, 120) || "";
      const decoded = { year: value("Model Year"), make: value("Make"), model: value("Model") };
      if (!/^(?:19|20)\d{2}$/.test(decoded.year) || !decoded.make || !decoded.model) fail("NOT_FOUND", "VIN did not decode to a complete year, make and model. Check it or enter the vehicle manually.");
      return decoded;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return fail("BAD_GATEWAY", "VIN decoding is unavailable. Enter the year, make and model manually.");
    }
  }
  searchFields(d: RentalDraft, vin: string, plate: string) { return { renterNameSearch: d.renterName.toLowerCase().slice(0, 180), rentalVinLastSix: vin.slice(-6).toLowerCase(), renterVinLastSix: d.renterVehicleVin.slice(-6).toLowerCase(), claimNumber: d.claimNumber, plateSearch: `${plate} ${d.renterVehiclePlate}`.toLowerCase().slice(0, 80) }; }
  async save(actor: RentalActor, id: number, revision: number, draft: RentalDraft) {
    draft = rentalDraftSchema.parse(draft); enforceDraftCardSafety(draft);
    return this.repo.transaction(async tx => {
      const r = await this.record(actor, id, tx, true); checkRevision(r, revision);
      if (r.activePacketId !== null || !["Scheduled", "Out"].includes(r.status)) fail("CONFLICT", "Signed or returned rentals are locked. Claims must open a new version.");
      const previous = decryptRental<RentalDraft>(r.payload);
      if (actor.role === "shop" && CLAIMS_FIELDS.some(k => JSON.stringify(draft[k]) !== JSON.stringify(previous[k]))) fail("FORBIDDEN", "Shop cannot change Claims-owned rental details.");
      if (r.status === "Out" && (draft.vehicleId !== r.vehicleId || draft.locationId !== r.locationId)) fail("CONFLICT", "An Out rental must keep its vehicle and location until return.");
      const { vehicle } = await this.locationVehicle(draft, tx); assertRentalAccess(actor, { locationId: draft.locationId });
      const changed = Object.keys(draft).filter(k => JSON.stringify(draft[k as keyof RentalDraft]) !== JSON.stringify(previous[k as keyof RentalDraft]));
      if (!await tx.update("records", { eq: { id, revision } }, { payload: encryptRental(draft), ...this.searchFields(draft, vehicle.vin, vehicle.plate), locationId: draft.locationId, vehicleId: draft.vehicleId, revision: revision + 1, updatedAt: this.deps.now() })) fail("CONFLICT", "Rental changed. Reload before saving.");
      if (changed.some(k => k !== "staffNote" && k !== "claimEmail")) {
        const assets = await tx.find("assets", { eq: { rentalId: id }, limit: 2000 });
        if (assets.some(a => a.kind.endsWith("Signature") || a.kind === "signedPayment")) await this.audit(tx, actor, id, "signature.invalidate", { assetCutoffId: Math.max(0, ...assets.map(a => a.id)), fields: changed, revision: revision + 1 });
      }
      await this.audit(tx, actor, id, "rental.save", { revision: revision + 1, fields: changed }); return { revision: revision + 1 };
    });
  }
  async upload(actor: RentalActor, input: { id: number; kind: typeof ASSET_KINDS[number]; base64: string; signerName?: string }, auditData: { ipHash: string; device: string }) {
    if (!ASSET_KINDS.includes(input.kind)) fail("BAD_REQUEST", "Unsupported rental asset kind.");
    if (isRentalSupport(input.kind)) fail("BAD_REQUEST", "Use support upload for retained estimate and vehicle photos.");
    if ((/Signature$/.test(input.kind) || ["signedPayment", "coverageConfirmation"].includes(input.kind)) && !input.signerName?.trim()) fail("BAD_REQUEST", "Signatory name is required.");
    const image = decodeRentalImage(input.base64);
    try {
      return await this.repo.transaction(async tx => {
        const r = await this.record(actor, input.id, tx, true); const isReturn = input.kind.startsWith("return");
        if (r.status === "Closed" || r.status === "Returned" || (isReturn ? r.status !== "Out" || r.activePacketId === null : r.activePacketId !== null || !["Scheduled", "Out"].includes(r.status))) fail("CONFLICT", "This rental is locked for this asset type.");
        const existing = await tx.find("assets", { eq: { rentalId: r.id }, limit: 501 }); if (existing.length >= 500) fail("BAD_REQUEST", "The rental asset limit has been reached.");
        const uploaded = await this.deps.put(`rental-handoff/${randomUUID()}/${randomUUID()}.${image.mime === "image/png" ? "png" : "jpg"}`, image.bytes, image.mime);
        const id = await tx.insert("assets", { rentalId: input.id, kind: input.kind, storageKey: uploaded.key, mime: image.mime, signerName: input.signerName?.trim().slice(0, 120) || null, uploadedBy: actor.key, createdAt: this.deps.now(), ...auditData });
        await this.audit(tx, actor, input.id, "asset.append", { assetId: id, kind: input.kind, ...auditData });
        return assetPublic((await tx.find("assets", { eq: { id } }))[0]);
      });
    } finally { image.bytes.fill(0); }
  }
  async uploadSupport(actor: RentalActor, input: { id: number; kind: typeof RENTAL_SUPPORT_KINDS[number]; base64: string; fileName?: string }, auditData: { ipHash: string; device: string }) {
    if (!["claims", "admin", "shop"].includes(actor.role)) fail("FORBIDDEN", "Rental access is required.");
    if (!isRentalSupport(input.kind)) fail("BAD_REQUEST", "Unsupported claim support kind.");
    await this.record(actor, input.id);
    const file = await decodeRentalSupport(input.base64, input.kind);
    try {
      return await this.repo.transaction(async tx => {
        const record = await this.record(actor, input.id, tx, true);
        if (!["Scheduled", "Out"].includes(record.status)) fail("CONFLICT", "Support attachments are locked after return or closure.");
        const existing = await tx.find("assets", { eq: { rentalId: record.id }, limit: 501 });
        if (existing.length >= 500) fail("BAD_REQUEST", "The rental asset limit has been reached.");
        // Generated object names avoid untrusted filenames; each original stays append-only.
        const uploaded = await this.deps.put(`rental-handoff/support/${randomUUID()}/${randomUUID()}.${file.extension}`, file.bytes, file.mime);
        const id = await tx.insert("assets", { rentalId: record.id, kind: input.kind, storageKey: uploaded.key, mime: file.mime, signerName: null, uploadedBy: actor.key, createdAt: this.deps.now(), ...auditData });
        await this.audit(tx, actor, record.id, "support.append", { assetId: id, kind: input.kind, mime: file.mime, ...auditData });
        return assetPublic((await tx.find("assets", { eq: { id } }))[0]);
      });
    } finally { file.bytes.fill(0); }
  }
  async versionAssets(repo: RentalRepository, rentalId: number, returnKind = false) {
    const assets = await repo.find("assets", { eq: { rentalId }, limit: 2000 });
    const opens = await repo.find("audit", { eq: { rentalId }, in: { action: ["version.open", "signature.invalidate"] }, order: "createdAt", limit: 2000 });
    const cutoff = Math.max(0, ...opens.map(a => decryptRental<{ assetCutoffId: number }>(a.detail).assetCutoffId || 0));
    return selectCurrentAssets(assets.filter(a => returnKind ? a.kind.startsWith("return") : !a.kind.startsWith("return") && (!(a.kind.endsWith("Signature") || ["signedPayment", "coverageConfirmation"].includes(a.kind)) || a.id > cutoff)));
  }
  async buildPacket(input: RentalPdfInput, assets: RentalRows["assets"][], isReturn: boolean) {
    const hydrated: RentalPdfInput["assets"] = [];
    let bytes: Buffer | undefined;
    try {
      let total = 0;
      for (const a of assets.filter(asset => !isRentalSupport(asset.kind))) {
        const image = await this.deps.read(a.storageKey, 5 * 1024 * 1024);
        hydrated.push({ id: a.id, kind: a.kind, signerName: a.signerName, createdAt: a.createdAt, bytes: image });
        total += image.length; if (total > 64 * 1024 * 1024) fail("BAD_REQUEST", "Packet images exceed the 64 MB generation limit.");
      }
      bytes = isReturn ? await this.deps.buildReturn({ ...input, assets: hydrated, returnData: input.returnData!, charges: input.charges! }) : await this.deps.buildPickup({ ...input, assets: hydrated });
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 30 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") fail("INTERNAL_SERVER_ERROR", "Packet PDF generation failed.");
      const uploaded = await this.deps.put(`rental-handoff/packets/${randomUUID()}/${randomUUID()}.pdf`, bytes, "application/pdf");
      return uploaded.key;
    } finally { for (const a of hydrated) a.bytes?.fill(0); bytes?.fill(0); }
  }
  async complete(actor: RentalActor, input: { id: number; revision: number; requestId: string }) {
    const initial = await this.record(actor, input.id);
    const result = await this.repo.transaction(async tx => {
      // All issuance/return locks use vehicle then rental, serializing concurrent rentals for a vehicle.
      const vehicle = (await tx.find("vehicles", { eq: { id: initial.vehicleId }, lock: true }))[0];
      const r = await this.record(actor, input.id, tx, true);
      const replay = (await tx.find("packets", { eq: { requestId: input.requestId }, lock: true }))[0];
      if (replay) { if (replay.rentalId !== r.id || replay.kind !== "pickup") fail("CONFLICT", "Request ID was already used for another operation."); return { packetId: replay.id, replay: true }; }
      checkRevision(r, input.revision);
      if (r.vehicleId !== initial.vehicleId || !vehicle) fail("CONFLICT", "Vehicle assignment changed. Reload and try again.");
      if (!(["Scheduled", "Out"].includes(r.status)) || r.activePacketId !== null) fail("CONFLICT", "Rental is locked or cannot be completed.");
      const draft = rentalDraftSchema.parse(decryptRental<RentalDraft>(r.payload)); enforceDraftCardSafety(draft);
      const { location } = await this.locationVehicle(draft, tx); const { settings } = await this.actorSettings(actor, tx); const rates = decryptRental<RentalRates>(r.rateSnapshot);
      assertFixedRates(rates); assertFixedRates(settings.rates);
      if (JSON.stringify(rates) !== JSON.stringify(settings.rates)) fail("PRECONDITION_FAILED", "Rental rate snapshot differs from current approved rates.");
      const gaps = launchMissing(settings); if (gaps.length) fail("PRECONDITION_FAILED", gaps.join(" "));
      const assets = (await this.versionAssets(tx, r.id)).filter(asset => !isRentalSupport(asset.kind));
      const missing = handoffMissing(draft, assets as any, this.deps.now(), location.timezone, settings.forceInkForRenter === true); if (missing.length) fail("BAD_REQUEST", missing.map(m => `Step ${m.step}: ${m.message}`).join(" "));
      for (const [kind, name] of [["renterSignature", draft.renterName], ["representativeSignature", draft.representativeName], ["signedPayment", draft.payment.cardholderName]]) {
        const asset = assets.find(a => a.kind === kind);
        if (asset && asset.signerName?.trim() !== name.trim()) fail("BAD_REQUEST", "Signature evidence must match the named signatory. Capture a fresh signature.");
      }
      if (draft.odometerOut! < vehicle.lastOdometer) fail("BAD_REQUEST", "Pickup odometer cannot be below the fleet odometer.");
      const otherOut = await tx.find("records", { eq: { vehicleId: vehicle.id, status: "Out" }, lock: true }); if (otherOut.some(other => other.id !== r.id)) fail("CONFLICT", "This vehicle is already Out on another rental.");
      const packets = await tx.find("packets", { eq: { rentalId: r.id }, limit: 2000 }); const version = Math.max(0, ...packets.map(p => p.version)) + 1;
      const pdfInput: RentalPdfInput = { rentalId: r.id, version, draft, vehicle: { ...vehicle, status: "Out" }, location, rates, settings, assets: assets.map(a => ({ id: a.id, kind: a.kind, signerName: a.signerName, createdAt: a.createdAt })) };
      const storageKey = await this.buildPacket(pdfInput, assets, false);
      const packetId = await tx.insert("packets", { rentalId: r.id, version, kind: "pickup", storageKey, snapshot: encryptRental(pdfInput), createdBy: actor.key, createdAt: this.deps.now(), formVersion: RENTAL_FORM_VERSION, requestId: input.requestId });
      if (!await tx.update("records", { eq: { id: r.id, revision: input.revision } }, { status: "Out", activePacketId: packetId, revision: r.revision + 1, updatedAt: this.deps.now() })) fail("CONFLICT", "Rental changed during completion.");
      await this.audit(tx, actor, r.id, "handoff.complete", { packetId, version, revision: r.revision + 1 }); return { packetId, replay: false };
    });
    const email = await this.resend(actor, { packetId: result.packetId, requestId: `pickup:${input.requestId}` });
    return { packetId: result.packetId, url: packetUrl(result.packetId), status: "Out" as const, emailStatus: email.status };
  }
  async returnComplete(actor: RentalActor, input: { id: number; revision: number; requestId: string; data: RentalReturn }) {
    input.data = rentalReturnSchema.parse(input.data); const initial = await this.record(actor, input.id);
    const packetId = await this.repo.transaction(async tx => {
      const vehicle = (await tx.find("vehicles", { eq: { id: initial.vehicleId }, lock: true }))[0]; const r = await this.record(actor, input.id, tx, true);
      const replay = (await tx.find("packets", { eq: { requestId: input.requestId }, lock: true }))[0];
      if (replay) { if (replay.rentalId !== r.id || replay.kind !== "return") fail("CONFLICT", "Request ID was already used for another operation."); return replay.id; }
      checkRevision(r, input.revision);
      // Evidence requirements apply only to new issuance, never immutable packet retries.
      if (!vehicle || vehicle.id !== r.vehicleId || r.status !== "Out" || !r.activePacketId) fail("CONFLICT", "An issued, locked Out packet is required before return.");
      const original = (await tx.find("packets", { eq: { id: r.activePacketId } }))[0]; if (!original || original.kind !== "pickup") fail("CONFLICT", "Original signed packet is missing.");
      const snapshot = decryptRental<RentalPdfInput>(original.snapshot); const draft = snapshot.draft; const data = input.data;
      if (r.returnPayload) {
        const saved = rentalReturnSchema.parse(decryptRental<RentalReturn>(r.returnPayload));
        if (Object.keys(saved).some(k => k !== "chargesSettled" && JSON.stringify(saved[k as keyof RentalReturn]) !== JSON.stringify(data[k as keyof RentalReturn]))) fail("BAD_REQUEST", "Return facts changed. Save the return draft and capture fresh return signatures before completion.");
      }
      // Legacy pickup snapshots can lack mileage; never replace that fact with zero.
      if ((draft.odometerOut !== null && data.odometer < draft.odometerOut) || data.odometer < vehicle.lastOdometer) fail("BAD_REQUEST", "Return odometer cannot be below pickup or fleet odometer.");
      if (!Number.isFinite(Date.parse(data.returnedAt)) || Date.parse(data.returnedAt) > this.deps.now() + 300000 || !data.representativeName.trim() || !CONDITION_AREAS.every(area => data.condition.some(c => c.area === area && (c.ok || c.note.trim())))) fail("BAD_REQUEST", "Complete return time, representative and all 12 condition areas.");
      const all = await tx.find("assets", { eq: { rentalId: r.id }, limit: 2000 }); const assets = await this.returnAssets(tx, r.id, original.createdAt);
      if (!assets.some(a => a.kind === "returnDashboard")) fail("BAD_REQUEST", "Add the return dashboard / instrument-cluster photo showing alerts, fuel level, and odometer (mileage).");
      const required = ["returnFront", "returnRear", "returnDriver", "returnPassenger", "returnRenterSignature", "returnRepresentativeSignature"];
      if (required.some(k => !assets.some(a => a.kind === k))) fail("BAD_REQUEST", "All four return photos and renter/representative signatures are required.");
      const charges = (() => { try { return calculateRentalCharges(draft, data, snapshot.rates, snapshot.location.timezone); } catch (error) { return fail("BAD_REQUEST", error instanceof Error ? error.message : "Invalid return charges."); } })();
      const pickupSignatureIds = snapshot.assets.filter(a => ["renterSignature", "representativeSignature"].includes(a.kind)).map(a => a.id);
      const packetAssets = [...all.filter(a => pickupSignatureIds.includes(a.id)), ...assets];
      if (pickupSignatureIds.length !== 2 || packetAssets.length !== assets.length + 2) fail("CONFLICT", "Original pickup signature evidence is missing.");
      const packets = await tx.find("packets", { eq: { rentalId: r.id }, limit: 2000 }); const version = Math.max(0, ...packets.map(p => p.version)) + 1;
      const pdfInput = { ...snapshot, version, assets: packetAssets.map(a => ({ id: a.id, kind: a.kind, signerName: a.signerName, createdAt: a.createdAt })), returnData: data, charges };
      const storageKey = await this.buildPacket(pdfInput, packetAssets, true);
      const id = await tx.insert("packets", { rentalId: r.id, version, kind: "return", storageKey, snapshot: encryptRental(pdfInput), createdBy: actor.key, createdAt: this.deps.now(), formVersion: RENTAL_FORM_VERSION, requestId: input.requestId });
      if (!await tx.update("records", { eq: { id: r.id, revision: input.revision } }, { status: "Returned", returnPayload: encryptRental({ ...data, charges }), revision: r.revision + 1, updatedAt: this.deps.now() })) fail("CONFLICT", "Rental changed during return.");
      await tx.update("vehicles", { eq: { id: vehicle.id } }, { lastOdometer: data.odometer }); await this.audit(tx, actor, r.id, "return.complete", { packetId: id, version, charges, revision: r.revision + 1 }); return id;
    });
    const email = await this.resend(actor, { packetId, requestId: `return:${input.requestId}` }); return { packetId, url: packetUrl(packetId), status: "Returned" as const, emailStatus: email.status };
  }
  async returnAssets(repo: RentalRepository, rentalId: number, createdAfter = 0) {
    const [assets, saves] = await Promise.all([repo.find("assets", { eq: { rentalId }, limit: 2000 }), repo.find("audit", { eq: { rentalId, action: "return.save" }, limit: 2000 })]);
    const cutoff = Math.max(0, ...saves.map(a => decryptRental<{ assetCutoffId?: number }>(a.detail).assetCutoffId || 0));
    return selectCurrentAssets(assets.filter(a => a.kind.startsWith("return") && a.createdAt >= createdAfter && (!a.kind.endsWith("Signature") || a.id > cutoff)));
  }
  async saveReturn(actor: RentalActor, input: { id: number; revision: number; data: RentalReturn }) {
    const data = rentalReturnSchema.parse(input.data);
    if (data.chargesSettled) fail("BAD_REQUEST", "Settlement cannot be confirmed on a return draft. Complete the return first.");
    return this.repo.transaction(async tx => {
      const r = await this.record(actor, input.id, tx, true); checkRevision(r, input.revision);
      if (r.status !== "Out" || !r.activePacketId) fail("CONFLICT", "An issued, locked Out packet is required before saving a return draft.");
      const pickup = (await tx.find("packets", { eq: { id: r.activePacketId, rentalId: r.id, kind: "pickup" } }))[0];
      if (!pickup) fail("CONFLICT", "Original signed packet is missing.");
      const previous = r.returnPayload ? rentalReturnSchema.parse(decryptRental<RentalReturn>(r.returnPayload)) : null;
      const changed = Object.keys(data).filter(k => !previous || JSON.stringify(previous[k as keyof RentalReturn]) !== JSON.stringify(data[k as keyof RentalReturn]));
      const signatures = changed.length ? await tx.find("assets", { eq: { rentalId: r.id }, in: { kind: ["returnRenterSignature", "returnRepresentativeSignature"] }, limit: 2000 }) : [];
      // Drafts permit initial scalar values (including odometer 0); issuance validates final evidence and charges.
      if (!await tx.update("records", { eq: { id: r.id, revision: input.revision, status: "Out", activePacketId: r.activePacketId } }, { returnPayload: encryptRental(data), revision: r.revision + 1, updatedAt: this.deps.now() })) fail("CONFLICT", "Rental changed. Reload before saving the return draft.");
      await this.audit(tx, actor, r.id, "return.save", { revision: r.revision + 1, fields: changed, assetCutoffId: Math.max(0, ...signatures.map(a => a.id)), resignRequired: signatures.length > 0 });
      return { revision: r.revision + 1 };
    });
  }
  async confirmSettlement(actor: RentalActor, input: { id: number; revision: number; confirmed: true }) {
    claimsOnly(actor);
    if (input.confirmed !== true) fail("BAD_REQUEST", "Explicit charges-settled/posting confirmation is required.");
    return this.repo.transaction(async tx => {
      const r = await this.record(actor, input.id, tx, true); checkRevision(r, input.revision);
      if (r.status !== "Returned" || !r.returnPayload) fail("BAD_REQUEST", "Complete the return before confirming charges settled/posted.");
      const returned = decryptRental<RentalReturn & { charges?: unknown }>(r.returnPayload!);
      const { charges, ...data } = returned; rentalReturnSchema.parse(data);
      // This is an external posting attestation, not a payment, hold release, or signed-PDF amendment.
      if (!await tx.update("records", { eq: { id: r.id, revision: input.revision, status: "Returned" } }, { returnPayload: encryptRental({ ...returned, chargesSettled: true }), revision: r.revision + 1, updatedAt: this.deps.now() })) fail("CONFLICT", "Rental changed. Reload before confirming settlement.");
      await this.audit(tx, actor, r.id, "return.settlement.confirm", { revision: r.revision + 1, confirmed: true, chargesSettled: true, postingConfirmed: true, paymentActionPerformed: false, securityHoldActionPerformed: false });
      return { revision: r.revision + 1, status: "Returned" as const, chargesSettled: true as const };
    });
  }
  async close(actor: RentalActor, id: number, revision: number) {
    claimsOnly(actor); return this.repo.transaction(async tx => { const r = await this.record(actor, id, tx, true); checkRevision(r, revision); const returned = r.returnPayload ? decryptRental<RentalReturn>(r.returnPayload) : null; if (r.status !== "Returned" || !returned?.chargesSettled) fail("BAD_REQUEST", "Return must be completed and charges settled before closing."); if (!await tx.update("records", { eq: { id, revision, status: "Returned" } }, { status: "Closed", revision: revision + 1, updatedAt: this.deps.now() })) fail("CONFLICT", "Rental changed. Reload before closing."); await this.audit(tx, actor, id, "rental.close", { revision: revision + 1, securityHoldReleaseRequired: true }); return { revision: revision + 1, status: "Closed" as const }; });
  }
  async newVersion(actor: RentalActor, id: number, revision: number, reason: string) {
    claimsOnly(actor); if (!reason.trim()) fail("BAD_REQUEST", "A correction reason is required.");
    return this.repo.transaction(async tx => { const r = await this.record(actor, id, tx, true); checkRevision(r, revision); if (r.status !== "Out" || !r.activePacketId) fail("CONFLICT", "Only a locked Out rental can open an editable replacement version."); const assets = await tx.find("assets", { eq: { rentalId: id }, limit: 2000 }); await tx.update("records", { eq: { id, revision } }, { activePacketId: null, revision: revision + 1, updatedAt: this.deps.now() }); await this.audit(tx, actor, id, "version.open", { reason, previousPacketId: r.activePacketId, assetCutoffId: Math.max(0, ...assets.map(a => a.id)), revision: revision + 1, resignRequired: true }); return { revision: revision + 1 }; });
  }
  async authorizeFile(actor: RentalActor, type: "asset" | "packet", id: number) {
    const file = (await this.repo.find(type === "asset" ? "assets" : "packets", { eq: { id } }))[0]; if (!file) fail("NOT_FOUND", "Rental file not found."); const r = await this.record(actor, file.rentalId);
    if (type === "packet" && actor.role === "shop" && r.status === "Closed") fail("FORBIDDEN", "Original signed packets contain restricted identity information and remain available to Claims after closure.");
    if (type === "asset" && actor.role === "shop" && r.status === "Closed" && ["licenseFront", "licenseBack"].includes((file as RentalRows["assets"]).kind)) fail("FORBIDDEN", "License images are restricted after closure.");
    return { storageKey: file.storageKey, mime: type === "packet" ? "application/pdf" : (file as RentalRows["assets"]).mime, filename: type === "packet" ? `metrocars-rental-${id}.pdf` : `rental-asset-${id}.${(file as RentalRows["assets"]).mime === "application/pdf" ? "pdf" : (file as RentalRows["assets"]).mime === "image/png" ? "png" : "jpg"}` };
  }
  async resend(actor: RentalActor, input: { packetId: number; requestId: string }) {
    const packet = (await this.repo.find("packets", { eq: { id: input.packetId } }))[0]; if (!packet) fail("NOT_FOUND", "Packet not found."); const record = await this.record(actor, packet.rentalId);
    if (actor.role === "shop" && record.status === "Closed") fail("FORBIDDEN", "Claims handles original signed packets after closure.");
    // Reserve each email attempt atomically. Gmail correlation is not provider idempotency.
    // Pending/uncertain sends must be reconciled, never blindly reissued with a new key.
    const log = await this.repo.transaction(async tx => {
      const current = await this.record(actor, packet.rentalId, tx, true);
      if (actor.role === "shop" && current.status === "Closed") fail("FORBIDDEN", "Claims handles original signed packets after closure.");
      const existing = (await tx.find("emails", { eq: { requestId: input.requestId }, lock: true }))[0];
      if (existing) { if (existing.packetId !== packet.id) fail("CONFLICT", "Email request ID was already used."); return { ...existing, reserved: false }; }
      const unresolved = (await tx.find("emails", { eq: { packetId: packet.id }, in: { status: ["pending", "uncertain"] }, lock: true }))[0];
      if (unresolved) return { ...unresolved, reserved: false };
      const snapshot = decryptRental<RentalPdfInput>(packet.snapshot); const recipients = { renterEmail: snapshot.draft.email, claimEmail: snapshot.draft.claimEmail };
      if (!z.email().safeParse(recipients.renterEmail).success || !z.email().safeParse(recipients.claimEmail).success) fail("BAD_REQUEST", "Valid renter and individual claim email addresses are required.");
      const id = await tx.insert("emails", { rentalId: packet.rentalId, packetId: packet.id, recipient: encryptRental(recipients), status: "pending", requestId: input.requestId, createdBy: actor.key, createdAt: this.deps.now() });
      return { ...(await tx.find("emails", { eq: { id } }))[0], reserved: true };
    });
    if (!log.reserved) return { status: log.status, ...(log.providerId ? { providerId: log.providerId } : {}) };
    let bytes: Buffer | undefined;
    let providerConfirmed = false;
    try {
      const { settings } = await this.actorSettings(actor); if (!settings.emailProviderReady) throw new Error("Verified sender and rental email provider are not configured.");
      const stored = decryptRental<string | { renterEmail: string; claimEmail: string }>(log.recipient);
      const recipient = typeof stored === "string" ? stored : stored.renterEmail;
      const claimEmail = typeof stored === "string" ? decryptRental<RentalPdfInput>(packet.snapshot).draft.claimEmail : stored.claimEmail;
      bytes = await this.deps.read(packet.storageKey, RENTAL_GMAIL_MAX_PDF_BYTES); const sent = await this.deps.sendEmail({ actorKey: actor.key, sender: settings.senderEmail, recipient, claimEmail, kind: packet.kind, bytes, idempotencyKey: `rental-${tokenHash(input.requestId)}` });
      if (!sent.providerId) throw new RentalGmailDeliveryUncertainError();
      providerConfirmed = true;
      // Legacy "sent" means provider queue acceptance, not recipient delivery.
      await this.repo.transaction(async tx => { await tx.update("emails", { eq: { id: log.id } }, { status: "sent", providerId: sent.providerId, sentAt: this.deps.now() }); await this.audit(tx, actor, packet.rentalId, "email.sent", { packetId: packet.id, emailLogId: log.id, providerId: sent.providerId }); });
      return { status: "sent", providerId: sent.providerId };
    } catch (error) {
      const uncertain = providerConfirmed || error instanceof RentalGmailDeliveryUncertainError || Boolean((error as any)?.deliveryUncertain);
      const status = uncertain ? "uncertain" : "failed";
      const message = uncertain ? "Delivery status uncertain — reconcile before resend. The signed packet remains saved and locked." : error instanceof Error && /^(Verified sender|Email provider rejected|Email provider did not)/.test(error.message) ? error.message.slice(0, 250) : "Packet delivery failed; retry using the resend action. The signed packet remains saved and locked.";
      await this.repo.transaction(async tx => { await tx.update("emails", { eq: { id: log.id } }, { status, error: encryptRental(message) }); await this.audit(tx, actor, packet.rentalId, `email.${status}`, { packetId: packet.id, emailLogId: log.id, error: message }); });
      return { status };
    } finally { bytes?.fill(0); }
  }
  async saveLocation(actor: RentalActor, input: { id?: number; name: string; address: string; phone: string; timezone: string; active: boolean }) {
    adminOnly(actor); try { new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format(); } catch { fail("BAD_REQUEST", "Choose a valid IANA timezone."); }
    return this.repo.transaction(async tx => { const { id, ...fields } = input; if (id) { if (!(await tx.find("locations", { eq: { id }, lock: true }))[0]) fail("NOT_FOUND", "Location not found."); await tx.update("locations", { eq: { id } }, fields); } const savedId = id || await tx.insert("locations", fields); await this.audit(tx, actor, null, "location.save", { locationId: savedId, active: input.active }); return { id: savedId }; });
  }
  async saveVehicle(actor: RentalActor, input: { id?: number; locationId: number; ymm: string; vin: string; plate: string; lastOdometer: number }) {
    adminOnly(actor); return this.repo.transaction(async tx => { if (!(await tx.find("locations", { eq: { id: input.locationId, active: true } }))[0]) fail("BAD_REQUEST", "Choose an active location."); const { id, ...fields } = input; if (id) { const v = (await tx.find("vehicles", { eq: { id }, lock: true }))[0]; if (!v) fail("NOT_FOUND", "Vehicle not found."); const out = await tx.find("records", { eq: { vehicleId: id, status: "Out" } }); if (out.length) fail("CONFLICT", "An Out vehicle cannot be edited."); if (fields.lastOdometer < v.lastOdometer) fail("BAD_REQUEST", "Fleet odometer cannot decrease."); await tx.update("vehicles", { eq: { id } }, fields); } const savedId = id || await tx.insert("vehicles", { ...fields, active: true }); await this.audit(tx, actor, null, "vehicle.save", { vehicleId: savedId }); return { id: savedId }; });
  }
  async saveSettings(actor: RentalActor, input: LaunchSettings) {
    adminOnly(actor); input = rentalSettingsSchema.parse(input); assertFixedRates(input.rates);
    return this.repo.transaction(async tx => { const old = (await tx.find("settings", { eq: { id: 1 }, lock: true }))[0]; const version = (old?.version || 0) + 1; const settings = { ...input, rateVersion: version, emailProviderReady: this.deps.providerReady(input.senderEmail) }; if (old) await tx.update("settings", { eq: { id: 1 } }, { payload: encryptRental(settings), version, updatedAt: this.deps.now() }); else await tx.insert("settings", { id: 1, payload: encryptRental(settings), version, updatedAt: this.deps.now() }); await this.audit(tx, actor, null, "settings.save", { version, counselApproved: settings.counselApproved, registrationConfirmed: settings.registrationConfirmed, omissionAuthorized: settings.omitFinancialReference }); return settings; });
  }
  async inviteShop(actor: RentalActor, input: { name: string; email: string; locationIds: number[] }) {
    adminOnly(actor); const token = randomToken(), expires = this.deps.now() + 48 * 3600000; const email = input.email.trim().toLowerCase(); const ids = Array.from(new Set(input.locationIds));
    return this.repo.transaction(async tx => { const active = await tx.find("locations", { eq: { active: true }, in: { id: ids } }); if (!ids.length || active.length !== ids.length) fail("BAD_REQUEST", "Choose existing active locations for the invitation."); if ((await tx.find("shopUsers", { eq: { email }, lock: true }))[0]) fail("CONFLICT", "This email already has a shop invitation or account."); const id = await tx.insert("shopUsers", { email, name: input.name.trim(), locationIds: JSON.stringify(ids), active: true, activationHash: tokenHash(token), activationExpires: expires, createdAt: this.deps.now() }); await this.audit(tx, actor, null, "shop.invite", { shopUserId: id, locationIds: ids }); return { activationToken: token, activationExpires: expires }; });
  }
  async listShop(actor: RentalActor) { adminOnly(actor); const users = await this.repo.find("shopUsers", { limit: 500 }); return users.map(u => ({ id: u.id, name: u.name, email: u.email, locationIds: JSON.parse(u.locationIds) as number[], active: u.active, activated: Boolean(u.passwordHash), createdAt: u.createdAt })); }
  async deactivateShop(actor: RentalActor, id: number) { adminOnly(actor); return this.repo.transaction(async tx => { if (!(await tx.find("shopUsers", { eq: { id }, lock: true }))[0]) fail("NOT_FOUND", "Shop user not found."); await tx.update("shopUsers", { eq: { id } }, { active: false, activationHash: null, activationExpires: null }); await tx.remove("sessions", { eq: { shopUserId: id } }); await this.audit(tx, actor, null, "shop.deactivate", { shopUserId: id }); return { success: true }; }); }
  async signIn(email: string, password: string) {
    const user = (await this.repo.find("shopUsers", { eq: { email: email.trim().toLowerCase() } }))[0]; const valid = await verifyPassword(password, user?.passwordHash || null);
    if (!valid || !user?.active) fail("UNAUTHORIZED", "Invalid shop email or password.");
    const ids = JSON.parse(user.locationIds) as number[]; if (!ids.length || !(await this.repo.find("locations", { in: { id: ids }, eq: { active: true } })).length) fail("FORBIDDEN", "This shop account has no active location membership."); return { shopUserId: user.id };
  }
  async activate(token: string, password: string) {
    const hash = tokenHash(token); const passwordHash = await hashPassword(password);
    return this.repo.transaction(async tx => { const user = (await tx.find("shopUsers", { eq: { activationHash: hash, active: true }, lock: true }))[0]; if (!user || !user.activationExpires || user.activationExpires <= this.deps.now() || user.passwordHash) fail("UNAUTHORIZED", "This invitation is invalid or expired."); const ids = JSON.parse(user.locationIds) as number[]; if (!(await tx.find("locations", { in: { id: ids }, eq: { active: true } })).length) fail("FORBIDDEN", "This invitation has no active location."); await tx.update("shopUsers", { eq: { id: user.id, activationHash: hash } }, { passwordHash, activationHash: null, activationExpires: null }); await this.audit(tx, { key: `shop:${user.id}`, name: user.name, role: "shop", locationIds: ids }, null, "shop.activate", { shopUserId: user.id }); return { shopUserId: user.id }; });
  }
}
export const rentalHandoffService = new RentalHandoffService();
