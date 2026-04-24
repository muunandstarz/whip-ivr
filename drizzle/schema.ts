import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  float,
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

// Claims team handlers
export const handlers = mysqlTable("handlers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }),
  role: varchar("role", { length: 64 }), // e.g. "Claim Handler", "Claim Processor"
  aircallUserId: int("aircallUserId"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Handler = typeof handlers.$inferSelect;
export type InsertHandler = typeof handlers.$inferInsert;

// AI-processed intake records from voicemails
export const intakeRecords = mysqlTable("intake_records", {
  id: int("id").autoincrement().primaryKey(),
  aircallCallId: varchar("aircallCallId", { length: 64 }),
  callerPhone: varchar("callerPhone", { length: 32 }),
  callerName: varchar("callerName", { length: 256 }),
  callerOrg: varchar("callerOrg", { length: 256 }),
  callerType: mysqlEnum("callerType", [
    "carrier",
    "law_office",
    "medical_provider",
    "member",
    "claimant",
    "police",
    "unknown",
  ]).default("unknown"),
  whipClaimNumber: varchar("whipClaimNumber", { length: 128 }),
  callerRefNumber: varchar("callerRefNumber", { length: 128 }),
  callbackPhone: varchar("callbackPhone", { length: 32 }),
  callbackEmail: varchar("callbackEmail", { length: 320 }),
  message: text("message"),
  rawTranscript: text("rawTranscript"),
  handlerId: int("handlerId"),
  handlerName: varchar("handlerName", { length: 128 }),
  status: mysqlEnum("status", ["open", "closed", "escalated"]).default("open").notNull(),
  isRepeatCaller: boolean("isRepeatCaller").default(false).notNull(),
  repeatCallCount: int("repeatCallCount").default(0).notNull(),
  priority: mysqlEnum("priority", ["normal", "high", "urgent"]).default("normal").notNull(),
  source: mysqlEnum("source", ["voicemail", "manual", "live_call"]).default("voicemail").notNull(),
  aircallRecordingUrl: text("aircallRecordingUrl"),
  notes: text("notes"),
  // Claim number matching
  claimMatchType: varchar("claimMatchType", { length: 32 }), // exact | vin_fragment | claim_fragment | partial | none
  claimMatchConfidence: int("claimMatchConfidence"), // 0-100
  snapsheetClaimUrl: text("snapsheetClaimUrl"), // direct link to Snapsheet claim
  // Callback QA tracking
  callbackDueBy: timestamp("callbackDueBy"), // EOB of day voicemail received (5pm local)
  callbackAt: timestamp("callbackAt"),       // when handler actually called back
  callbackHandlerName: varchar("callbackHandlerName", { length: 128 }), // who made the callback
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IntakeRecord = typeof intakeRecords.$inferSelect;
export type InsertIntakeRecord = typeof intakeRecords.$inferInsert;

// Full call history synced from Aircall API
export const callHistory = mysqlTable("call_history", {
  id: int("id").autoincrement().primaryKey(),
  aircallCallId: varchar("aircallCallId", { length: 64 }).notNull().unique(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  status: mysqlEnum("status", [
    "answered",
    "missed",
    "voicemail",
    "transferred",
    "abandoned",
  ]).notNull(),
  callerPhone: varchar("callerPhone", { length: 32 }),
  callerName: varchar("callerName", { length: 256 }),
  aircallNumberId: int("aircallNumberId"),
  aircallNumberName: varchar("aircallNumberName", { length: 128 }),
  agentId: int("agentId"),
  agentName: varchar("agentName", { length: 128 }),
  handlerId: int("handlerId"),
  durationSeconds: int("durationSeconds").default(0),
  waitTimeSeconds: int("waitTimeSeconds").default(0),
  recordingUrl: text("recordingUrl"),
  voicemailUrl: text("voicemailUrl"),
  hasIntakeRecord: boolean("hasIntakeRecord").default(false),
  intakeRecordId: int("intakeRecordId"),
  callerType: varchar("callerType", { length: 50 }),
  startedAt: timestamp("startedAt").notNull(),
  endedAt: timestamp("endedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallHistory = typeof callHistory.$inferSelect;
export type InsertCallHistory = typeof callHistory.$inferInsert;

// Weekly AI QA scores per call/agent
export const qaScores = mysqlTable("qa_scores", {
  id: int("id").autoincrement().primaryKey(),
  callHistoryId: int("callHistoryId").notNull(),
  aircallCallId: varchar("aircallCallId", { length: 64 }).notNull(),
  agentId: int("agentId"),
  agentName: varchar("agentName", { length: 128 }),
  handlerId: int("handlerId"),
  weekOf: timestamp("weekOf").notNull(),
  transcript: text("transcript"),
  // Scores 1-10
  greetingScore: float("greetingScore"),
  holdManagementScore: float("holdManagementScore"),
  resolutionScore: float("resolutionScore"),
  empathyScore: float("empathyScore"),
  callControlScore: float("callControlScore"),
  overallScore: float("overallScore"),
  improvementNotes: text("improvementNotes"),
  strengths: text("strengths"),
  rawAiResponse: text("rawAiResponse"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QaScore = typeof qaScores.$inferSelect;
export type InsertQaScore = typeof qaScores.$inferInsert;

// Repeat caller tracking
export const callerProfiles = mysqlTable("caller_profiles", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 256 }),
  org: varchar("org", { length: 256 }),
  callerType: mysqlEnum("callerType", [
    "carrier",
    "law_office",
    "medical_provider",
    "member",
    "claimant",
    "police",
    "unknown",
  ]).default("unknown"),
  totalCalls: int("totalCalls").default(1).notNull(),
  lastCallAt: timestamp("lastCallAt").defaultNow().notNull(),
  claimNumbers: text("claimNumbers"), // JSON array of claim numbers seen
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallerProfile = typeof callerProfiles.$inferSelect;
export type InsertCallerProfile = typeof callerProfiles.$inferInsert;

// Manager-pushed QA scorecards per handler per week
export const qaScorecards = mysqlTable("qa_scorecards", {
  id: int("id").autoincrement().primaryKey(),
  handlerId: int("handlerId").notNull(),
  handlerName: varchar("handlerName", { length: 128 }).notNull(),
  weekOf: varchar("weekOf", { length: 16 }).notNull(), // ISO date string e.g. "2026-04-21"
  // Scores 1-10
  greetingScore: float("greetingScore"),
  holdManagementScore: float("holdManagementScore"),
  resolutionScore: float("resolutionScore"),
  empathyScore: float("empathyScore"),
  callControlScore: float("callControlScore"),
  overallScore: float("overallScore"),
  strengths: text("strengths"),
  improvements: text("improvements"),
  managerComments: text("managerComments"),
  submittedBy: varchar("submittedBy", { length: 128 }), // manager name
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QaScorecard = typeof qaScorecards.$inferSelect;
export type InsertQaScorecard = typeof qaScorecards.$inferInsert;
