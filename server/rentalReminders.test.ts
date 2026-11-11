import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRentalDraft, type RentalActor, type RentalDraft, type RentalLocation } from "../shared/rentalHandoff";
 import { normalizeReminderPhone, rentalReminderBody, rentalReminderSlots, REMINDER_PENDING_TIMEOUT_MS, REMINDER_DUE_WINDOW_MS } from "../shared/rentalReminders";
import { encryptRental, decryptRental } from "./rentalHandoffSecurity";
import { RentalHandoffService, type RentalRepository } from "./rentalHandoffService";
import { invalidateRentalReminderConsentOnPhoneChange, reminderAppointmentKey, reminderPhoneHash, RentalReminderProviderError, RentalReminderService, type RentalReminderRepository, type ReminderQuery } from "./rentalReminders";

const admin: RentalActor = { key: "native:1", role: "admin", name: "Admin", locationIds: [] };
const claims: RentalActor = { key: "native:2", role: "claims", name: "Claims", locationIds: [] };
const shop: RentalActor = { key: "shop:1", role: "shop", name: "Shop", locationIds: [2] };
const token = "test-textline-integration-capability-do-not-expose";
const department = "c43a1766-47e1-4c9c-a2cc-36bf424fcbc0";
const customerUuid = "deb79a6a-0652-4e14-86f2-dc8c5c502369";
const conversationUuid = "84a2c56f-6b79-4764-811d-90880e2757b4";
const appointment = Date.parse("2026-11-12T15:00:00Z");
const location: RentalLocation = { id: 1, name: "Total Recon Sterling", address: "123 Actual Street, Sterling, VA 20166", phone: "(703) 555-0123", timezone: "America/New_York", active: true };

/** Shared serial transaction mutex simulates DB FOR UPDATE across distinct service replicas.
 * Unique slot check is independent of that lock (also tested against duplicate insert).
 */
