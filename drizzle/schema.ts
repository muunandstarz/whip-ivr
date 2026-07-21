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
  handlerProfileId: int("handlerProfileId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  onboardingSeenAt: timestamp("onboardingSeenAt"),
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
  aircallCallId: varchar("aircallCallId", { length: 64 }).unique(),
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
  routingMethod: mysqlEnum("routingMethod", ["ivr", "extension", "manual"]).default("ivr"),
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
  // Labels: JSON array of strings e.g. ['after_hours', 'direct_voicemail', 'weekend']
  labels: text("labels").default("[]"), // JSON string array
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
  callerOrg: varchar("callerOrg", { length: 256 }),
  whipClaimNumber: varchar("whipClaimNumber", { length: 64 }),
  rawTranscript: text("rawTranscript"),
  callSummary: text("callSummary"),
  classifiedByAI: boolean("classifiedByAI").default(false),
  ivrEligible: boolean("ivrEligible").default(false),
  startedAt: timestamp("startedAt").notNull(),
  endedAt: timestamp("endedAt"),
  lossIntakeClaimId: int("lossIntakeClaimId"),
  matchConfidence: float("matchConfidence"),
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

// ─── Callback Logs ────────────────────────────────────────────────────────────
export const callbackLogs = mysqlTable("callback_logs", {
  id: int("id").autoincrement().primaryKey(),
  intakeId: int("intakeId").notNull(),
  handlerName: varchar("handlerName", { length: 128 }),
  calledAt: timestamp("calledAt").defaultNow(),
  disposition: mysqlEnum("disposition", ["reached", "no_answer", "left_voicemail", "wrong_number", "busy", "emailed", "sent_sms"]).notNull(),
  notes: text("notes"),
  outcome: mysqlEnum("outcome", ["resolved", "escalated", "follow_up", "closed"]).default("follow_up"),
});
export type CallbackLog = typeof callbackLogs.$inferSelect;
export type InsertCallbackLog = typeof callbackLogs.$inferInsert;

// ─── Pre-Authorizations ───────────────────────────────────────────────────────
export const preAuthorizations = mysqlTable("pre_authorizations", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: mysqlEnum("role", ["admin", "user"]).notNull().default("user"),
  handlerProfileId: int("handlerProfileId"),
  addedBy: varchar("addedBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PreAuthorization = typeof preAuthorizations.$inferSelect;
export type InsertPreAuthorization = typeof preAuthorizations.$inferInsert;

// ─── Call Scripts (editable by admins in Settings) ────────────────────────────
export const callScripts = mysqlTable("call_scripts", {
  id: int("id").autoincrement().primaryKey(),
  callerType: varchar("callerType", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 128 }).notNull(),
  script: text("script").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: varchar("updatedBy", { length: 255 }),
});
export type CallScript = typeof callScripts.$inferSelect;
export type InsertCallScript = typeof callScripts.$inferInsert;

// ─── Error Reports ────────────────────────────────────────────────────────────
export const errorReports = mysqlTable("error_reports", {
  id: int("id").autoincrement().primaryKey(),
  message: text("message").notNull(),
  stack: text("stack"),
  url: varchar("url", { length: 1024 }),
  route: varchar("route", { length: 512 }),
  userAgent: varchar("userAgent", { length: 512 }),
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  userEmail: varchar("userEmail", { length: 320 }),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: varchar("resolvedBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ErrorReport = typeof errorReports.$inferSelect;
export type InsertErrorReport = typeof errorReports.$inferInsert;

// ─── Saved Report Presets ─────────────────────────────────────────────────────
export const savedReports = mysqlTable("saved_reports", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 512 }),
  config: json("config").notNull(), // ReportConfig JSON
  createdBy: varchar("createdBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SavedReport = typeof savedReports.$inferSelect;
export type InsertSavedReport = typeof savedReports.$inferInsert;

// ─── Loss Intake Monitoring ───────────────────────────────────────────────────
export const lossIntakeClaims = mysqlTable("loss_intake_claims", {
  id: int("id").autoincrement().primaryKey(),
  slackKey: varchar("slackKey", { length: 128 }).notNull().unique(),
  channelId: varchar("channelId", { length: 32 }).notNull(),
  channelName: varchar("channelName", { length: 128 }).notNull(),
  slackMessageTs: varchar("slackMessageTs", { length: 32 }).notNull(),
  slackPermalink: text("slackPermalink"),
  postedAt: timestamp("postedAt").notNull(),
  memberName: varchar("memberName", { length: 255 }),
  customerId: varchar("customerId", { length: 128 }),
  vinLastSix: varchar("vinLastSix", { length: 16 }),
  market: varchar("market", { length: 128 }),
  vehicleType: mysqlEnum("vehicleType", ["gas", "ev_tesla", "unknown"]).default("unknown").notNull(),
  assignedHandlerId: int("assignedHandlerId"),
  assignedAgent: varchar("assignedAgent", { length: 128 }),
  stage: mysqlEnum("stage", ["awaiting_outreach", "outreach_started", "contact_attempts", "complete"]).default("awaiting_outreach").notNull(),
  hasPhotos: boolean("hasPhotos").default(false).notNull(),
  attachmentCount: int("attachmentCount").default(0).notNull(),
  firstContactAt: timestamp("firstContactAt"),
  firstContactMinutes: float("firstContactMinutes"),
  slaState: mysqlEnum("slaState", ["within_sla", "at_risk", "breached"]).default("within_sla").notNull(),
  slaType: varchar("slaType", { length: 20 }).default("immediate").notNull(),
  slaDeadlineAt: timestamp("slaDeadlineAt"),
  completedAt: timestamp("completedAt"),
  intakeCycleMinutes: float("intakeCycleMinutes"),
  factsOfLoss: text("factsOfLoss"),
  preliminaryLiability: text("preliminaryLiability"),
  rideshareStatus: varchar("rideshareStatus", { length: 255 }),
  noAnswerAttempts: int("noAnswerAttempts").default(0).notNull(),
  contactAttempts: int("contactAttempts").default(0).notNull(),
  dateOfLoss: varchar("dateOfLoss", { length: 64 }),
  templatePostedAt: timestamp("templatePostedAt"),
  templatePostMinutesFromContact: float("templatePostMinutesFromContact"),
  templatePostMinutesFromReport: float("templatePostMinutesFromReport"),
  storeTeamTagged: boolean("storeTeamTagged").default(false).notNull(),
  folQualityScore: float("folQualityScore"),
  teslaFootageRequested: boolean("teslaFootageRequested"),
  qualityScore: float("qualityScore"),
  missingElements: text("missingElements"),
  lastSyncedAt: timestamp("lastSyncedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LossIntakeClaim = typeof lossIntakeClaims.$inferSelect;
export type InsertLossIntakeClaim = typeof lossIntakeClaims.$inferInsert;

export const lossIntakeEvents = mysqlTable("loss_intake_events", {
  id: int("id").autoincrement().primaryKey(),
  slackEventKey: varchar("slackEventKey", { length: 128 }).notNull().unique(),
  claimId: int("claimId").notNull(),
  slackEventTs: varchar("slackEventTs", { length: 32 }).notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  actorSlackUserId: varchar("actorSlackUserId", { length: 32 }),
  actorName: varchar("actorName", { length: 128 }),
  eventType: mysqlEnum("eventType", ["posted", "acknowledgment", "contact_attempt", "completion", "other"]).notNull(),
  body: text("body"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LossIntakeEvent = typeof lossIntakeEvents.$inferSelect;
export type InsertLossIntakeEvent = typeof lossIntakeEvents.$inferInsert;

export const lossIntakeQualityItems = mysqlTable("loss_intake_quality_items", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claimId").notNull(),
  criterion: varchar("criterion", { length: 64 }).notNull(),
  result: mysqlEnum("result", ["pass", "fail", "not_applicable"]).notNull(),
  points: float("points").default(0).notNull(),
  maxPoints: float("maxPoints").default(0).notNull(),
  evidence: text("evidence"),
  sourceEventId: int("sourceEventId"),
  coachingNote: text("coachingNote"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LossIntakeQualityItem = typeof lossIntakeQualityItems.$inferSelect;
export type InsertLossIntakeQualityItem = typeof lossIntakeQualityItems.$inferInsert;

export const lossIntakeQas = mysqlTable("loss_intake_qas", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claimId").notNull(),
  handlerId: int("handlerId").notNull(),
  handlerName: varchar("handlerName", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["draft", "reviewed", "sent", "opened", "acknowledged", "resolved"]).default("draft").notNull(),
  overallScore: float("overallScore"),
  strengths: text("strengths"),
  coachingOpportunities: text("coachingOpportunities"),
  managerComments: text("managerComments"),
  repResponse: text("repResponse"),
  createdBy: varchar("createdBy", { length: 255 }),
  draftedAt: timestamp("draftedAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
  sentAt: timestamp("sentAt"),
  openedAt: timestamp("openedAt"),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedAt: timestamp("resolvedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LossIntakeQa = typeof lossIntakeQas.$inferSelect;
export type InsertLossIntakeQa = typeof lossIntakeQas.$inferInsert;

export const lossIntakeSettings = mysqlTable("loss_intake_settings", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("configKey", { length: 64 }).notNull().unique(),
  claimsChannelId: varchar("claimsChannelId", { length: 32 }).default("CHWRXH4HK").notNull(),
  remoteMarketsChannelId: varchar("remoteMarketsChannelId", { length: 32 }).default("C092UPKR79D").notNull(),
  firstContactSlaMinutes: int("firstContactSlaMinutes").default(10).notNull(),
  atRiskMinutes: int("atRiskMinutes").default(7).notNull(),
  qaDueHours: int("qaDueHours").default(24).notNull(),
  scoringWeights: json("scoringWeights"),
  agentAssignments: json("agentAssignments"),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastSuccessfulSyncAt: timestamp("lastSuccessfulSyncAt"),
  lastSyncError: text("lastSyncError"),
  updatedBy: varchar("updatedBy", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LossIntakeSetting = typeof lossIntakeSettings.$inferSelect;
export type InsertLossIntakeSetting = typeof lossIntakeSettings.$inferInsert;

// ─── Loss Intake Call QA ─────────────────────────────────────────────────────
export const lossIntakeCallQas = mysqlTable("loss_intake_call_qas", {
  id: int("id").autoincrement().primaryKey(),
  lossIntakeClaimId: int("lossIntakeClaimId").notNull(),
  callHistoryId: int("callHistoryId").notNull(),
  aircallCallId: varchar("aircallCallId", { length: 64 }).notNull(),
  agentName: varchar("agentName", { length: 128 }),
  callDirection: mysqlEnum("callDirection", ["inbound", "outbound"]).default("outbound"),
  callStatus: varchar("callStatus", { length: 32 }),
  durationSeconds: int("durationSeconds").default(0),
  recordingUrl: text("recordingUrl"),
  transcript: text("transcript"),
  // AI QA Scores (1-10)
  greetingScore: float("greetingScore"),
  folDocumentedScore: float("folDocumentedScore"),
  rideshareAskedScore: float("rideshareAskedScore"),
  professionalCloseScore: float("professionalCloseScore"),
  empathyScore: float("empathyScore"),
  overallScore: float("overallScore"),
  strengths: text("strengths"),
  improvements: text("improvements"),
  rawAiResponse: text("rawAiResponse"),
  scoredAt: timestamp("scoredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LossIntakeCallQa = typeof lossIntakeCallQas.$inferSelect;
export type InsertLossIntakeCallQa = typeof lossIntakeCallQas.$inferInsert;

export const lossIntakeSyncRuns = mysqlTable("loss_intake_sync_runs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["running", "success", "failed"]).default("running").notNull(),
  claimsDiscovered: int("claimsDiscovered").default(0).notNull(),
  claimsUpdated: int("claimsUpdated").default(0).notNull(),
  eventsProcessed: int("eventsProcessed").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type LossIntakeSyncRun = typeof lossIntakeSyncRuns.$inferSelect;
export type InsertLossIntakeSyncRun = typeof lossIntakeSyncRuns.$inferInsert;
