import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import * as tables from "../drizzle/rentalReminderSchema";
import { rentalLocations, rentalRecords } from "../drizzle/rentalSchema";
import { getDb } from "./db";
import { createDrizzleRentalRepository, RentalHandoffService, type RentalRepository, type RentalRows } from "./rentalHandoffService";
import { decryptRental, encryptRental, secretKey } from "./rentalHandoffSecurity";
import type { RentalActor, RentalDraft, RentalLocation } from "../shared/rentalHandoff";
import { createTextlineReminderProvider, RentalReminderProviderError, textlineUuid, type RentalReminderProvider, type TextlineDepartment } from "./textlineReminderProvider";
export { createTextlineReminderProvider, RentalReminderProviderError } from "./textlineReminderProvider";
export type { RentalReminderProvider } from "./textlineReminderProvider";
import {
  normalizeReminderPhone, rentalReminderBody, rentalReminderConfigSchema,
  rentalReminderSlots, rentalReminderSubscriptionSchema, REMINDER_BATCH_LIMIT,
  REMINDER_PENDING_TIMEOUT_MS, type RentalReminderConfigInput,
  type RentalReminderConfigStatus, type RentalReminderKind, type RentalReminderSlot,
  type RentalReminderSubscriptionInput,
} from "../shared/rentalReminders";

/** Integration contract: Heartbeat verifies isCron/taskUid, then calls sweep(taskUid).
 * Mount a bounded Textline capability-authenticated webhook handler; pass its parsed body to processProviderEvent.
 * No scheduler, migration, webhook registration, or real send runs at module import.
 * Appointments use draft.scheduledPickup: customer's own-car dropoff + rental pickup,
 * NOT expectedReturn (a different workflow, deliberately not sent while Scheduled).
 * A final short DB transaction authorizes dispatch; provider POST is outside it.
 * Cancellation committed before that final authorization is honored. An external SMS
 * cannot be recalled if cancellation commits after dispatch authorization.
 * Consent/subscription writes never write records/revision/assets/packets/signatures.
 * Bounded rotating encrypted-record scans require a 60s Heartbeat and capacity review.
 * Missed 15-minute due windows are deliberately skipped, never sent as stale catch-up.
 * API contracts: https://reference.textline.com/source.yaml v1.3.0 (2026-11-11).
 * Native send 200 != delivery; no delivery event contract is invented.
 */
