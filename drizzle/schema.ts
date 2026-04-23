import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Intake records created by AI IVR sessions or manual entry
export const intakeRecords = mysqlTable("intake_records", {
  id: int("id").autoincrement().primaryKey(),
  // Call metadata
  callSid: varchar("callSid", { length: 64 }),
  callerPhone: varchar("callerPhone", { length: 32 }),
  callerType: mysqlEnum("callerType", [
    "carrier",
    "law_office",
    "medical_provider",
    "member",
    "claimant",
    "police",
    "wrong_department",
    "unknown",
  ]).notNull().default("unknown"),
  // Collected intake fields
  callerName: varchar("callerName", { length: 256 }),
  organization: varchar("organization", { length: 256 }),
  whipClaimNumber: varchar("whipClaimNumber", { length: 128 }),
  callerReferenceNumber: varchar("callerReferenceNumber", { length: 128 }),
  callPurpose: varchar("callPurpose", { length: 512 }),
  message: text("message"),
  callbackPhone: varchar("callbackPhone", { length: 32 }),
  callbackEmail: varchar("callbackEmail", { length: 320 }),
  assignedHandler: varchar("assignedHandler", { length: 256 }),
  // Status
  status: mysqlEnum("status", ["open", "closed"]).notNull().default("open"),
  // Transcript of the AI conversation
  transcript: text("transcript"),
  // Source of the record
  source: mysqlEnum("source", ["ai_ivr", "voicemail", "manual"]).notNull().default("ai_ivr"),
  // Notification sent
  notificationSent: int("notificationSent").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IntakeRecord = typeof intakeRecords.$inferSelect;
export type InsertIntakeRecord = typeof intakeRecords.$inferInsert;

// Active call sessions for tracking ongoing AI conversations
export const callSessions = mysqlTable("call_sessions", {
  id: int("id").autoincrement().primaryKey(),
  callSid: varchar("callSid", { length: 64 }).notNull().unique(),
  callerPhone: varchar("callerPhone", { length: 32 }),
  state: varchar("state", { length: 64 }).notNull().default("greeting"),
  // JSON blob of collected data so far
  collectedData: json("collectedData"),
  conversationHistory: json("conversationHistory"),
  callerType: mysqlEnum("callerType", [
    "carrier",
    "law_office",
    "medical_provider",
    "member",
    "claimant",
    "police",
    "wrong_department",
    "unknown",
  ]).default("unknown"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallSession = typeof callSessions.$inferSelect;
export type InsertCallSession = typeof callSessions.$inferInsert;
