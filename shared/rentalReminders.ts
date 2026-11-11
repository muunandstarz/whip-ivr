import { z } from "zod";
import type { RentalLocation } from "./rentalHandoff";

/** Reminder metadata is intentionally NOT part of RentalDraft or signed packets. */
export const REMINDER_KINDS = ["24h", "2h"] as const;
export type RentalReminderKind = typeof REMINDER_KINDS[number];
export const REMINDER_STATES = ["pending", "accepted", "sent", "delivered", "failed", "uncertain", "skipped"] as const;
export type RentalReminderState = typeof REMINDER_STATES[number];
// Platform dispatch can be several minutes late. Keep the intended due time,
// tolerate bounded scheduling jitter, and never send an old-window backlog.
export const REMINDER_DUE_WINDOW_MS = 15 * 60_000;
export const REMINDER_PENDING_TIMEOUT_MS = 5 * 60_000;
export const REMINDER_BATCH_LIMIT = 100;

export const rentalReminderConfigSchema = z.object({
  enabled: z.boolean(),
  textlineDepartmentUuid: z.string().uuid().nullable(),
  // A manual webhook setup acknowledgement cannot override missing server secrets.
  textlineWebhooksConfirmed: z.boolean(),
  scheduleCronTaskUid: z.string().trim().min(1).max(65).nullable(),
}).strict();
export type RentalReminderConfigInput = z.infer<typeof rentalReminderConfigSchema>;
export const rentalReminderSubscriptionSchema = z.object({
  enabled: z.boolean(), confirmedConsent: z.boolean(), canceled: z.boolean(),
}).strict();
export type RentalReminderSubscriptionInput = z.infer<typeof rentalReminderSubscriptionSchema>;
export type RentalReminderConfigStatus = {
  enabled: boolean; textlineDepartmentUuid: string | null; textlineDepartmentVerified: boolean;
  textlineDepartmentName: string | null; textlineSenderPhone: string | null; textlineWebhooksConfirmed: boolean;
  scheduleCronTaskUid: string | null; lastRunAt: number | null; lastError: string | null;
  provider: "textline"; credentialsConfigured: boolean; webhookConfigured: boolean;
  ready: boolean; blockers: string[];
  senderNotice: string;
};
export type RentalReminderSlot = {
  kind: RentalReminderKind; appointmentAt: number; dueAt: number;
  sameLocalDay: boolean; due: boolean; expired: boolean;
};

/** Accept only NANP digits and conventional punctuation; never extensions or other countries. */
export function normalizeReminderPhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^[+\d\s().-]+$/.test(value.trim())) return null;
  const input = value.trim();
  if (input.includes("+") && !/^\+1[\d\s().-]+$/.test(input)) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : null;
}
function localDay(at: number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
/** Stored appointments must be absolute ISO timestamps, not ambiguous browser-local wall times. */
export function reminderAppointmentAt(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}
export function rentalReminderSlots(scheduledPickup: string, timezone: string, now: number): RentalReminderSlot[] {
  const appointmentAt = reminderAppointmentAt(scheduledPickup);
  if (appointmentAt === null) return [];
  try {
    return REMINDER_KINDS.map(kind => {
      // Elapsed time, not "same time yesterday": DST does not change the 24-hour offset.
      const dueAt = appointmentAt - (kind === "24h" ? 24 : 2) * 3_600_000;
      const sameLocalDay = localDay(dueAt, timezone) === localDay(appointmentAt, timezone);
      const allowed = kind === "24h" || sameLocalDay;
      return { kind, appointmentAt, dueAt, sameLocalDay, due: allowed && now >= dueAt && now < dueAt + REMINDER_DUE_WINDOW_MS && now < appointmentAt, expired: now >= dueAt + REMINDER_DUE_WINDOW_MS || !allowed };
    });
  } catch { return []; } // Invalid location timezone fails closed; no invented timezone.
}
export function rentalReminderBody(appointmentAt: number, location: RentalLocation): string {
  const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!location.active || !clean(location.name) || !clean(location.address) || !normalizeReminderPhone(location.phone)) throw new Error("reminder_location_incomplete");
  const date = new Intl.DateTimeFormat("en-US", { timeZone: location.timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(appointmentAt);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: location.timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(appointmentAt);
  const body = `MetroCars / Total Recon reminder: Your appointment is ${date} at ${time} (${location.timezone}). Drop off your own vehicle for repairs and pick up your rental at ${clean(location.name)}, ${clean(location.address)}. Questions? Call ${clean(location.phone)}. Reply STOP to opt out.`;
  if (body.length > 1600) throw new Error("reminder_body_too_long");
  return body;
}
