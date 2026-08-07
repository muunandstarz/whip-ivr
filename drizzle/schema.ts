import {
  int,
  bigint,
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
  callSource: mysqlEnum("callSource", ["ring_group", "extension", "outbound"]),
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
  // @claims-intake tag SLA (set when @claims-intake is mentioned in the thread)
  claimsIntakeTaggedAt: bigint("claims_intake_tagged_at", { mode: "number" }),
  claimsIntakeSlaType: varchar("claims_intake_sla_type", { length: 32 }),
  claimsIntakeSlaDeadlineAt: bigint("claims_intake_sla_deadline_at", { mode: "number" }),
  // Duplicate FNOL detection: set when this post is a forwarded copy of an existing claim
  isDuplicate: boolean("is_duplicate").default(false).notNull(),
  originalSlackKey: varchar("original_slack_key", { length: 255 }),
  // Overflow routing: set when both in-store agents are busy and this claim should go to Ana Padilla
  overflowRouted: boolean("overflow_routed").default(false).notNull(),

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

// Remote Ops @claims-intake handoff records
// Created when a Remote Ops rep tags @claims-intake in their Slack channel
export const remoteOpsIntakes = mysqlTable("remote_ops_intakes", {
  id: int("id").autoincrement().primaryKey(),
  slackTs: varchar("slackTs", { length: 64 }).notNull(),          // Slack message timestamp (unique per channel)
  channelId: varchar("channelId", { length: 64 }).notNull(),      // Slack channel ID
  threadTs: varchar("threadTs", { length: 64 }),                  // Thread parent ts if in a thread
  messageText: text("messageText"),                               // Full message text from Slack
  triggeredBySlackId: varchar("triggeredBySlackId", { length: 64 }), // Slack user ID who tagged @claims-intake
  triggeredByName: varchar("triggeredByName", { length: 128 }),   // Display name of the triggering user
  slackPermalink: varchar("slackPermalink", { length: 512 }),     // Deep link to the Slack message
  // SLA
  slaDueAt: timestamp("slaDueAt").notNull(),                      // When the intake must be claimed by
  slaType: mysqlEnum("slaType", ["business_hours", "after_hours"]).notNull(), // Which SLA rule applied
  // Status
  status: mysqlEnum("status", ["pending", "claimed", "complete"]).default("pending").notNull(),
  claimedByHandlerId: int("claimedByHandlerId"),                  // Handler who claimed it
  claimedByName: varchar("claimedByName", { length: 128 }),
  claimedAt: timestamp("claimedAt"),
  completedAt: timestamp("completedAt"),
  // Parsed context from message (AI-extracted if available)
  memberName: varchar("memberName", { length: 256 }),
  customerId: varchar("customerId", { length: 128 }),
  market: varchar("market", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RemoteOpsIntake = typeof remoteOpsIntakes.$inferSelect;
export type InsertRemoteOpsIntake = typeof remoteOpsIntakes.$inferInsert;

// ─── Document Generator: Drafts ───────────────────────────────────────────────
export const docgenDrafts = mysqlTable("docgen_drafts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tabKey: varchar("tabKey", { length: 64 }).notNull(),      // e.g. "release-bi", "tl-settlement"
  tabLabel: varchar("tabLabel", { length: 128 }).notNull(), // Human-readable tab name
  claimNumber: varchar("claimNumber", { length: 64 }),
  formData: json("formData").notNull(),                     // Full form state as JSON
  status: mysqlEnum("status", ["draft", "finalized"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DocgenDraft = typeof docgenDrafts.$inferSelect;
export type InsertDocgenDraft = typeof docgenDrafts.$inferInsert;

// ─── Document Generator: Favorites ────────────────────────────────────────────
export const docgenFavorites = mysqlTable("docgen_favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tabKey: varchar("tabKey", { length: 64 }).notNull(),
  tabLabel: varchar("tabLabel", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DocgenFavorite = typeof docgenFavorites.$inferSelect;

// ─── Document Generator: Recent Documents ─────────────────────────────────────
export const docgenRecentDocs = mysqlTable("docgen_recent_docs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tabKey: varchar("tabKey", { length: 64 }).notNull(),
  tabLabel: varchar("tabLabel", { length: 128 }).notNull(),
  claimNumber: varchar("claimNumber", { length: 64 }),
  documentName: varchar("documentName", { length: 256 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "finalized"]).default("draft").notNull(),
  pdfDataUrl: text("pdfDataUrl"),                           // base64 data URL for preview
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DocgenRecentDoc = typeof docgenRecentDocs.$inferSelect;

// ─── Document Generator: Shared Templates ─────────────────────────────────────
export const docgenSharedTemplates = mysqlTable("docgen_shared_templates", {
  id: int("id").autoincrement().primaryKey(),
  fromUserId: int("fromUserId").notNull(),
  toUserId: int("toUserId").notNull(),
  tabKey: varchar("tabKey", { length: 64 }).notNull(),
  tabLabel: varchar("tabLabel", { length: 128 }).notNull(),
  templateName: varchar("templateName", { length: 256 }).notNull(),
  formData: json("formData").notNull(),
  message: text("message"),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DocgenSharedTemplate = typeof docgenSharedTemplates.$inferSelect;

// ─── Mail / Fax Bot ────────────────────────────────────────────────────────────

/** Global bot configuration (single row, id=1) */
export const mailBotConfig = mysqlTable("mail_bot_config", {
  id: int("id").autoincrement().primaryKey(),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  cronExpression: varchar("cron_expression", { length: 64 }).default("0 0 18 * * 2-5"),
  scheduleEnabled: boolean("schedule_enabled").default(false).notNull(),
  batchSize: int("batch_size").default(3).notNull(),
  processMailChannel: boolean("process_mail_channel").default(true).notNull(),
  processFax: boolean("process_fax").default(true).notNull(),
  lookbackHours: int("lookback_hours").default(24).notNull(),
  scanMode: varchar("scan_mode", { length: 16 }).default("hours").notNull(),
  slackBotToken: varchar("slack_bot_token", { length: 256 }),
  claimsMailChannelId: varchar("claims_mail_channel_id", { length: 32 }).default("C07R60KAC2C").notNull(),
  claimsHubChannelId: varchar("claims_hub_channel_id", { length: 32 }).default("CHWRXH4HK").notNull(),
  googleSheetId: varchar("google_sheet_id", { length: 128 }),
  appsScriptUrl: varchar("apps_script_url", { length: 512 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  // ── Backlog Clearance Mode ──────────────────────────────────────────────────
  backlogModeEnabled: boolean("backlog_mode_enabled").default(false).notNull(),
  backlogModeEndDate: varchar("backlog_mode_end_date", { length: 12 }).default("2026-10-03"),
  backlogBatchSize: int("backlog_batch_size").default(22).notNull(),
  backlogSplitRatio: float("backlog_split_ratio").default(0.50).notNull(),
  backlogReviewedMarkers: varchar("backlog_reviewed_markers", { length: 256 }).default("white_check_mark,eyes,heavy_check_mark"),
});
export type MailBotConfig = typeof mailBotConfig.$inferSelect;

/** Per-agent configuration for assignment rules */
export const mailBotAgents = mysqlTable("mail_bot_agents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  slackId: varchar("slack_id", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["legal", "lor_roundrobin", "bi_injury", "pd", "general_roundrobin", "total_loss", "subro_docs"]).notNull(),
  dailyCap: int("daily_cap").default(3).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  roundRobinOrder: int("round_robin_order").default(0).notNull(),
  isOverflowTarget: boolean("is_overflow_target").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type MailBotAgent = typeof mailBotAgents.$inferSelect;

/** PTO / out-of-office dates for agents */
export const mailBotPto = mysqlTable("mail_bot_pto", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agent_id").notNull(),
  startDate: varchar("start_date", { length: 16 }).notNull(),
  endDate: varchar("end_date", { length: 16 }).notNull(),
  note: varchar("note", { length: 256 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type MailBotPto = typeof mailBotPto.$inferSelect;

/** Assignment log — every item processed by the bot */
export const mailBotAssignments = mysqlTable("mail_bot_assignments", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["slack_mail", "gmail_fax"]).notNull(),
  slackMessageTs: varchar("slack_message_ts", { length: 64 }),
  slackChannelId: varchar("slack_channel_id", { length: 32 }),
  fileName: varchar("file_name", { length: 512 }),
  messageText: text("message_text"),
  mailType: varchar("mail_type", { length: 64 }).notNull(),
  isLegal: boolean("is_legal").default(false).notNull(),
  assignedTo: varchar("assigned_to", { length: 128 }).notNull(),
  assignedSlackId: varchar("assigned_slack_id", { length: 64 }).notNull(),
  claimNumber: varchar("claim_number", { length: 64 }),
  state: varchar("state", { length: 4 }),
  vehicleType: varchar("vehicle_type", { length: 64 }),
  team: varchar("team", { length: 64 }),
  reviewedBy: varchar("reviewed_by", { length: 128 }),
  actionTaken: varchar("action_taken", { length: 256 }),
  fileLocation: varchar("file_location", { length: 512 }),
  notes: text("notes"),
  deadline: varchar("deadline", { length: 32 }),
  dollarAmount: varchar("dollar_amount", { length: 32 }),
  denialSent: boolean("denial_sent").default(false),
  denialType: varchar("denial_type", { length: 64 }),
  status: mysqlEnum("status", ["open", "in_review", "actioned", "closed"]).default("open").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  runId: varchar("run_id", { length: 64 }),
});
export type MailBotAssignment = typeof mailBotAssignments.$inferSelect;

/** Bot run log — one row per execution */
export const mailBotRuns = mysqlTable("mail_bot_runs", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("run_id", { length: 64 }).notNull(),
  trigger: mysqlEnum("trigger", ["scheduled", "manual_mail", "manual_fax"]).notNull(),
  source: mysqlEnum("source", ["slack_mail", "gmail_fax", "both"]).notNull(),
  itemsFound: int("items_found").default(0).notNull(),
  itemsAssigned: int("items_assigned").default(0).notNull(),
  itemsSkipped: int("items_skipped").default(0).notNull(),
  errors: text("errors"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: int("duration_ms"),
});
export type MailBotRun = typeof mailBotRuns.$inferSelect;

// ─── Loss of Use Calculator ───────────────────────────────────────────────────
/** Saved LOU calculation sessions */
export const louCalcs = mysqlTable("lou_calcs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Claim info (parsed from estimate or entered manually)
  whipClaimNo: varchar("whipClaimNo", { length: 64 }),
  adverseClaimNo: varchar("adverseClaimNo", { length: 64 }),
  dol: varchar("dol", { length: 32 }),
  adverseCarrier: varchar("adverseCarrier", { length: 128 }),
  vehicle: varchar("vehicle", { length: 128 }),
  vin: varchar("vin", { length: 32 }),
  memberDriver: varchar("memberDriver", { length: 128 }),
  registeredOwner: varchar("registeredOwner", { length: 128 }),
  vehicleStatus: varchar("vehicleStatus", { length: 64 }),
  vehicleClass: varchar("vehicleClass", { length: 32 }),
  // Repair period
  repairFacility: varchar("repairFacility", { length: 128 }),
  roNumber: varchar("roNumber", { length: 64 }),
  dropOff: varchar("dropOff", { length: 32 }),
  pickUp: varchar("pickUp", { length: 32 }),
  totalDays: int("totalDays"),
  daysClaimed: int("daysClaimed"),
  // Calculation
  dailyRate: int("dailyRate"),
  totalLou: int("totalLou"),
  // Utilization log (JSON array of daily entries)
  utilizationLog: text("utilizationLog"),
  // Uploaded estimate file key
  estimateFileKey: varchar("estimateFileKey", { length: 512 }),
  estimateFileUrl: varchar("estimateFileUrl", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LouCalc = typeof louCalcs.$inferSelect;

// ─── Claims Mail Triage ───────────────────────────────────────────────────────
import {
  date as drizzleDate,
  datetime,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

const MAIL_CATEGORIES = [
  'injury_pip_bi', 'inbound_subro', 'existing_claim_followup',
  'outbound_subro', 'total_loss', 'legal_or_high_risk', 'other_or_unclear',
] as const;

export const teams = mysqlTable('teams', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 128 }).notNull(),
  isReviewLane: int('is_review_lane').default(0),
  slaHours: int('sla_hours').default(48),
  forwardOnAssign: int('forward_on_assign').default(0),
  active: int('active').default(1),
});
export type Team = typeof teams.$inferSelect;

export const teamMembers = mysqlTable('team_members', {
  id: int('id').primaryKey().autoincrement(),
  teamId: int('team_id').notNull(),
  handlerId: int('handler_id').notNull(),
}, (t) => ({ uniq: uniqueIndex('team_member_uniq').on(t.teamId, t.handlerId) }));
export type TeamMember = typeof teamMembers.$inferSelect;

export const categoryRouting = mysqlTable('category_routing', {
  id: int('id').primaryKey().autoincrement(),
  category: mysqlEnum('category', MAIL_CATEGORIES).notNull().unique(),
  teamId: int('team_id').notNull(),
});
export type CategoryRouting = typeof categoryRouting.$inferSelect;

export const mailSettings = mysqlTable('mail_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: varchar('value', { length: 255 }).notNull(),
});
export type MailSetting = typeof mailSettings.$inferSelect;

  export const mailItems = mysqlTable('mail_items', {
  id: int('id').primaryKey().autoincrement(),
  source: mysqlEnum('source', ['email', 'mail', 'fax', 'manual']).notNull(),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  receivedAt: datetime('received_at').notNull(),
  status: mysqlEnum('status', ['new', 'assigned', 'resolved', 'escalated']).notNull().default('new'),
  category: mysqlEnum('category', MAIL_CATEGORIES),
  confidence: int('confidence'),
  needsReview: int('needs_review').default(0),
  isDemand: int('is_demand').default(0),
  preReviewed: int('pre_reviewed').default(0),
  initialCategory: mysqlEnum('initial_category', MAIL_CATEGORIES),
  initialHandlerId: int('initial_handler_id'),
  initialConfidence: int('initial_confidence'),
  assignedTeamId: int('assigned_team_id'),
  assignedHandlerId: int('assigned_handler_id'),
  assignedAt: datetime('assigned_at'),
  dueAt: datetime('due_at'),
  remindAt: datetime('remind_at'),
  lastRemindedAt: datetime('last_reminded_at'),
  claimNumber: varchar('claim_number', { length: 64 }),
  fromName: varchar('from_name', { length: 255 }),
  fromEmail: varchar('from_email', { length: 255 }),
  senderOrg: varchar('sender_org', { length: 255 }),
  adverseCarrier: varchar('adverse_carrier', { length: 255 }),
  claimantName: varchar('claimant_name', { length: 255 }),
  dateOfLoss: varchar('date_of_loss', { length: 32 }),
  requestedAction: text('requested_action'),
  urgency: mysqlEnum('urgency', ['low', 'normal', 'high', 'urgent']).default('normal'),
  reason: text('reason'),
  demandDate: varchar('demand_date', { length: 32 }),
  responseDueDate: varchar('response_due_date', { length: 32 }),
  subject: varchar('subject', { length: 512 }),
  bodyText: text('body_text'),
  gmailThreadId: varchar('gmail_thread_id', { length: 255 }),
  slackChannelId: varchar('slack_channel_id', { length: 64 }),
  slackMessageTs: varchar('slack_message_ts', { length: 32 }),
  slackPermalink: varchar('slack_permalink', { length: 512 }),
  claimEmail: varchar('claim_email', { length: 255 }),
  resolvedAt: datetime('resolved_at'),
  resolvedByHandlerId: int('resolved_by_handler_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (t) => ({
  dedupe: uniqueIndex('mail_items_dedupe').on(t.source, t.externalId),
  byStatus: index('mail_items_status_idx').on(t.status),
  byHandler: index('mail_items_handler_idx').on(t.assignedHandlerId),
  byTeam: index('mail_items_team_idx').on(t.assignedTeamId),
  byDue: index('mail_items_due_idx').on(t.dueAt),
}));
export type MailItem = typeof mailItems.$inferSelect;
export type InsertMailItem = typeof mailItems.$inferInsert;

export const mailItemFiles = mysqlTable('mail_item_files', {
  id: int('id').primaryKey().autoincrement(),
  itemId: int('item_id').notNull(),
  storageKey: varchar('storage_key', { length: 512 }).notNull(),
  filename: varchar('filename', { length: 255 }),
  contentType: varchar('content_type', { length: 128 }),
  sizeBytes: int('size_bytes'),
  createdAt: timestamp('created_at').defaultNow(),
});
export type MailItemFile = typeof mailItemFiles.$inferSelect;

export const mailItemNotes = mysqlTable('mail_item_notes', {
  id: int('id').primaryKey().autoincrement(),
  itemId: int('item_id').notNull(),
  byUserId: int('by_user_id'),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({ byItem: index('mail_notes_item_idx').on(t.itemId) }));
export type MailItemNote = typeof mailItemNotes.$inferSelect;

export const mailRoutingHistory = mysqlTable('mail_routing_history', {
  id: int('id').primaryKey().autoincrement(),
  itemId: int('item_id').notNull(),
  action: mysqlEnum('action', ['classified', 'assigned', 'rerouted', 'escalated', 'resolved']).notNull(),
  fromHandlerId: int('from_handler_id'),
  toHandlerId: int('to_handler_id'),
  byUserId: int('by_user_id'),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({ byItem: index('mail_routing_item_idx').on(t.itemId) }));
export type MailRoutingHistory = typeof mailRoutingHistory.$inferSelect;

export const mailQaSnapshots = mysqlTable('mail_qa_snapshots', {
  id: int('id').primaryKey().autoincrement(),
  periodStart: drizzleDate('period_start').notNull(),
  periodEnd: drizzleDate('period_end').notNull(),
  totalIngested: int('total_ingested'),
  autoAssigned: int('auto_assigned'),
  sentToReview: int('sent_to_review'),
  routeAccuracyPct: int('route_accuracy_pct'),
  withinSlaPct: int('within_sla_pct'),
  overdueCount: int('overdue_count'),
  medianResolveMins: int('median_resolve_mins'),
  metricsJson: text('metrics_json'),
  createdAt: timestamp('created_at').defaultNow(),
});
export type MailQaSnapshot = typeof mailQaSnapshots.$inferSelect;