class MemoryRepository {
  rows: Record<string, any[]> = { config: [], subscriptions: [], suppressions: [], deliveries: [], records: [], locations: [{ ...location }], assets: [], packets: [] };
  private tail = Promise.resolve();
  writes: string[] = [];
  beforeDeliveryRead?: () => void;
  beforeReservationCommit?: () => void;
  api: RentalReminderRepository;
  constructor() {
    const matches = (r: any, q: ReminderQuery = {}) => Object.entries(q.eq || {}).every(([k, v]) => r[k] === v) && Object.entries(q.lte || {}).every(([k, v]) => r[k] <= v);
    const find = async (name: string, query: any = {}) => {
      if (name === "deliveries" && query.eq?.id && this.beforeDeliveryRead) { const hook = this.beforeDeliveryRead; this.beforeDeliveryRead = undefined; hook(); }
      let found = this.rows[name].filter(r => matches(r, query));
      if (query.order) found = [...found].sort((a, b) => (a[query.order] - b[query.order]) * (query.descending ? -1 : 1));
      return found.slice(0, query.limit || 100).map(r => ({ ...r }));
    };
    const insert = async (name: string, row: any) => {
      if ((name === "config" && this.rows[name].some(r => r.id === row.id)) || (name === "subscriptions" && this.rows[name].some(r => r.rentalId === row.rentalId)) || (name === "suppressions" && this.rows[name].some(r => r.phoneHash === row.phoneHash)) || (name === "deliveries" && this.rows[name].some(r => r.rentalId === row.rentalId && r.appointmentKey === row.appointmentKey && r.kind === row.kind))) {
        throw Object.assign(new Error("redacted_duplicate"), { code: "ER_DUP_ENTRY" });
      }
      const defaults = name === "deliveries" ? { providerId: null, errorCode: null, dispatchAt: null, providerEventAt: null } : {};
      const value = { ...defaults, ...row, id: row.id || this.rows[name].length + 1 };
      this.rows[name].push(value); this.writes.push(name);
      return value.id;
    };
    const update = async (name: string, query: any, row: any) => { let count = 0; for (const r of this.rows[name]) if (matches(r, query)) { Object.assign(r, row); count++; this.writes.push(name); } return count; };
    const rental = { find, insert, update, remove: async () => undefined, transaction: async (fn: any) => fn(rental) } as RentalRepository;
    this.api = {
      rental, find: find as any, insert: insert as any, update: update as any,
      candidates: async limit => this.rows.subscriptions.filter(s => s.enabled && !s.appointmentCanceled && this.rows.records.some(r => r.id === s.rentalId && r.status === "Scheduled" && this.rows.locations.some(l => l.id === r.locationId && l.active))).sort((a, b) => a.lastEvaluatedAt - b.lastEvaluatedAt || a.id - b.id).slice(0, limit).map(s => s.rentalId),
      transaction: async fn => {
        const previous = this.tail; let release!: () => void;
        this.tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        const backup = structuredClone(this.rows);
        try {
          const result = await fn(this.api);
          if ((result as any)?.reservationToken && this.beforeReservationCommit) { const hook = this.beforeReservationCommit; this.beforeReservationCommit = undefined; hook(); }
          return result;
        } catch (error) { this.rows = backup; throw error; }
        finally { release(); }
      },
    };
  }
}
function fixture() {
  const memory = new MemoryRepository(); let now = appointment - 86_400_000;
  const draft = { ...emptyRentalDraft(), locationId: 1, mobile: "(202) 555-0148", scheduledPickup: new Date(appointment).toISOString(), claimNumber: "SECRET-CLAIM", license: "SECRET-LICENSE" };
  memory.rows.records.push({ id: 1, locationId: 1, status: "Scheduled", payload: encryptRental(draft), revision: 7, activePacketId: 3, updatedAt: now });
  const provider = { configured: () => true, department: vi.fn(async (_id: string) => ({ verified: true, name: "Customer Service", senderPhone: "+14158494349" })), send: vi.fn(async (_id: string, _to: string, _body: string) => ({ providerId: "sms-123" })) };
  const deps = { repo: memory.api, provider, now: () => now, record: (actor: RentalActor, id: number, rental: RentalRepository, lock: boolean) => new RentalHandoffService().record(actor, id, rental, lock) };
  const service = new RentalReminderService(deps);
  const configure = () => service.saveConfig(admin, { enabled: true, textlineDepartmentUuid: department, textlineWebhooksConfirmed: true, scheduleCronTaskUid: "owner-uid" });
  const consent = (id = 1) => service.saveSubscription(claims, id, { enabled: true, confirmedConsent: true, canceled: false });
  const changeDraft = (patch: Partial<RentalDraft>, id = 1) => { const row = memory.rows.records.find(r => r.id === id); row.payload = encryptRental({ ...decryptRental<RentalDraft>(row.payload), ...patch }); row.revision++; };
  const event = (keyword: string, patch: any = {}) => ({
    webhook: "new_customer_post", group: { uuid: department, name: "Customer Service", phone_number: "(415) 849-4349" },
    conversation: { uuid: conversationUuid, resolved: true, customer: { uuid: customerUuid, blocked: false, reachable: true, phone_number: "+1 (202) 555-0148" } },
    post: { uuid: customerUuid, conversation_uuid: conversationUuid, created_at: Math.floor(now / 1000), is_whisper: false, body: keyword, creator: { type: "customer" } }, ...patch,
  });
  return { service, deps, memory, provider, configure, consent, changeDraft, event, setNow: (value: number) => { now = value; } };
}
beforeEach(() => { vi.stubEnv("JWT_SECRET", "test-only-encryption-secret-for-reminders"); vi.stubEnv("TEXTLINE_WEBHOOK_SECRET", token); });
afterEach(() => vi.unstubAllEnvs());