const tableMap = {
  config: tables.rentalReminderConfig, subscriptions: tables.rentalReminderSubscriptions,
  suppressions: tables.rentalReminderSuppressions, deliveries: tables.rentalReminderDeliveries,
};
export type ReminderTable = keyof typeof tableMap;
export type ReminderRows = { [K in ReminderTable]: (typeof tableMap)[K]["$inferSelect"] };
export type ReminderInserts = { [K in ReminderTable]: (typeof tableMap)[K]["$inferInsert"] };
export type ReminderQuery = {
  eq?: Record<string, unknown>; lte?: Record<string, number>;
  order?: "id" | "lastEvaluatedAt"; descending?: boolean; limit?: number; lock?: boolean;
};
export interface RentalReminderRepository {
  rental: RentalRepository;
  find<K extends ReminderTable>(table: K, query?: ReminderQuery): Promise<ReminderRows[K][]>;
  insert<K extends ReminderTable>(table: K, values: ReminderInserts[K]): Promise<number>;
  update<K extends ReminderTable>(table: K, query: ReminderQuery, values: Partial<ReminderInserts[K]>): Promise<number>;
  /** Only opted-in Scheduled records joined to existing active assigned locations. */
  candidates(limit: number): Promise<number[]>;
  transaction<T>(work: (tx: RentalReminderRepository) => Promise<T>): Promise<T>;
}
function where(table: any, query: ReminderQuery) {
  const parts = Object.entries(query.eq || {}).map(([key, value]) => value === null ? sql`${table[key]} is null` : eq(table[key], value));
  for (const [key, value] of Object.entries(query.lte || {})) parts.push(lte(table[key], value));
  return parts.length ? and(...parts) : undefined;
}
export function createDrizzleRentalReminderRepository(connection?: any): RentalReminderRepository {
  const db = async () => {
    const result = connection || await getDb();
    if (!result) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Reminder database is unavailable." });
    return result;
  };
  return {
    rental: createDrizzleRentalRepository(connection),
    async find(name, query = {}) {
      const table = tableMap[name];
      let request = (await db()).select().from(table).where(where(table, query));
      if (query.order) request = request.orderBy(query.descending ? desc((table as any)[query.order]) : asc((table as any)[query.order]));
      request = request.limit(Math.min(query.limit || REMINDER_BATCH_LIMIT, REMINDER_BATCH_LIMIT));
      if (query.lock) request = request.for("update");
      return request;
    },
    async insert(name, values) { const ids = await (await db()).insert(tableMap[name]).values(values).$returningId(); return ids[0]?.id || (values as any).id; },
    async update(name, query, values) { const [result] = await (await db()).update(tableMap[name]).set(values).where(where(tableMap[name], query)); return Number(result.affectedRows); },
    async candidates(limit) {
      const s = tables.rentalReminderSubscriptions;
      const rows = await (await db()).select({ id: rentalRecords.id }).from(s)
        .innerJoin(rentalRecords, eq(s.rentalId, rentalRecords.id))
        .innerJoin(rentalLocations, eq(rentalRecords.locationId, rentalLocations.id))
        .where(and(eq(s.enabled, true), eq(s.appointmentCanceled, false), eq(rentalRecords.status, "Scheduled"), eq(rentalLocations.active, true)))
        .orderBy(asc(s.lastEvaluatedAt), asc(s.id)).limit(Math.min(limit, REMINDER_BATCH_LIMIT));
      return rows.map((r: { id: number }) => r.id);
    },
    async transaction(work) { return (await db()).transaction((tx: any) => work(createDrizzleRentalReminderRepository(tx))); },
  };
}
const fail = (code: ConstructorParameters<typeof TRPCError>[0]["code"], message: string): never => { throw new TRPCError({ code, message }); };
function actorRequired(actor: RentalActor) {
  if (!actor || !actor.key || !["admin", "claims", "shop"].includes(actor.role)) fail("UNAUTHORIZED", "Rental authentication is required.");
}
export function reminderPhoneHash(phone: string): string {
  const normalized = normalizeReminderPhone(phone);
  if (!normalized) return fail("BAD_REQUEST", "A valid US or Canada mobile number is required.");
  return createHmac("sha256", secretKey("sms-reminder-phone:v1")).update(normalized).digest("hex");
}
/** REQUIRED integration hook in every mobile-changing rental draft save.
 * Pass the reminder repository bound to the SAME transaction after locking the rental.
 * Without observing draft writes, no reminder-only library can detect A -> B -> A
 * between sweeps. This hook permanently retires old consent on any normalized change.
 * Formatting-only changes retain consent. No signatures or rental payload are written.
 */
