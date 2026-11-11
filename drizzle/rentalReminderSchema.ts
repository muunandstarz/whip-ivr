import { bigint, boolean, index, int, mysqlEnum, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { REMINDER_KINDS, REMINDER_STATES } from "../shared/rentalReminders";

/** Singleton id=1. Main integration owns schema exports and migration; importing does not create rows. */
export const rentalReminderConfig = mysqlTable("rental_reminder_config", {
  id: int().primaryKey().default(1),
  enabled: boolean().notNull().default(false),
  aircallNumberId: int().notNull().default(0),
  carrierApproved: boolean().notNull().default(false),
  textlineDepartmentUuid: varchar({ length: 36 }),
  textlineDepartmentVerified: boolean().notNull().default(false),
  textlineDepartmentName: varchar({ length: 160 }),
  textlineSenderPhone: varchar({ length: 20 }),
  textlineWebhooksConfirmed: boolean().notNull().default(false),
  textlineAccessTokenPayload: text(),
  textlineWebhookCapabilityPayload: text(),
  textlineWebhookSecretPayload: text(),
  // Binds manual setup acknowledgement to the current server-only capability.
  textlineWebhookSecretHash: varchar({ length: 64 }),
  scheduleCronTaskUid: varchar({ length: 65 }),
  // Legacy Aircall ciphertext retained for data compatibility, never read or exposed.
  webhookTokenPayload: text(),
  lastRunAt: bigint({ mode: "number" }),
  lastError: varchar({ length: 80 }),
  updatedAt: bigint({ mode: "number" }).notNull().default(0),
}, t => [index("rental_reminder_cron_idx").on(t.scheduleCronTaskUid)]);

export const rentalReminderSubscriptions = mysqlTable("rental_reminder_subscriptions", {
  id: int().autoincrement().primaryKey(),
  rentalId: int().notNull().unique(),
  enabled: boolean().notNull().default(false),
  consentAt: bigint({ mode: "number" }),
  consentBy: varchar({ length: 100 }),
  consentPhoneHash: varchar({ length: 64 }),
  appointmentCanceled: boolean().notNull().default(false),
  // Rotating bounded scan: prevents low-ID, not-yet-due records starving other appointments.
  lastEvaluatedAt: bigint({ mode: "number" }).notNull().default(0),
  updatedAt: bigint({ mode: "number" }).notNull(),
}, t => [index("rental_reminder_scan_idx").on(t.enabled, t.lastEvaluatedAt)]);

export const rentalReminderSuppressions = mysqlTable("rental_reminder_suppressions", {
  id: int().autoincrement().primaryKey(),
  phoneHash: varchar({ length: 64 }).notNull().unique(),
  reason: varchar({ length: 16 }).notNull().default("STOP"),
  createdAt: bigint({ mode: "number" }).notNull(),
});

export const rentalReminderDeliveries = mysqlTable("rental_reminder_deliveries", {
  id: int().autoincrement().primaryKey(), rentalId: int().notNull(),
  appointmentKey: varchar({ length: 64 }).notNull(),
  kind: mysqlEnum(REMINDER_KINDS).notNull(),
  state: mysqlEnum(REMINDER_STATES).notNull().default("pending"),
  aircallNumberId: int().notNull().default(0),
  // Nullable provider identifies historical Aircall rows; new rows always textline.
  provider: varchar({ length: 24 }),
  textlineDepartmentUuid: varchar({ length: 36 }),
  textlineConversationUuid: varchar({ length: 36 }),
  textlineCustomerUuid: varchar({ length: 36 }),
  recipientPhoneHash: varchar({ length: 64 }).notNull(),
  recipientPayload: text().notNull(), messagePayload: text().notNull(),
  appointmentAt: bigint({ mode: "number" }).notNull(),
  dueAt: bigint({ mode: "number" }).notNull(),
  reservationToken: varchar({ length: 36 }).notNull(),
  providerId: varchar({ length: 120 }),
  errorCode: varchar({ length: 80 }),
  createdAt: bigint({ mode: "number" }).notNull(),
  dispatchAt: bigint({ mode: "number" }),
  updatedAt: bigint({ mode: "number" }).notNull(),
  providerEventAt: bigint({ mode: "number" }),
}, t => [
  uniqueIndex("rental_reminder_slot_uq").on(t.rentalId, t.appointmentKey, t.kind),
  index("rental_reminder_provider_idx").on(t.providerId, t.aircallNumberId),
  index("rental_reminder_textline_idx").on(t.providerId, t.textlineDepartmentUuid),
  index("rental_reminder_pending_idx").on(t.state, t.createdAt),
]);