describe("rental reminder consent and scope", () => {
  it("defaults disabled with no consent; never exposes credentials or token", async () => {
    const f = fixture(); expect(await f.service.configStatus(admin)).toMatchObject({ enabled: false, textlineDepartmentUuid: null, textlineDepartmentVerified: false, provider: "textline", ready: false });
    expect(await f.service.get(claims, 1)).toMatchObject({ eligible: false, subscription: { enabled: false } });
    await f.configure(); await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
    expect(JSON.stringify(await f.service.configStatus(admin))).not.toContain(token);
    expect(f.memory.rows.config[0].webhookTokenPayload).toBeNull();
    expect(f.memory.rows.config[0].textlineWebhookSecretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(await f.service.configStatus(admin))).not.toMatch(/aircall|carrierApproved|SecretHash/i);
  });
  it("requires explicit consent and claims/admin writes; keeps signed data unchanged", async () => {
    const f = fixture(); const before = structuredClone(f.memory.rows.records);
    await expect(f.service.saveSubscription(claims, 1, { enabled: true, confirmedConsent: false, canceled: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(f.service.saveSubscription(shop, 1, { enabled: true, confirmedConsent: true, canceled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.service.saveConfig(claims, { enabled: false, textlineDepartmentUuid: null, textlineWebhooksConfirmed: false, scheduleCronTaskUid: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.consent(); expect(f.memory.rows.records).toEqual(before); expect(f.memory.writes).toEqual(["subscriptions"]);
  });
  it("uses handoff record scope and denies wrong-location preview/log access", async () => {
    const f = fixture(); await expect(f.service.get(shop, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await f.service.get({ ...shop, locationIds: [1] }, 1)).toMatchObject({ rentalId: 1 });
  });
  it("phone change cannot reuse old consent; explicit reconsent targets current hash", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    const oldHash = f.memory.rows.subscriptions[0].consentPhoneHash;
    f.changeDraft({ mobile: "2025550199" });
    expect(await f.service.get(claims, 1)).toMatchObject({ eligible: false, consentMatchesPhone: false });
    await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
    await f.consent(); expect(f.memory.rows.subscriptions[0].consentPhoneHash).not.toBe(oldHash);
    await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledWith(department, "+12025550199", expect.any(String));
  });
  it("draft-save hook permanently retires A-to-B-to-A consent while formatting changes do not", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    expect(await invalidateRentalReminderConsentOnPhoneChange(f.memory.api, 1, "2025550148", "+1 (202) 555-0148")).toBe(0);
    await f.memory.api.transaction(async tx => { await invalidateRentalReminderConsentOnPhoneChange(tx, 1, "2025550148", "2025550199"); f.changeDraft({ mobile: "2025550199" }); });
    await f.memory.api.transaction(async tx => { await invalidateRentalReminderConsentOnPhoneChange(tx, 1, "2025550199", "2025550148"); f.changeDraft({ mobile: "2025550148" }); });
    expect(f.memory.rows.subscriptions[0]).toMatchObject({ enabled: false, consentAt: null, consentBy: null, consentPhoneHash: null });
    await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
    await f.consent(); await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledTimes(1);
  });
  it("observed changed phone permanently retires consent even when phone later changes back", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    f.changeDraft({ mobile: "2025550199" }); await f.service.sweep("owner-uid");
    f.changeDraft({ mobile: "2025550148" }); await f.service.sweep("owner-uid");
    expect(f.provider.send).not.toHaveBeenCalled(); expect(f.memory.rows.subscriptions[0].enabled).toBe(false);
  });
  it("Scheduled unassigned vehicleId zero and optional empty plates do not block reminders", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    f.changeDraft({ vehicleId: 0, renterVehiclePlate: "" }); f.memory.rows.records[0].vehicleId = 0;
    await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledTimes(1);
  });
  it("department must still be verified immediately before final dispatch authorization", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    f.provider.department.mockResolvedValueOnce({ verified: true, name: "Customer Service", senderPhone: "+14158494349" }).mockResolvedValueOnce({ verified: false, name: null, senderPhone: null });
    expect(await f.service.sweep("owner-uid")).toMatchObject({ reason: "textline_department_unverified" });
    expect(f.memory.rows.deliveries[0]).toMatchObject({ state: "skipped", errorCode: "textline_department_unverified_no_retry" });
    expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("rejects unsupported/invalid phone formats, extensions and malformed NANP", () => {
    expect(normalizeReminderPhone("1 (202) 555-0148")).toBe("+12025550148");
    for (const value of ["+44 2025550148", "2025550148 ext 1", "1025550148", "2021550148", "++12025550148", "120255501480", "letters2025550148"]) expect(normalizeReminderPhone(value)).toBeNull();
  });
});

describe("appointment timing and message", () => {
  it("renders exact local date/time, assigned address/phone and required purpose only", async () => {
    const f = fixture(); const preview = await f.service.get(claims, 1);
    expect(preview.preview).toBe("MetroCars / Total Recon reminder: Your appointment is Thursday, November 12, 2026 at 10:00 AM EST (America/New_York). Drop off your own vehicle for repairs and pick up your rental at Total Recon Sterling, 123 Actual Street, Sterling, VA 20166. Questions? Call (703) 555-0123. Reply STOP to opt out.");
    expect(preview.preview).not.toMatch(/SECRET|license|claim|card|evidence/i);
    expect(preview.preview!.length).toBeLessThanOrEqual(1600);
    await f.configure(); await f.consent(); await f.service.sweep("owner-uid");
    const delivery = f.memory.rows.deliveries[0]; expect(delivery.recipientPayload).not.toContain("202");
    expect(decryptRental(delivery.messagePayload)).toEqual(preview.preview);
    expect(decryptRental(delivery.recipientPayload)).toBe("+12025550148");
  });
  it("24h is elapsed time across spring/fall DST and 2h requires same local day", () => {
    for (const value of ["2026-03-08T10:00:00Z", "2026-11-01T10:00:00Z"]) {
      const at = Date.parse(value); const slots = rentalReminderSlots(value, "America/New_York", at - 86400000);
      expect(slots[0].dueAt).toBe(at - 86400000); expect(slots[0].due).toBe(true);
    }
    const value = "2026-11-12T06:00:00Z"; const slots = rentalReminderSlots(value, "America/New_York", Date.parse(value) - 7200000);
    expect(slots[1]).toMatchObject({ sameLocalDay: false, due: false, expired: true });
    expect(rentalReminderSlots("2026-11-12T10:00", "America/New_York", 0)).toEqual([]);
    expect(rentalReminderSlots("2026-11-12T15:00:00Z", "invented/timezone", 0)).toEqual([]);
  });
  it("does not send early, late, or past appointments, but sends both exact due slots", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    f.setNow(appointment - 86400000 - 1); await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
    f.setNow(appointment - 86400000); await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledTimes(1);
    f.setNow(appointment - 7200000); await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledTimes(2);
    f.setNow(appointment + 1); await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledTimes(2);
    const late = fixture(); await late.configure(); await late.consent(); late.setNow(appointment - 86400000 + REMINDER_DUE_WINDOW_MS);
    await late.service.sweep("owner-uid"); expect(late.provider.send).not.toHaveBeenCalled();
  });
  it("tolerates platform dispatch jitter within fifteen minutes but never duplicates a slot", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    f.setNow(appointment - 86400000 + 8 * 60_000); await f.service.sweep("owner-uid");
    expect(f.provider.send).toHaveBeenCalledTimes(1);
    f.setNow(appointment - 86400000 + REMINDER_DUE_WINDOW_MS - 1); await f.service.sweep("owner-uid");
    expect(f.provider.send).toHaveBeenCalledTimes(1);
  });
  it("incomplete/inactive/missing locations and non-Scheduled records never send", async () => {
    for (const scenario of ["inactive", "missing", "bad-phone", "empty-address", "Out", "Closed", "Returned"]) {
      const f = fixture(); await f.configure(); await f.consent();
      if (scenario === "inactive") f.memory.rows.locations[0].active = false;
      else if (scenario === "missing") f.memory.rows.locations = [];
      else if (scenario === "bad-phone") f.memory.rows.locations[0].phone = "";
      else if (scenario === "empty-address") f.memory.rows.locations[0].address = "";
      else f.memory.rows.records[0].status = scenario;
      await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
    }
    expect(() => rentalReminderBody(appointment, { ...location, address: "a".repeat(1601) })).toThrow("reminder_body_too_long");
  });
});

describe("reservation, cancellation, concurrency and provider ambiguity", () => {
  it("two replicas and repeated sweeps reserve once; accepted is not delivered", async () => {
    const f = fixture(); await f.configure(); await f.consent(); const replica = new RentalReminderService(f.deps);
    await Promise.all([f.service.sweep("owner-uid"), replica.sweep("owner-uid"), f.service.sweep("owner-uid")]);
    expect(f.provider.send).toHaveBeenCalledTimes(1); expect(f.memory.rows.deliveries).toHaveLength(1);
    expect(f.memory.rows.deliveries[0].state).toBe("accepted");
    await expect(f.memory.api.insert("deliveries", { ...f.memory.rows.deliveries[0], id: undefined })).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });
  it("canceled appointments and orphan/wrong task UID never send", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    await f.service.saveSubscription(claims, 1, { enabled: true, confirmedConsent: true, canceled: true });
    await f.service.sweep("owner-uid"); await f.service.sweep("other-owner"); await f.service.sweep(""); expect(f.provider.send).not.toHaveBeenCalled();
  });
  it.each(["canceled", "rescheduled", "location", "phone", "disabled"])("revalidates %s after reservation and before provider POST", async scenario => {
    const f = fixture(); await f.configure(); await f.consent();
    f.memory.beforeReservationCommit = () => {
      if (scenario === "canceled") f.memory.rows.subscriptions[0].appointmentCanceled = true;
      if (scenario === "rescheduled") f.changeDraft({ scheduledPickup: new Date(appointment + 3600000).toISOString() });
      if (scenario === "location") f.memory.rows.locations[0].address = "456 Changed Street";
      if (scenario === "phone") f.changeDraft({ mobile: "2025550199" });
      if (scenario === "disabled") f.memory.rows.config[0].enabled = false;
    };
    await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
    expect(f.memory.rows.deliveries[0]).toMatchObject({ state: "skipped", errorCode: "stale_or_canceled" });
  });
  it("rescheduling recomputes the appointment key and correct body at the new slot", async () => {
    const f = fixture(); await f.configure(); await f.consent(); await f.service.sweep("owner-uid");
    const oldKey = f.memory.rows.deliveries[0].appointmentKey;
    f.changeDraft({ scheduledPickup: new Date(appointment + 3600000).toISOString() });
    await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledTimes(1);
    f.setNow(appointment + 3600000 - 86400000); await f.service.sweep("owner-uid");
    expect(f.memory.rows.deliveries[1].appointmentKey).not.toBe(oldKey); expect(f.provider.send.mock.calls[1][2]).toContain("11:00 AM EST");
    expect(reminderAppointmentKey(appointment, { ...location, timezone: "America/Chicago" })).not.toBe(oldKey);
  });
  it("timeout/unknown provider result is uncertain and never retried", async () => {
    const f = fixture(); await f.configure(); await f.consent(); f.provider.send.mockRejectedValue(new Error("PII raw provider timeout"));
    expect(await f.service.sweep("owner-uid")).toMatchObject({ uncertain: 1 });
    await f.service.sweep("owner-uid"); expect(f.provider.send).toHaveBeenCalledTimes(1);
    expect(f.memory.rows.deliveries[0]).toMatchObject({ state: "uncertain", errorCode: "provider_uncertain" });
    expect(JSON.stringify(await f.service.get(admin, 1))).not.toContain("PII raw");
  });
  it("nonretry provider rejection is labeled failed and is never reissued", async () => {
    const f = fixture(); await f.configure(); await f.consent(); f.provider.send.mockRejectedValue(new RentalReminderProviderError("provider_rejected"));
    await f.service.sweep("owner-uid"); await f.service.sweep("owner-uid");
    expect(f.memory.rows.deliveries[0]).toMatchObject({ state: "failed", errorCode: "provider_rejected" }); expect(f.provider.send).toHaveBeenCalledTimes(1);
  });
  it("a crash-left pending reservation becomes uncertain after five minutes without resend", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    const dueAt = appointment - 86400000;
    await f.memory.api.insert("deliveries", { rentalId: 1, appointmentKey: reminderAppointmentKey(appointment, location), kind: "24h", state: "pending", aircallNumberId: 0, provider: "textline", textlineDepartmentUuid: department, recipientPhoneHash: reminderPhoneHash("2025550148"), recipientPayload: encryptRental("+12025550148"), messagePayload: encryptRental("private"), appointmentAt: appointment, dueAt, reservationToken: "crashed", createdAt: dueAt - REMINDER_PENDING_TIMEOUT_MS, updatedAt: dueAt - REMINDER_PENDING_TIMEOUT_MS });
    await f.service.sweep("owner-uid"); expect(f.memory.rows.deliveries[0]).toMatchObject({ state: "uncertain", errorCode: "reservation_expired_no_retry" }); expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("Textline department unverified at setup or later prevents sending", async () => {
    const f = fixture(); f.provider.department.mockResolvedValue({ verified: false, name: null, senderPhone: null });
    await expect(f.configure()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(f.memory.rows.config).toHaveLength(0);
    f.provider.department.mockResolvedValue({ verified: true, name: "Customer Service", senderPhone: "+14158494349" }); await f.configure(); await f.consent();
    f.provider.department.mockResolvedValue({ verified: false, name: null, senderPhone: null });
    expect(await f.service.sweep("owner-uid")).toMatchObject({ reason: "textline_department_unverified" }); expect(f.provider.send).not.toHaveBeenCalled(); expect(f.memory.rows.config[0].textlineDepartmentVerified).toBe(false);
  });
  it("token/credentials/Heartbeat owner are mandatory to enable", async () => {
    for (const patch of [{ textlineWebhooksConfirmed: false }, { scheduleCronTaskUid: null }, { textlineDepartmentUuid: null }]) {
      const f = fixture(); await expect(f.service.saveConfig(admin, { enabled: true, textlineDepartmentUuid: department, textlineWebhooksConfirmed: true, scheduleCronTaskUid: "owner-uid", ...patch })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
  });
  it("caps encrypted record scans at 100 and rotates candidates", async () => {
    const f = fixture(); await f.configure();
    for (let id = 1; id <= 101; id++) {
      if (id > 1) f.memory.rows.records.push({ ...f.memory.rows.records[0], id });
      await f.consent(id);
    }
    const first = await f.service.sweep("owner-uid"); expect(first.examined).toBe(100); expect(f.memory.rows.deliveries).toHaveLength(100);
    await f.service.sweep("owner-uid"); expect(f.memory.rows.deliveries).toHaveLength(101);
  });
});

describe("authenticated native Textline opt-out webhooks", () => {
  it.each(["STOP", "cancel", " END ", "QUIT", "UNSUBSCRIBE", "STOPALL"])("%s suppresses globally across rentals and START does not re-enable", async keyword => {
    const f = fixture(); await f.configure(); await f.consent();
    f.memory.rows.records.push({ ...f.memory.rows.records[0], id: 2 }); await f.consent(2);
    const before = structuredClone(f.memory.rows.records);
    expect(await f.service.processProviderEvent(f.event(keyword), token)).toEqual({ processed: true, action: "suppressed" });
    expect(f.memory.rows.suppressions).toHaveLength(1); expect(f.memory.rows.suppressions[0].phoneHash).toBe(reminderPhoneHash("2025550148"));
    expect(f.memory.rows.subscriptions.every(s => !s.enabled)).toBe(true); expect(f.memory.rows.records).toEqual(before);
    await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
    await expect(f.consent()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await f.service.processProviderEvent(f.event("START"), token)).toEqual({ processed: false });
    await f.service.processProviderEvent(f.event("STOP"), token); expect(f.memory.rows.suppressions).toHaveLength(1);
  });
  it("wrong capability, department, whisper or channel cannot opt out; body.token is never authentication", async () => {
    const f = fixture(); await f.configure();
    for (const presented of [undefined, "wrong", "x".repeat(257)]) await expect(f.service.processProviderEvent({ ...f.event("STOP"), token }, presented)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const good = f.event("STOP");
    for (const patch of [{ group: { uuid: customerUuid } }, { post: { ...good.post, is_whisper: true } }, { post: { ...good.post, message_type: "webchat" } }, { conversation: { ...good.conversation, customer: { uuid: customerUuid, phone_number: "+442025550148" } } }, { post: { ...good.post, conversation_uuid: customerUuid } }]) expect(await f.service.processProviderEvent(f.event("STOP", patch), token)).toEqual({ processed: false });
    expect(await f.service.processProviderEvent(good, token, "customer_updated")).toEqual({ processed: false });
    expect(f.memory.rows.suppressions).toHaveLength(0);
    vi.stubEnv("TEXTLINE_WEBHOOK_SECRET", "");
    await expect(f.service.processProviderEvent(good, token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it.each([{ blocked: true }, { reachable_by_sms: false }, { consent_status: false }, { archived: true }])("native CustomerUpdated %j suppresses account-wide without inventing a department field", async patch => {
    const f = fixture(); await f.configure(); await f.consent();
    const customer = { uuid: customerUuid, phone_number: "(202) 555-0148", blocked: false, reachable_by_sms: true, ...patch };
    expect(await f.service.processProviderEvent({ webhook: "customer_updated", customer }, token)).toEqual({ processed: true, action: "suppressed" });
    expect(f.memory.rows.subscriptions[0].enabled).toBe(false);
    expect(await f.service.processProviderEvent({ webhook: "customer_updated", customer: { ...customer, blocked: false, archived: false, reachable_by_sms: true, consent_status: true } }, token)).toEqual({ processed: false });
    await expect(f.consent()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("does not invent delivery statuses from outbound post or old Aircall events", async () => {
    const f = fixture(); await f.configure(); await f.consent(); await f.service.sweep("owner-uid");
    const before = structuredClone(f.memory.rows.records), subscriptions = structuredClone(f.memory.rows.subscriptions);
    for (const webhook of ["new_outbound_post", "message.status_updated", "conversation_status_change"]) expect(await f.service.processProviderEvent({ ...f.event("hello"), webhook, data: { id: "sms-123", status: "delivered" } }, token)).toEqual({ processed: false });
    expect(f.memory.rows.deliveries[0].state).toBe("accepted"); expect(f.memory.rows.records).toEqual(before); expect(f.memory.rows.subscriptions).toEqual(subscriptions);
  });
  it("secret rotation blocks readiness and webhook processing until admin confirms new callback setup", async () => {
    const f = fixture(); await f.configure(); await f.consent();
    vi.stubEnv("TEXTLINE_WEBHOOK_SECRET", "rotated-textline-secret-capability-0123456789");
    expect(await f.service.configStatus(admin)).toMatchObject({ ready: false, webhookConfigured: false });
    await expect(f.service.processProviderEvent(f.event("STOP"), token)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
  });
  it("missing/weak secret or credentials cannot be overridden by admin webhook confirmation", async () => {
    for (const secret of ["", "short-secret", "unsafe/secret".repeat(5)]) {
      const f = fixture(); vi.stubEnv("TEXTLINE_WEBHOOK_SECRET", secret);
      await expect(f.configure()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); expect(f.memory.rows.config).toHaveLength(0);
    }
    vi.stubEnv("TEXTLINE_WEBHOOK_SECRET", token);
    const f = fixture(); f.provider.configured = () => false;
    await expect(f.configure()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("legacy Aircall approval/token/number cannot activate Textline or escape status", async () => {
    const f = fixture();
    f.memory.rows.config.push({ id: 1, enabled: true, aircallNumberId: 1128372, carrierApproved: true, webhookTokenPayload: encryptRental({ token }), scheduleCronTaskUid: "owner-uid", textlineDepartmentUuid: null, textlineDepartmentVerified: false, textlineDepartmentName: null, textlineSenderPhone: null, textlineWebhooksConfirmed: false, textlineWebhookSecretHash: null, lastRunAt: null, lastError: null });
    expect(await f.service.configStatus(admin)).toMatchObject({ provider: "textline", ready: false });
    expect(JSON.stringify(await f.service.configStatus(admin))).not.toMatch(/1128372|aircall|carrierApproved|webhookTokenPayload/i);
    await f.consent(); await f.service.sweep("owner-uid"); expect(f.provider.send).not.toHaveBeenCalled();
  });
});