export async function invalidateRentalReminderConsentOnPhoneChange(
  repo: Pick<RentalReminderRepository, "update">, rentalId: number,
  previousMobile: string, nextMobile: string, now = Date.now(),
) {
  if (normalizeReminderPhone(previousMobile) === normalizeReminderPhone(nextMobile)) return 0;
  return repo.update("subscriptions", { eq: { rentalId } }, {
    enabled: false, consentAt: null, consentBy: null, consentPhoneHash: null, updatedAt: now,
  });
}
export function reminderAppointmentKey(at: number, location: RentalLocation): string {
  // Exact location details and timezone are part of identity: relocating recomputes slots.
  return createHash("sha256").update(JSON.stringify(["pickup-dropoff:v1", at, location.id, location.name, location.address, location.phone, location.timezone])).digest("hex");
}
function duplicate(error: unknown): boolean {
  let value: any = error;
  for (let i = 0; i < 5 && value; i++, value = value.cause) if (value.code === "ER_DUP_ENTRY" || value.errno === 1062) return true;
  return false;
}
export interface RentalReminderDependencies {
  repo: RentalReminderRepository;
  /** Default binds RentalHandoffService.record to the SAME transaction and scope. */
  record: (actor: RentalActor, id: number, rentalRepo: RentalRepository, lock: boolean) => Promise<RentalRows["records"]>;
  provider: RentalReminderProvider;
  now: () => number;
  webhookSigningSecret?: () => string | undefined;
}
let runtimeTextlineCredentials: { token?: string; capability?: string; signingSecret?: string } = {};
export const defaultRentalReminderDependencies: RentalReminderDependencies = {
  repo: createDrizzleRentalReminderRepository(), provider: createTextlineReminderProvider(fetch, () => runtimeTextlineCredentials.token || process.env.TEXTLINE_ACCESS_TOKEN), now: Date.now,
  record: (actor, id, repo, lock) => new RentalHandoffService().record(actor, id, repo, lock),
};
function configDefaults(): ReminderRows["config"] {
  return { id: 1, enabled: false, aircallNumberId: 0, carrierApproved: false, scheduleCronTaskUid: null, webhookTokenPayload: null, textlineAccessTokenPayload: null, textlineWebhookCapabilityPayload: null, textlineWebhookSecretPayload: null, textlineDepartmentUuid: null, textlineDepartmentVerified: false, textlineDepartmentName: null, textlineSenderPhone: null, textlineWebhooksConfirmed: false, textlineWebhookSecretHash: null, lastRunAt: null, lastError: null, updatedAt: 0 };
}
function subscriptionDefaults(id: number): ReminderRows["subscriptions"] {
  return { id: 0, rentalId: id, enabled: false, consentAt: null, consentBy: null, consentPhoneHash: null, appointmentCanceled: false, lastEvaluatedAt: 0, updatedAt: 0 };
}
/** A dedicated URL capability is supported by Textline's configurable target URL.
 * Never expose this secret or its URL through status, errors, or rental responses.
 */
function webhookSecret(): string | null {
  const value = runtimeTextlineCredentials.capability || process.env.TEXTLINE_WEBHOOK_SECRET;
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : null;
}
function secretHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export type TextlineEventAuthentication = { signature?: string; time?: string; type?: string };
/** Official contract: SHA256(eventType + unixSeconds + organizationWebhookSecret).
 * This authenticates metadata, not the body. The separate private URL capability
 * and HTTPS bind the callback transport; neither credential is exposed to clients.
 */
export function verifyTextlineEventSignature(secret: string, auth: TextlineEventAuthentication | undefined, now: number): boolean {
  if (!secret || !auth || !/^[a-f0-9]{64}$/i.test(auth.signature || "") || !/^\d{10}$/.test(auth.time || "") || !auth.type || auth.type.length > 80) return false;
  if (Math.abs(now - Number(auth.time) * 1000) > 10 * 60_000) return false;
  const expected = createHash("sha256").update(auth.type + auth.time + secret).digest();
  return timingSafeEqual(expected, Buffer.from(auth.signature!, "hex"));
}
function webhookConfigured(config: ReminderRows["config"]) {
  const secret = webhookSecret();
  return Boolean(secret && config.textlineWebhooksConfirmed && config.textlineWebhookSecretHash === secretHash(secret));
}
function configPublic(config: ReminderRows["config"], credentialsConfigured: boolean): RentalReminderConfigStatus {
  const authenticatedWebhook = webhookConfigured(config);
  const blockers = [
    ...(!config.enabled ? ["disabled"] : []), ...(!config.textlineDepartmentUuid ? ["textline_department_required"] : []),
    ...(!config.textlineDepartmentVerified ? ["textline_department_verification_required"] : []), ...(!credentialsConfigured ? ["provider_credentials_missing"] : []),
    ...(!authenticatedWebhook ? ["authenticated_textline_webhooks_required"] : []), ...(!config.scheduleCronTaskUid ? ["heartbeat_owner_required"] : []),
  ];
  return { enabled: config.enabled, textlineDepartmentUuid: config.textlineDepartmentUuid,
    textlineDepartmentVerified: config.textlineDepartmentVerified, textlineDepartmentName: config.textlineDepartmentName,
    textlineSenderPhone: config.textlineSenderPhone, textlineWebhooksConfirmed: config.textlineWebhooksConfirmed,
    scheduleCronTaskUid: config.scheduleCronTaskUid, lastRunAt: config.lastRunAt, lastError: config.lastError,
    provider: "textline", credentialsConfigured, webhookConfigured: authenticatedWebhook, ready: !blockers.length, blockers,
    senderNotice: "Textline must return the selected accessible SMS department and sender phone. Department capability is not carrier approval or delivery confirmation. Live department and customer eligibility are checked before every send; native contact consent must already be true. No consent is imported or STOP cleared by this app.",
  };
}
type Current = { record: RentalRows["records"]; location: RentalLocation; phone: string | null; phoneHash: string | null; subscription: ReminderRows["subscriptions"]; suppressed: boolean; slots: RentalReminderSlot[]; body: string | null; key: string | null };
const cronActor: RentalActor = { key: "system:rental-reminder", name: "Rental reminder", role: "admin", locationIds: [] };
export type RentalReminderSweepResult = { examined: number; accepted: number; failed: number; uncertain: number; skipped: number; reason?: string };
export class RentalReminderService {
  constructor(readonly deps: RentalReminderDependencies = defaultRentalReminderDependencies) {}
  private async config(repo = this.deps.repo, lock = false) {
    const result = (await repo.find("config", { eq: { id: 1 }, lock, limit: 1 }))[0] || configDefaults();
    if (this.deps === defaultRentalReminderDependencies) {
      runtimeTextlineCredentials = {};
      if (result.textlineAccessTokenPayload) runtimeTextlineCredentials.token = decryptRental<string>(result.textlineAccessTokenPayload);
      if (result.textlineWebhookCapabilityPayload) runtimeTextlineCredentials.capability = decryptRental<string>(result.textlineWebhookCapabilityPayload);
      if (result.textlineWebhookSecretPayload) runtimeTextlineCredentials.signingSecret = decryptRental<string>(result.textlineWebhookSecretPayload);
    }
    return result;
  }
  private elected(config: ReminderRows["config"], taskUid: string, departmentUuid?: string | null) {
    return config.id === 1 && config.scheduleCronTaskUid === taskUid && configPublic(config, this.deps.provider.configured()).ready && (departmentUuid === undefined || config.textlineDepartmentUuid === departmentUuid);
  }
  async configStatus(actor: RentalActor): Promise<RentalReminderConfigStatus> { actorRequired(actor); return configPublic(await this.config(), this.deps.provider.configured()); }
  async saveConfig(actor: RentalActor, input: RentalReminderConfigInput) {
    actorRequired(actor); if (actor.role !== "admin") fail("FORBIDDEN", "Admin access is required.");
    const value = rentalReminderConfigSchema.parse(input);
    await this.config(); // Load encrypted shared credentials before the read-only check.
    let checked: TextlineDepartment = { verified: false, name: null, senderPhone: null };
    if (value.textlineDepartmentUuid && this.deps.provider.configured()) {
      try { checked = await this.deps.provider.department(value.textlineDepartmentUuid); }
      catch { fail("PRECONDITION_FAILED", "Textline department could not be verified."); }
    }
    await this.deps.repo.transaction(async tx => {
      const old = await this.config(tx, true);
      const existing = (await tx.find("config", { eq: { id: 1 }, limit: 1 }))[0];
      const secret = webhookSecret();
      const next = { ...old, enabled: value.enabled, textlineDepartmentUuid: value.textlineDepartmentUuid,
        textlineDepartmentVerified: checked.verified, textlineDepartmentName: checked.name, textlineSenderPhone: checked.senderPhone,
        textlineWebhooksConfirmed: value.textlineWebhooksConfirmed,
        textlineWebhookSecretHash: value.textlineWebhooksConfirmed && secret ? secretHash(secret) : null,
        scheduleCronTaskUid: value.scheduleCronTaskUid, lastError: null, updatedAt: this.deps.now() };
      if (value.enabled && !configPublic(next, this.deps.provider.configured()).ready) fail("PRECONDITION_FAILED", "Reminders require a verified Textline SMS department, server access token, dedicated secret-authenticated New Customer Post and Customer Updated webhooks confirmed by an admin, and Heartbeat owner.");
      if (existing) await tx.update("config", { eq: { id: 1 } }, next); else await tx.insert("config", next);
    });
    return this.configStatus(actor);
  }
  private async current(actor: RentalActor, id: number, repo: RentalReminderRepository, lock: boolean): Promise<Current> {
    const record = await this.deps.record(actor, id, repo.rental, lock);
    const location = (await repo.rental.find("locations", { eq: { id: record.locationId }, lock, limit: 1 }))[0];
    const subscription = (await repo.find("subscriptions", { eq: { rentalId: id }, lock, limit: 1 }))[0] || subscriptionDefaults(id);
    const draft = decryptRental<RentalDraft>(record.payload);
    const phone = normalizeReminderPhone(draft.mobile), phoneHash = phone ? reminderPhoneHash(phone) : null;
    if (lock && subscription.id && subscription.consentPhoneHash && subscription.consentPhoneHash !== phoneHash) {
      const invalidated = { enabled: false, consentAt: null, consentBy: null, consentPhoneHash: null, updatedAt: this.deps.now() };
      await repo.update("subscriptions", { eq: { rentalId: id } }, invalidated);
      Object.assign(subscription, invalidated);
    }
    const suppressed = phoneHash ? Boolean((await repo.find("suppressions", { eq: { phoneHash }, lock, limit: 1 }))[0]) : false;
    const slots = location?.active ? rentalReminderSlots(draft.scheduledPickup, location.timezone, this.deps.now()) : [];
    let body: string | null = null, key: string | null = null;
    if (location && draft.locationId === record.locationId && slots.length) {
      try { body = rentalReminderBody(slots[0].appointmentAt, location); key = reminderAppointmentKey(slots[0].appointmentAt, location); } catch { /* incomplete location fails closed */ }
    }
    return { record, location, subscription, phone, phoneHash, suppressed, slots, body, key };
  }
  private eligible(c: Current) {
    return c.record.status === "Scheduled" && Boolean(c.location?.active && c.body && c.key && c.phoneHash && c.phone) && c.subscription.enabled && !c.subscription.appointmentCanceled && c.subscription.consentAt !== null && Boolean(c.subscription.consentBy) && c.subscription.consentPhoneHash === c.phoneHash && !c.suppressed;
  }
  async get(actor: RentalActor, id: number) {
    actorRequired(actor);
    const c = await this.current(actor, id, this.deps.repo, false);
    const logs = await this.deps.repo.find("deliveries", { eq: { rentalId: id }, order: "id", descending: true, limit: 50 });
    return {
      rentalId: id, preview: c.body, appointmentKey: c.key, slots: c.slots,
      eligible: this.eligible(c), suppressed: c.suppressed, phoneValid: Boolean(c.phone),
      consentMatchesPhone: Boolean(c.phoneHash && c.subscription.consentPhoneHash === c.phoneHash),
      subscription: { enabled: c.subscription.enabled, canceled: c.subscription.appointmentCanceled, consentAt: c.subscription.consentAt, consentBy: c.subscription.consentBy },
      logs: logs.map(d => ({ id: d.id, appointmentKey: d.appointmentKey, kind: d.kind, state: d.state, appointmentAt: d.appointmentAt, dueAt: d.dueAt, createdAt: d.createdAt, updatedAt: d.updatedAt, errorCode: d.errorCode })),
    };
  }
  async saveSubscription(actor: RentalActor, id: number, input: RentalReminderSubscriptionInput) {
    actorRequired(actor); if (actor.role === "shop") fail("FORBIDDEN", "Claims or Admin access is required.");
    const value = rentalReminderSubscriptionSchema.parse(input);
    await this.deps.repo.transaction(async tx => {
      await this.config(tx, true); // Same lock order as sweep / STOP.
      const c = await this.current(actor, id, tx, true);
      if (value.enabled && (!c.phoneHash || !c.phone)) fail("BAD_REQUEST", "A valid US or Canada mobile number is required.");
      if (value.enabled && c.suppressed) fail("PRECONDITION_FAILED", "This phone has opted out. It cannot be re-enabled here.");
      if (value.enabled && !value.confirmedConsent) fail("BAD_REQUEST", "Explicit customer SMS consent confirmation is required.");
      const next = {
        rentalId: id, enabled: value.enabled, appointmentCanceled: value.canceled,
        consentAt: value.enabled ? this.deps.now() : c.subscription.consentAt,
        consentBy: value.enabled ? actor.key : c.subscription.consentBy,
        consentPhoneHash: value.enabled ? c.phoneHash : c.subscription.consentPhoneHash,
        lastEvaluatedAt: 0, updatedAt: this.deps.now(),
      };
      if (c.subscription.id) await tx.update("subscriptions", { eq: { rentalId: id } }, next); else await tx.insert("subscriptions", next);
    });
    return this.get(actor, id);
  }
  /** No public RPC: only authenticated provider processing may call global suppression. */
  async optOutPhone(phone: string, reason = "STOP", expectedConfig?: { departmentUuid: string; secret: string }) {
    const normalized = normalizeReminderPhone(phone);
    if (!normalized) return { suppressed: false };
    const phoneHash = reminderPhoneHash(normalized);
    const suppressed = await this.deps.repo.transaction(async tx => {
      const live = await this.config(tx, true);
      if (expectedConfig && (live.textlineDepartmentUuid !== expectedConfig.departmentUuid || webhookSecret() !== expectedConfig.secret || !webhookConfigured(live))) return false;
      if (!(await tx.find("suppressions", { eq: { phoneHash }, lock: true, limit: 1 }))[0]) {
        try { await tx.insert("suppressions", { phoneHash, reason: ["STOP", "CANCEL", "END", "QUIT", "UNSUBSCRIBE", "STOPALL"].includes(reason) ? reason : "STOP", createdAt: this.deps.now() }); }
        catch (error) { if (!duplicate(error)) throw error; }
      }
      await tx.update("subscriptions", { eq: { consentPhoneHash: phoneHash } }, { enabled: false, updatedAt: this.deps.now() });
      return true;
    });
    return { suppressed };
  }
  private async reserve(id: number, kind: RentalReminderKind, taskUid: string, departmentUuid: string): Promise<ReminderRows["deliveries"] | null> {
    try {
      return await this.deps.repo.transaction(async tx => {
        const config = await this.config(tx, true);
        if (!this.elected(config, taskUid, departmentUuid)) return null;
        const c = await this.current(cronActor, id, tx, true);
        const slot = c.slots.find(s => s.kind === kind && s.due);
        if (!slot || !this.eligible(c)) return null;
        if ((await tx.find("deliveries", { eq: { rentalId: id, appointmentKey: c.key!, kind }, lock: true, limit: 1 }))[0]) return null;
        const now = this.deps.now();
        const row: ReminderInserts["deliveries"] = {
          rentalId: id, appointmentKey: c.key!, kind, state: "pending", aircallNumberId: 0, provider: "textline", textlineDepartmentUuid: departmentUuid, textlineConversationUuid: null, textlineCustomerUuid: null,
          recipientPhoneHash: c.phoneHash!, recipientPayload: encryptRental(c.phone), messagePayload: encryptRental(c.body),
          appointmentAt: slot.appointmentAt, dueAt: slot.dueAt, reservationToken: randomUUID(), createdAt: now, updatedAt: now,
        };
        const deliveryId = await tx.insert("deliveries", row);
        return { ...row, id: deliveryId, providerId: null, errorCode: null, dispatchAt: null, providerEventAt: null } as ReminderRows["deliveries"];
      });
    } catch (error) { if (duplicate(error)) return null; throw error; }
  }
  private async authorizeDispatch(delivery: ReminderRows["deliveries"], taskUid: string) {
    return this.deps.repo.transaction(async tx => {
      const config = await this.config(tx, true);
      const c = await this.current(cronActor, delivery.rentalId, tx, true);
      const row = (await tx.find("deliveries", { eq: { id: delivery.id }, lock: true, limit: 1 }))[0];
      if (!row || row.state !== "pending" || row.dispatchAt !== null || row.reservationToken !== delivery.reservationToken) return false;
      const valid = delivery.provider === "textline" && this.elected(config, taskUid, delivery.textlineDepartmentUuid) && this.eligible(c) && c.key === delivery.appointmentKey && c.phoneHash === delivery.recipientPhoneHash && c.slots.some(s => s.kind === delivery.kind && s.due);
      if (!valid || this.deps.now() >= row.createdAt + REMINDER_PENDING_TIMEOUT_MS) {
        await tx.update("deliveries", { eq: { id: row.id, state: "pending" } }, { state: "skipped", errorCode: "stale_or_canceled", updatedAt: this.deps.now() });
        return false;
      }
      return Boolean(await tx.update("deliveries", { eq: { id: row.id, state: "pending", dispatchAt: null } }, { dispatchAt: this.deps.now(), updatedAt: this.deps.now() }));
    });
  }
  async sweep(taskUid: string): Promise<RentalReminderSweepResult> {
    const result: RentalReminderSweepResult = { examined: 0, accepted: 0, failed: 0, uncertain: 0, skipped: 0 };
    if (typeof taskUid !== "string" || !taskUid || taskUid.length > 65) return { ...result, reason: "orphan" };
    // Resolve by exact authenticated task UID, never callback body/name.
    const owner = (await this.deps.repo.find("config", { eq: { id: 1, scheduleCronTaskUid: taskUid, enabled: true }, limit: 1 }))[0];
    if (!owner) return { ...result, reason: "disabled_or_orphan" };
    const started = this.deps.now();
    try {
      // Recover orphaned reservations even if provider approval was subsequently lost.
      await this.deps.repo.update("deliveries", { eq: { state: "pending" }, lte: { createdAt: started - REMINDER_PENDING_TIMEOUT_MS } }, { state: "uncertain", errorCode: "reservation_expired_no_retry", updatedAt: started });
      if (!this.elected(owner, taskUid)) return { ...result, reason: "sender_not_ready" };
      let department: TextlineDepartment;
      try { department = await this.deps.provider.department(owner.textlineDepartmentUuid!); }
      catch { throw new RentalReminderProviderError("department_unavailable"); }
      if (!department.verified || department.senderPhone !== owner.textlineSenderPhone) {
        await this.deps.repo.update("config", { eq: { id: 1, textlineDepartmentUuid: owner.textlineDepartmentUuid, scheduleCronTaskUid: taskUid } }, { textlineDepartmentVerified: false, lastRunAt: this.deps.now(), lastError: "textline_department_unverified" });
        return { ...result, reason: "textline_department_unverified" };
      }
      const ids = await this.deps.repo.candidates(REMINDER_BATCH_LIMIT);
      for (const id of ids) {
        // Leave headroom inside the platform's two-minute callback timeout.
        if (this.deps.now() - started > 95_000) break;
        result.examined++;
        await this.deps.repo.update("subscriptions", { eq: { rentalId: id } }, { lastEvaluatedAt: this.deps.now() });
        for (const kind of ["24h", "2h"] as const) {
          const delivery = await this.reserve(id, kind, taskUid, owner.textlineDepartmentUuid!);
          if (!delivery) { result.skipped++; continue; }
          // Recheck after reservation: old approval at sweep start is not send authority.
          let stillVerified = false;
          try { const live = await this.deps.provider.department(delivery.textlineDepartmentUuid!); stillVerified = live.verified && live.senderPhone === owner.textlineSenderPhone; } catch { /* fail closed */ }
          if (!stillVerified) {
            await this.deps.repo.update("deliveries", { eq: { id: delivery.id, state: "pending", dispatchAt: null } }, { state: "skipped", errorCode: "textline_department_unverified_no_retry", updatedAt: this.deps.now() });
            await this.deps.repo.update("config", { eq: { id: 1, textlineDepartmentUuid: delivery.textlineDepartmentUuid, scheduleCronTaskUid: taskUid } }, { textlineDepartmentVerified: false, lastRunAt: this.deps.now(), lastError: "textline_department_unverified" });
            return { ...result, skipped: result.skipped + 1, reason: "textline_department_unverified" };
          }
          if (!await this.authorizeDispatch(delivery, taskUid)) { result.skipped++; continue; }
          try {
            const sent = await this.deps.provider.send(delivery.textlineDepartmentUuid!, decryptRental<string>(delivery.recipientPayload), decryptRental<string>(delivery.messagePayload));
            // A successful native post is accepted only; no documented delivery webhook is assumed.
            await this.deps.repo.update("deliveries", { eq: { id: delivery.id, state: "pending" } }, { state: "accepted", providerId: sent.providerId, textlineConversationUuid: sent.conversationUuid ?? null, textlineCustomerUuid: sent.customerUuid ?? null, updatedAt: this.deps.now() });
            result.accepted++;
          } catch (error) {
            const ambiguous = !(error instanceof RentalReminderProviderError) || error.uncertain;
            await this.deps.repo.update("deliveries", { eq: { id: delivery.id, state: "pending" } }, { state: ambiguous ? "uncertain" : "failed", errorCode: error instanceof RentalReminderProviderError ? error.code : "provider_uncertain", updatedAt: this.deps.now() });
            if (ambiguous) result.uncertain++; else result.failed++;
          }
        }
      }
      await this.deps.repo.update("config", { eq: { id: 1, scheduleCronTaskUid: taskUid } }, { lastRunAt: this.deps.now(), lastError: result.uncertain ? "provider_uncertain" : result.failed ? "provider_rejected" : null });
      return result;
    } catch {
      await this.deps.repo.update("config", { eq: { id: 1, scheduleCronTaskUid: taskUid } }, { lastRunAt: this.deps.now(), lastError: "reminder_sweep_failed" }).catch(() => undefined);
      return { ...result, reason: "reminder_sweep_failed" };
    }
  }
  /** Textline permits a configurable HTTP target URL. Its dedicated high-entropy
   * path capability authenticates this integration, not body.token/event fields.
   * The documented provider signature does not bind the body; it is not substituted
   * for the capability. START and positive CustomerUpdated never reconsent.
   */
  async processProviderEvent(event: unknown, suppliedSecret?: string, suppliedEventType?: string, auth?: TextlineEventAuthentication): Promise<{ processed: boolean; action?: "suppressed" }> {
    const config = await this.config(), expected = webhookSecret(), body = event as any;
    const presented = typeof suppliedSecret === "string" && suppliedSecret.length <= 256 ? suppliedSecret : "";
    const valid = timingSafeEqual(createHash("sha256").update(expected || "").digest(), createHash("sha256").update(presented).digest());
    if (!expected || !valid || !webhookConfigured(config)) fail("UNAUTHORIZED", "Invalid reminder webhook authentication.");
    const signingSecret = this.deps.webhookSigningSecret?.() || (this.deps === defaultRentalReminderDependencies ? runtimeTextlineCredentials.signingSecret : undefined);
    if (signingSecret && (!verifyTextlineEventSignature(signingSecret, auth, this.deps.now()) || auth?.type !== suppliedEventType)) fail("UNAUTHORIZED", "Invalid reminder webhook authentication.");
    if (!config.textlineDepartmentUuid) return { processed: false };
    if (body?.webhook && suppliedEventType && body.webhook !== suppliedEventType) return { processed: false };
    const type = suppliedEventType || body?.webhook;
    let phone: string | null = null, reason = "STOP";
    if (type === "new_customer_post") {
      if (body?.group?.uuid !== config.textlineDepartmentUuid || !textlineUuid(body?.conversation?.uuid) || !textlineUuid(body?.post?.uuid) || body?.post?.conversation_uuid !== body.conversation.uuid || body?.post?.is_whisper !== false || (body.post.message_type !== undefined && body.post.message_type !== "SMS") || typeof body.post.body !== "string") return { processed: false };
      const keyword = body.post.body.trim().toUpperCase();
      if (!["STOP", "CANCEL", "END", "QUIT", "UNSUBSCRIBE", "STOPALL"].includes(keyword)) return { processed: false };
      if (!textlineUuid(body?.conversation?.customer?.uuid)) return { processed: false };
      phone = normalizeReminderPhone(body.conversation.customer.phone_number); reason = keyword;
    } else if (type === "customer_updated") {
      // Official CustomerUpdated is organization/contact scoped (no group field).
      const customer = body?.customer;
      if (!textlineUuid(customer?.uuid) || !(customer.blocked === true || customer.archived === true || customer.reachable_by_sms === false || customer.reachable === false || customer.consent_status === false)) return { processed: false };
      phone = normalizeReminderPhone(customer.phone_number);
    } else return { processed: false };
    if (!phone) return { processed: false };
    const outcome = await this.optOutPhone(phone, reason, { departmentUuid: config.textlineDepartmentUuid, secret: expected! });
    return outcome.suppressed ? { processed: true, action: "suppressed" } : { processed: false };
  }

}
export const rentalReminderService = new RentalReminderService();
