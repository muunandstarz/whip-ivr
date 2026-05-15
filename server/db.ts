import { eq, desc, like, and, or, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  intakeRecords,
  callHistory,
  callerProfiles,
  handlers,
  qaScores,
  qaScorecards,
  preAuthorizations,
  callbackLogs,
  callScripts,
  InsertIntakeRecord,
  InsertCallHistory,
  InsertCallerProfile,
  InsertHandler,
  InsertQaScore,
  IntakeRecord,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    openId: users.openId,
    name: users.name,
    email: users.email,
    role: users.role,
    loginMethod: users.loginMethod,
    handlerProfileId: users.handlerProfileId,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(users.createdAt);
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function linkUserToHandler(userId: number, handlerProfileId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ handlerProfileId }).where(eq(users.id, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, userId));
}
/** Try to auto-link a user to their handler profile by email match */
export async function autoLinkHandlerProfile(userId: number, email: string | null | undefined) {
  if (!email) return;
  const db = await getDb();
  if (!db) return;
  const match = await db.select({ id: handlers.id }).from(handlers).where(eq(handlers.email, email)).limit(1);
  if (match.length > 0) {
    await db.update(users).set({ handlerProfileId: match[0].id }).where(and(eq(users.id, userId), sql`handlerProfileId IS NULL`));
  }
}

// ─── Pre-Authorizations ────────────────────────────────────────────────────

export async function listPreAuthorizations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(preAuthorizations).orderBy(preAuthorizations.createdAt);
}

export async function addPreAuthorization(
  email: string,
  role: "admin" | "user",
  handlerProfileId: number | null,
  addedBy: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(preAuthorizations).values({
    email: email.toLowerCase().trim(),
    role,
    handlerProfileId: handlerProfileId ?? undefined,
    addedBy,
  });
}

export async function removePreAuthorization(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(preAuthorizations).where(eq(preAuthorizations.id, id));
}

/**
 * Called on every login: if a pre-authorization exists for this email,
 * apply the role (and optional handlerProfileId) and remove the pre-auth.
 */
export async function applyPreAuthorization(userId: number, email: string | null | undefined) {
  if (!email) return;
  const db = await getDb();
  if (!db) return;
  const preAuth = await db
    .select()
    .from(preAuthorizations)
    .where(eq(preAuthorizations.email, email.toLowerCase().trim()))
    .limit(1);
  if (preAuth.length === 0) return;
  const pa = preAuth[0];
  const updates: Record<string, unknown> = { role: pa.role };
  if (pa.handlerProfileId) updates.handlerProfileId = pa.handlerProfileId;
  await db.update(users).set(updates).where(eq(users.id, userId));
  // Remove the pre-auth once applied so it doesn't re-apply on next login
  await db.delete(preAuthorizations).where(eq(preAuthorizations.id, pa.id));
}

//
// ─── Intake Records ─────────────────────────────────────────────────────────

/** Compute intake labels based on creation time and routing method */
export function computeIntakeLabels(opts: {
  createdAt?: Date;
  routingMethod?: string | null;
}): string[] {
  const labels: string[] = [];
  const ts = opts.createdAt ?? new Date();
  const hour = ts.getUTCHours(); // DB stores UTC
  const dow = ts.getUTCDay();    // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const isAfterHours = hour < 8 || hour >= 18 || isWeekend;
  if (isAfterHours) labels.push('after_hours');
  if (isWeekend) labels.push('weekend');
  if (opts.routingMethod === 'extension') labels.push('direct_voicemail');
  return labels;
}

export async function createIntakeRecord(data: InsertIntakeRecord): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Auto-compute labels if not provided
  const labels = computeIntakeLabels({
    createdAt: data.createdAt instanceof Date ? data.createdAt : undefined,
    routingMethod: data.routingMethod,
  });
  const result = await db.insert(intakeRecords).values({
    ...data,
    labels: (data as any).labels ?? JSON.stringify(labels),
  });
  return (result[0] as any).insertId;
}

export async function getIntakeRecords(opts: {
  search?: string;
  status?: "open" | "closed" | "escalated";
  callerType?: string;
  handlerName?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "handlerName" | "priority" | "status";
  sortDir?: "asc" | "desc";
}) {
  const db = await getDb();
  if (!db) return { records: [], total: 0 };

  const conditions = [];
  if (opts.status) conditions.push(eq(intakeRecords.status, opts.status));
  if (opts.callerType && opts.callerType !== "all") {
    conditions.push(sql`${intakeRecords.callerType} = ${opts.callerType}`);
  }
  if (opts.handlerName) {
    conditions.push(like(intakeRecords.handlerName, `%${opts.handlerName}%`));
  }
  if (opts.priority) {
    conditions.push(eq(intakeRecords.priority, opts.priority as IntakeRecord["priority"]));
  }
  if (opts.dateFrom) {
    conditions.push(sql`${intakeRecords.createdAt} >= ${opts.dateFrom}`);
  }
  if (opts.dateTo) {
    // Include the full day: use < next day so 2026-04-29 includes all records up to 23:59:59
    conditions.push(sql`${intakeRecords.createdAt} < DATE_ADD(${opts.dateTo}, INTERVAL 1 DAY)`);
  }
  if (opts.search) {
    conditions.push(
      or(
        like(intakeRecords.callerName, `%${opts.search}%`),
        like(intakeRecords.callerOrg, `%${opts.search}%`),
        like(intakeRecords.whipClaimNumber, `%${opts.search}%`),
        like(intakeRecords.callerPhone, `%${opts.search}%`),
        like(intakeRecords.handlerName, `%${opts.search}%`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  // Build sort expression — whitelist column names to prevent SQL injection
  const allowedSortCols: Record<string, string> = {
    createdAt: "createdAt",
    handlerName: "handlerName",
    priority: "priority",
    status: "status",
  };
  const sortCol = allowedSortCols[opts.sortBy ?? "createdAt"] ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? "ASC" : "DESC";
  const orderExpr = sql.raw(`${sortCol} ${sortDir}`);

  const [records, countResult] = await Promise.all([
    db
      .select()
      .from(intakeRecords)
      .where(where)
      .orderBy(sql`${orderExpr}`)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(intakeRecords).where(where),
  ]);

  return { records, total: Number(countResult[0]?.count ?? 0) };
}

export async function getIntakeRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(intakeRecords).where(eq(intakeRecords.id, id)).limit(1);
  return result[0];
}

export async function updateIntakeRecord(id: number, data: Partial<InsertIntakeRecord>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(intakeRecords).set(data).where(eq(intakeRecords.id, id));
}

export async function getIntakeAnalytics() {
  const db = await getDb();
  if (!db) return null;

  const [byCallerType, byStatus, byDay, repeatCallers, byHandler, byPriority, byCallbackDisposition] = await Promise.all([
    db
      .select({ callerType: intakeRecords.callerType, count: sql<number>`count(*)` })
      .from(intakeRecords)
      .groupBy(intakeRecords.callerType),
    db
      .select({ status: intakeRecords.status, count: sql<number>`count(*)` })
      .from(intakeRecords)
      .groupBy(intakeRecords.status),
    db
      .select({ day: sql<string>`DATE_FORMAT(createdAt, '%Y-%m-%d')`, count: sql<number>`count(*)` })
      .from(intakeRecords)
      .where(sql`createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
      .groupBy(sql`DATE_FORMAT(createdAt, '%Y-%m-%d')`)
      .orderBy(sql`DATE_FORMAT(createdAt, '%Y-%m-%d')`),
    db
      .select({
        callerPhone: intakeRecords.callerPhone,
        count: sql<number>`count(*)`,
        callerName: intakeRecords.callerName,
        callerOrg: intakeRecords.callerOrg,
        lastCall: sql<string>`MAX(createdAt)`,
      })
      .from(intakeRecords)
      .groupBy(intakeRecords.callerPhone, intakeRecords.callerName, intakeRecords.callerOrg)
      .having(sql`count(*) >= 2`)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db
      .select({ handlerName: intakeRecords.handlerName, count: sql<number>`count(*)`, open: sql<number>`SUM(CASE WHEN status='open' THEN 1 ELSE 0 END)` })
      .from(intakeRecords)
      .groupBy(intakeRecords.handlerName)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ priority: intakeRecords.priority, count: sql<number>`count(*)` })
      .from(intakeRecords)
      .groupBy(intakeRecords.priority),
    db
      .select({ disposition: callbackLogs.disposition, count: sql<number>`count(*)` })
      .from(callbackLogs)
      .groupBy(callbackLogs.disposition)
      .orderBy(desc(sql`count(*)`)),
  ]);

  return { byCallerType, byStatus, byDay, repeatCallers, byHandler, byPriority, byCallbackDisposition };
}

// ─── Call History ──────────────────────────────────────────────────────────

export async function upsertCallHistory(data: InsertCallHistory): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(callHistory).values(data).onDuplicateKeyUpdate({
    set: {
      status: data.status,
      agentId: data.agentId,
      agentName: data.agentName,
      durationSeconds: data.durationSeconds,
      recordingUrl: data.recordingUrl,
      voicemailUrl: data.voicemailUrl,
      endedAt: data.endedAt,
    },
  });
}

export async function getCallHistory(opts: {
  status?: string;
  agentName?: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) return { calls: [], total: 0 };

  const conditions = [];
  if (opts.status) conditions.push(eq(callHistory.status, opts.status as any));
  if (opts.agentName) conditions.push(like(callHistory.agentName, `%${opts.agentName}%`));
  if (opts.startDate) conditions.push(sql`${callHistory.startedAt} >= ${opts.startDate}`);
  if (opts.endDate) conditions.push(sql`${callHistory.startedAt} <= ${opts.endDate}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [calls, countResult] = await Promise.all([
    db.select().from(callHistory).where(where).orderBy(desc(callHistory.startedAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(callHistory).where(where),
  ]);

  return { calls, total: Number(countResult[0]?.count ?? 0) };
}

export async function getCallHistoryAnalytics() {
  const db = await getDb();
  if (!db) return null;

  const [byStatus, byAgent, byDay, answerRateByDay] = await Promise.all([
    db
      .select({ status: callHistory.status, count: sql<number>`count(*)` })
      .from(callHistory)
      .where(sql`startedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
      .groupBy(callHistory.status),
    db
      .select({
        agentName: callHistory.agentName,
        answered: sql<number>`SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END)`,
        missed: sql<number>`SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END)`,
        voicemail: sql<number>`SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`AVG(durationSeconds)`,
        total: sql<number>`count(*)`,
      })
        .from(callHistory)
        .where(inArray(callHistory.agentName, CLAIMS_TEAM))
        .groupBy(callHistory.agentName)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({
          day: sql<string>`DATE(startedAt)`,
        total: sql<number>`count(*)`,
        answered: sql<number>`SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END)`,
        missed: sql<number>`SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END)`,
        voicemail: sql<number>`SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END)`,
      })
      .from(callHistory)
      .where(sql`startedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
      .groupBy(sql`DATE(startedAt)`)
      .orderBy(sql`DATE(startedAt)`),
    db
      .select({
        day: sql<string>`DATE(startedAt)`,
        answerRate: sql<number>`ROUND(SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) * 100.0 / count(*), 1)`,
      })
      .from(callHistory)
      .where(sql`startedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
      .groupBy(sql`DATE(startedAt)`)
      .orderBy(sql`DATE(startedAt)`),
  ]);

  return { byStatus, byAgent, byDay, answerRateByDay };
}

// ─── QA Scores ─────────────────────────────────────────────────────────────

export async function saveQaScore(data: InsertQaScore): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(qaScores).values(data);
}

export async function getQaScores(opts: { agentName?: string; weekOf?: Date; limit?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (opts.agentName) conditions.push(like(qaScores.agentName, `%${opts.agentName}%`));
  if (opts.weekOf) conditions.push(sql`weekOf >= ${opts.weekOf}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(qaScores)
    .where(where)
    .orderBy(desc(qaScores.weekOf))
    .limit(opts.limit ?? 100);
}

export async function getQaAgentSummary() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      agentName: qaScores.agentName,
      avgOverall: sql<number>`ROUND(AVG(overallScore), 1)`,
      avgGreeting: sql<number>`ROUND(AVG(greetingScore), 1)`,
      avgHold: sql<number>`ROUND(AVG(holdManagementScore), 1)`,
      avgResolution: sql<number>`ROUND(AVG(resolutionScore), 1)`,
      avgEmpathy: sql<number>`ROUND(AVG(empathyScore), 1)`,
      avgCallControl: sql<number>`ROUND(AVG(callControlScore), 1)`,
      callsScored: sql<number>`count(*)`,
    })
    .from(qaScores)
    .groupBy(qaScores.agentName)
    .orderBy(desc(sql`AVG(overallScore)`));
}

/// ─── Handlers ──────────────────────────────────────────────────────────────

/**
 * Resolve a partial handler name (e.g. "Jayla") to the full name ("Jayla Bernard").
 * Returns the original input if no match is found.
 */
export async function resolveHandlerName(name: string | null | undefined): Promise<string | undefined> {
  if (!name) return undefined;
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const db = await getDb();
  if (!db) return trimmed;
  // Exact match first
  const exact = await db.select({ name: handlers.name }).from(handlers)
    .where(eq(handlers.name, trimmed)).limit(1);
  if (exact.length > 0) return exact[0].name;
  // First-name-only match (e.g. "Jayla" → "Jayla Bernard")
  const partial = await db.select({ name: handlers.name }).from(handlers)
    .where(like(handlers.name, `${trimmed} %`)).limit(1);
  if (partial.length > 0) return partial[0].name;
  // Last-name-only match (e.g. "Bernard" → "Jayla Bernard")
  const lastNameMatch = await db.select({ name: handlers.name }).from(handlers)
    .where(like(handlers.name, `% ${trimmed}`)).limit(1);
  if (lastNameMatch.length > 0) return lastNameMatch[0].name;
  return trimmed;
}

export async function getHandlers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(handlers).where(eq(handlers.active, true)).orderBy(handlers.name);
}

export async function getHandlerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(handlers).where(eq(handlers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertHandler(data: InsertHandler): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(handlers).values(data).onDuplicateKeyUpdate({ set: { name: data.name, email: data.email } });
}

// ─── Caller Profiles ───────────────────────────────────────────────────────

export async function getCallerProfile(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callerProfiles).where(eq(callerProfiles.phone, phone)).limit(1);
  return result[0];
}

export async function getRepeatCallers() {
  const db = await getDb();
  if (!db) return [];
  // Join with intake_records to get org/claim info for known callers
  const profiles = await db
    .select()
    .from(callerProfiles)
    .where(sql`totalCalls > 1`)
    .orderBy(desc(callerProfiles.totalCalls))
    .limit(50);

  // For each profile, get the most recent intake record
  const enriched = await Promise.all(
    profiles.map(async (p) => {
      const intake = await db
        .select({
          callerName: intakeRecords.callerName,
          callerOrg: intakeRecords.callerOrg,
          callerType: intakeRecords.callerType,
          whipClaimNumber: intakeRecords.whipClaimNumber,
          snapsheetClaimUrl: intakeRecords.snapsheetClaimUrl,
          message: intakeRecords.message,
          status: intakeRecords.status,
        })
        .from(intakeRecords)
        .where(eq(intakeRecords.callerPhone, p.phone))
        .orderBy(desc(intakeRecords.createdAt))
        .limit(1);
      return { ...p, intake: intake[0] ?? null };
    })
  );
  return enriched;
}

// ─── Claims team agent names (active only) ───────────────────────────────────
export const CLAIMS_TEAM = [
  'Ana Padilla', 'Annie Ortiz', 'Bennet Carlos', 'Carlito Legarde Jr',
  'Catherine Cestina', 'Daniel Giono', 'Daryl Ochate', 'Demily Flores',
  'Jayla Bernard', 'Jovel Villa', 'Lorraine Tria',
  'Madeline Green', 'Mary Joy Badua', 'Natashia Edulan',
];

// ─── Full Call Analytics (claims team only) ──────────────────────────────────
export async function getFullCallAnalytics() {
  const db = await getDb();
  if (!db) return null;

  const [totals, byAgent, byDay, byDirection, topRepeatCallers, callbackPatterns, avgDurations, byCallerType, byMonth] =
    await Promise.all([
      db
        .select({ status: callHistory.status, count: sql<number>`count(*)` })
        .from(callHistory)
        .groupBy(callHistory.status),

      db
        .select({
          agentName: callHistory.agentName,
          answered: sql<number>`SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END)`,
          missed: sql<number>`SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END)`,
          voicemail: sql<number>`SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END)`,
          avgDurationSeconds: sql<number>`ROUND(AVG(CASE WHEN status='answered' THEN durationSeconds END), 0)`,
          total: sql<number>`count(*)`,
        })
        .from(callHistory)
        .where(sql`agentName IS NOT NULL`)
        .groupBy(callHistory.agentName)
        .orderBy(desc(sql`count(*)`)),

      db
        .select({
          day: sql<string>`DATE(startedAt)`,
          total: sql<number>`count(*)`,
          answered: sql<number>`SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END)`,
          missed: sql<number>`SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END)`,
          voicemail: sql<number>`SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END)`,
        })
        .from(callHistory)
        .groupBy(sql`DATE(startedAt)`)
        .orderBy(sql`DATE(startedAt)`),

      db
        .select({ direction: callHistory.direction, count: sql<number>`count(*)` })
        .from(callHistory)
        .groupBy(callHistory.direction),

      db
        .select({
          phone: callerProfiles.phone,
          name: callerProfiles.name,
          callerType: callerProfiles.callerType,
          totalCalls: callerProfiles.totalCalls,
          lastCallAt: callerProfiles.lastCallAt,
        })
        .from(callerProfiles)
        .where(sql`totalCalls >= 3`)
        .orderBy(desc(callerProfiles.totalCalls))
        .limit(25),

      db
        .select({
          callerPhone: callHistory.callerPhone,
          totalCalls: sql<number>`count(*)`,
          missedCalls: sql<number>`SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END)`,
          answeredCalls: sql<number>`SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END)`,
          voicemailCalls: sql<number>`SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END)`,
          lastCallAt: sql<string>`MAX(startedAt)`,
        })
        .from(callHistory)
        .where(sql`callerPhone IS NOT NULL`)
        .groupBy(callHistory.callerPhone)
        .having(sql`count(*) >= 3`)
        .orderBy(desc(sql`count(*)`))
        .limit(20),

      db
        .select({
          status: callHistory.status,
          avgDuration: sql<number>`ROUND(AVG(durationSeconds), 0)`,
          maxDuration: sql<number>`MAX(durationSeconds)`,
        })
        .from(callHistory)
        .groupBy(callHistory.status),

      // Caller type breakdown
      db
        .select({
          callerType: callHistory.callerType,
          total: sql<number>`count(*)`,
          answered: sql<number>`SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END)`,
          missed: sql<number>`SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END)`,
          voicemail: sql<number>`SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END)`,
        })
        .from(callHistory)
        .groupBy(callHistory.callerType)
        .orderBy(desc(sql`count(*)`)),

      // Month-over-month (by week for April data)
      db
        .select({
          week: sql<string>`DATE_FORMAT(startedAt, '%Y-%m-%d')`,
          total: sql<number>`count(*)`,
          answered: sql<number>`SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END)`,
          missed: sql<number>`SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END)`,
          voicemail: sql<number>`SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END)`,
          repeatCallers: sql<number>`SUM(CASE WHEN callerPhone IN (SELECT callerPhone FROM call_history GROUP BY callerPhone HAVING count(*) > 1) THEN 1 ELSE 0 END)`,
        })
        .from(callHistory)
        .groupBy(sql`DATE_FORMAT(startedAt, '%Y-%m-%d')`)
        .orderBy(sql`DATE_FORMAT(startedAt, '%Y-%m-%d')`),
    ]);

  return { totals, byAgent, byDay, byDirection, topRepeatCallers, callbackPatterns, avgDurations, byCallerType, byMonth };
}

// Get full call history for a specific phone number
export async function getCallerHistory(phone: string) {
  const db = await getDb();
  if (!db) return { calls: [], profile: null, intakeRecords: [] };

  const [calls, profileResult, intakes] = await Promise.all([
    db
      .select()
      .from(callHistory)
      .where(eq(callHistory.callerPhone, phone))
      .orderBy(desc(callHistory.startedAt))
      .limit(100),
    db.select().from(callerProfiles).where(eq(callerProfiles.phone, phone)).limit(1),
    db
      .select()
      .from(intakeRecords)
      .where(eq(intakeRecords.callerPhone, phone))
      .orderBy(desc(intakeRecords.createdAt))
      .limit(20),
  ]);

  return { calls, profile: profileResult[0] ?? null, intakeRecords: intakes };
}

// Mark an intake record as called back (close it with a note + timestamp)
export async function markCalledBack(id: number, handlerName?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  const note = `[Called back by ${handlerName ?? "handler"} on ${now.toLocaleString()}]`;
  await db
    .update(intakeRecords)
    .set({
      status: "closed",
      callbackAt: now,
      callbackHandlerName: handlerName ?? null,
      notes: sql`CONCAT(COALESCE(notes, ''), '\n', ${note})`,
      updatedAt: now,
    })
    .where(eq(intakeRecords.id, id));
}

// ── QA Scorecards ──────────────────────────────────────────────────────────────

/** Fetch all scorecards for a specific handler, newest first */
export async function getHandlerScorecards(handlerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(qaScorecards)
    .where(eq(qaScorecards.handlerId, handlerId))
    .orderBy(desc(qaScorecards.weekOf));
}

/** Fetch all scorecards for all handlers (for the Weekly QA review page) */
export async function getAllScorecards() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(qaScorecards)
    .orderBy(desc(qaScorecards.weekOf), qaScorecards.handlerName);
}

/** Save (upsert) a QA scorecard for a handler for a given week */
export async function saveHandlerScorecard(data: {
  handlerId: number;
  handlerName: string;
  weekOf: string;
  greetingScore?: number | null;
  holdManagementScore?: number | null;
  resolutionScore?: number | null;
  empathyScore?: number | null;
  callControlScore?: number | null;
  overallScore?: number | null;
  strengths?: string | null;
  improvements?: string | null;
  managerComments?: string | null;
  submittedBy?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ id: qaScorecards.id })
    .from(qaScorecards)
    .where(sql`handlerId = ${data.handlerId} AND weekOf = ${data.weekOf}`)
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(qaScorecards)
      .set({
        greetingScore: data.greetingScore,
        holdManagementScore: data.holdManagementScore,
        resolutionScore: data.resolutionScore,
        empathyScore: data.empathyScore,
        callControlScore: data.callControlScore,
        overallScore: data.overallScore,
        strengths: data.strengths,
        improvements: data.improvements,
        managerComments: data.managerComments,
        submittedBy: data.submittedBy,
        updatedAt: new Date(),
      })
      .where(eq(qaScorecards.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(qaScorecards).values({
      handlerId: data.handlerId,
      handlerName: data.handlerName,
      weekOf: data.weekOf,
      greetingScore: data.greetingScore,
      holdManagementScore: data.holdManagementScore,
      resolutionScore: data.resolutionScore,
      empathyScore: data.empathyScore,
      callControlScore: data.callControlScore,
      overallScore: data.overallScore,
      strengths: data.strengths,
      improvements: data.improvements,
      managerComments: data.managerComments,
      submittedBy: data.submittedBy,
    });
    return (result as any).insertId as number;
  }
}

// ─── Handler personal call metrics ───────────────────────────────────────────
export async function getHandlerCallMetrics(handlerName: string) {
  const db = await getDb();
  if (!db) return null;

   const client = (db as any).$client.promise();
  const [statsRows] = await client.query(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered,
       SUM(CASE WHEN status='missed'   THEN 1 ELSE 0 END) as missed,
       SUM(CASE WHEN direction='inbound'  THEN 1 ELSE 0 END) as inbound,
       SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) as outbound,
       ROUND(AVG(durationSeconds)/60,1) as avgDurationMin,
       ROUND(SUM(durationSeconds)/3600,1) as totalHours
     FROM call_history
     WHERE agentName = ?`,
    [handlerName]
  );
  const stats = statsRows[0] ?? {};

  const [byDayRows] = await client.query(
    `SELECT
       DATE(startedAt) as day,
       COUNT(*) as total,
       SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered
     FROM call_history
     WHERE agentName = ? AND startedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY DATE(startedAt)
     ORDER BY day ASC`,
    [handlerName]
  );

  const [openRecords] = await client.query(
    `SELECT id, callerName, callerOrg, whipClaimNumber, priority, createdAt, callbackDueBy, callbackAt, status
     FROM intake_records
     WHERE handlerName LIKE ? AND status IN ('open','pending')
     ORDER BY FIELD(priority,'high','medium','low'), createdAt ASC
     LIMIT 20`,
    [`%${handlerName}%`]
  );

  const [qaRows] = await client.query(
    `SELECT * FROM qa_scorecards WHERE handlerName LIKE ? ORDER BY weekOf DESC LIMIT 1`,
    [`%${handlerName}%`]
  );

  const total = Number(stats.total ?? 0);
  const answered = Number(stats.answered ?? 0);

  return {
    stats: {
      total,
      answered,
      missed: Number(stats.missed ?? 0),
      inbound: Number(stats.inbound ?? 0),
      outbound: Number(stats.outbound ?? 0),
      avgDurationMin: Number(stats.avgDurationMin ?? 0),
      totalHours: Number(stats.totalHours ?? 0),
      answerRate: total > 0 ? Math.round((answered / total) * 100) : 0,
    },
    byDay: byDayRows as { day: string; total: number; answered: number }[],
    openRecords: openRecords as {
      id: number; callerName: string; callerOrg: string; whipClaimNumber: string;
      priority: string; createdAt: Date; callbackDueBy: Date | null; callbackAt: Date | null; status: string;
    }[],
    latestScorecard: qaRows[0] ?? null,
  };
}

// ─── Callback Logs ─────────────────────────────────────────────────────────

export async function logCallback(data: {
  intakeId: number;
  handlerName?: string;
  disposition: "reached" | "no_answer" | "left_voicemail" | "wrong_number" | "busy" | "emailed";
  notes?: string;
  outcome?: "resolved" | "escalated" | "follow_up" | "closed";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(callbackLogs).values({
    intakeId: data.intakeId,
    handlerName: data.handlerName,
    disposition: data.disposition,
    notes: data.notes,
    outcome: data.outcome ?? "follow_up",
  });
  return (result[0] as any).insertId as number;
}

export async function getCallbackLogs(intakeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(callbackLogs)
    .where(eq(callbackLogs.intakeId, intakeId))
    .orderBy(desc(callbackLogs.calledAt));
}

// ─── Call Scripts ─────────────────────────────────────────────────────────

export async function getCallScripts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callScripts).orderBy(callScripts.callerType);
}

export async function updateCallScript(
  callerType: string,
  script: string,
  updatedBy?: string,
  label?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(callScripts)
    .values({ callerType, script, label: label ?? callerType, updatedBy })
    .onDuplicateKeyUpdate({
      set: {
        script,
        updatedBy: updatedBy ?? null,
        ...(label ? { label } : {}),
      },
    });
}

// ─── Callback SLA ──────────────────────────────────────────────────────────

/**
 * Add N business hours to a date.
 * Business hours = Mon–Fri, 8am–6pm (10 hrs/day).
 * If the start time is outside business hours, it snaps to the next open window.
 */
export function addBusinessHours(start: Date, hours: number): Date {
  const BIZ_START = 8;  // 8am
  const BIZ_END   = 18; // 6pm
  const BIZ_HRS   = BIZ_END - BIZ_START; // 10 hrs/day

  let d = new Date(start.getTime());

  // Snap to start of next business window if outside hours
  const snapToNextBizOpen = (dt: Date) => {
    const day = dt.getDay(); // 0=Sun, 6=Sat
    const h = dt.getHours() + dt.getMinutes() / 60;
    if (day === 0) { dt.setDate(dt.getDate() + 1); dt.setHours(BIZ_START, 0, 0, 0); return; }
    if (day === 6) { dt.setDate(dt.getDate() + 2); dt.setHours(BIZ_START, 0, 0, 0); return; }
    if (h < BIZ_START) { dt.setHours(BIZ_START, 0, 0, 0); return; }
    if (h >= BIZ_END)  { dt.setDate(dt.getDate() + (day === 5 ? 3 : 1)); dt.setHours(BIZ_START, 0, 0, 0); }
  };

  snapToNextBizOpen(d);

  let remaining = hours;
  while (remaining > 0) {
    const h = d.getHours() + d.getMinutes() / 60;
    const hoursLeftToday = BIZ_END - h;
    if (remaining <= hoursLeftToday) {
      d.setTime(d.getTime() + remaining * 3600_000);
      remaining = 0;
    } else {
      remaining -= hoursLeftToday;
      // Move to next business day open
      const day = d.getDay();
      d.setDate(d.getDate() + (day === 5 ? 3 : 1));
      d.setHours(BIZ_START, 0, 0, 0);
    }
  }
  return d;
}

/**
 * Returns callback SLA metrics for a handler (or all handlers if handlerName is omitted).
 * Only counts voicemail-sourced intake records that have not been closed before the due date.
 */
export async function getCallbackSLAMetrics(handlerName?: string) {
  const db = await getDb();
  if (!db) return { total: 0, onTime: 0, overdue: 0, pending: 0, complianceRate: 0 };

  const handlerCondition = handlerName
    ? sql`handlerName LIKE ${`%${handlerName}%`}`
    : sql`1=1`;

  const rows = await db.execute<{
    total: number;
    onTime: number;
    overdue: number;
    pending: number;
  }>(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE
        WHEN callbackAt IS NOT NULL AND callbackDueBy IS NOT NULL AND callbackAt <= callbackDueBy THEN 1
        ELSE 0
      END) AS onTime,
      SUM(CASE
        WHEN callbackAt IS NULL AND callbackDueBy IS NOT NULL AND callbackDueBy < NOW() THEN 1
        ELSE 0
      END) AS overdue,
      SUM(CASE
        WHEN callbackAt IS NULL AND (callbackDueBy IS NULL OR callbackDueBy >= NOW()) THEN 1
        ELSE 0
      END) AS pending
    FROM intake_records
    WHERE source = 'voicemail'
      AND status != 'closed'
      AND ${handlerCondition}
  `);

  const r = ((rows as any[][])[0] ?? [])[0] ?? { total: 0, onTime: 0, overdue: 0, pending: 0 };
  const total = Number(r.total ?? 0);
  const onTime = Number(r.onTime ?? 0);
  const overdue = Number(r.overdue ?? 0);
  const pending = Number(r.pending ?? 0);
  const complianceRate = total > 0 ? Math.round((onTime / (onTime + overdue)) * 100) : 100;
  return { total, onTime, overdue, pending, complianceRate };
}

/**
 * Returns completed callback counts for a handler (or all handlers) broken down
 * by time period and disposition.  A "completed" callback is any intake_record
 * where callbackAt IS NOT NULL (i.e. the handler logged a callback attempt).
 */
export async function getCallbackCompletionStats(handlerName?: string) {
  const db = await getDb();
  if (!db) return { today: 0, thisWeek: 0, thisMonth: 0, allTime: 0, byDisposition: {} as Record<string, number>, byHandler: [] as { handlerName: string; completed: number; reached: number; today: number }[] };

  const handlerCondition = handlerName
    ? sql`callbackHandlerName LIKE ${`%${handlerName}%`}`
    : sql`1=1`;

  // Aggregate counts from intake_records where callbackAt is set
  const rows = await db.execute<{
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
  }>(sql`
    SELECT
      SUM(CASE WHEN DATE(callbackAt) = CURDATE() THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN callbackAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS thisWeek,
      SUM(CASE WHEN callbackAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS thisMonth,
      COUNT(*) AS allTime
    FROM intake_records
    WHERE callbackAt IS NOT NULL
      AND ${handlerCondition}
  `);

  const r = ((rows as any[][])[0] ?? [])[0] ?? {};
  const today = Number(r.today ?? 0);
  const thisWeek = Number(r.thisWeek ?? 0);
  const thisMonth = Number(r.thisMonth ?? 0);
  const allTime = Number(r.allTime ?? 0);

  // Disposition breakdown from callback_logs (more granular — one row per attempt)
  const dispositionRows = await db.execute<{ disposition: string; count: number }>(sql`
    SELECT disposition, COUNT(*) AS count
    FROM callback_logs
    WHERE 1=1
    ${handlerName ? sql`AND handlerName LIKE ${`%${handlerName}%`}` : sql``}
    GROUP BY disposition
  `);
  const byDisposition: Record<string, number> = {};
  for (const row of ((dispositionRows as any[][])[0] ?? [])) {
    byDisposition[row.disposition] = Number(row.count ?? 0);
  }

  // Per-handler leaderboard (only when no specific handler is requested)
  let byHandler: { handlerName: string; completed: number; reached: number; today: number }[] = [];
  if (!handlerName) {
    const leaderRows = await db.execute<{
      handlerName: string;
      completed: number;
      reached: number;
      today: number;
    }>(sql`
      SELECT
        callbackHandlerName AS handlerName,
        COUNT(*) AS completed,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS reached,
        SUM(CASE WHEN DATE(callbackAt) = CURDATE() THEN 1 ELSE 0 END) AS today
      FROM intake_records
      WHERE callbackAt IS NOT NULL
        AND callbackHandlerName IS NOT NULL
        AND callbackAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY callbackHandlerName
      ORDER BY completed DESC
    `);
    byHandler = ((leaderRows as any[][])[0] ?? []).map((row: any) => ({
      handlerName: row.handlerName,
      completed: Number(row.completed ?? 0),
      reached: Number(row.reached ?? 0),
      today: Number(row.today ?? 0),
    }));
  }

  return { today, thisWeek, thisMonth, allTime, byDisposition, byHandler };
}

/**
 * Returns all callback_logs joined with intake_records for a global callback log view.
 * Supports optional filtering by handlerName, disposition, and date range.
 */
export async function getCallbackLogAll(opts?: {
  handlerName?: string;
  disposition?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const conditions: ReturnType<typeof sql>[] = [sql`1=1`];
  if (opts?.handlerName) conditions.push(sql`cl.handlerName LIKE ${`%${opts.handlerName}%`}`);
  if (opts?.disposition) conditions.push(sql`cl.disposition = ${opts.disposition}`);

  const where = conditions.reduce((acc, c) => sql`${acc} AND ${c}`);

  const rows = await db.execute<{
    id: number;
    intakeId: number;
    handlerName: string | null;
    calledAt: Date | null;
    disposition: string;
    outcome: string | null;
    notes: string | null;
    callerName: string | null;
    callerPhone: string | null;
    callerOrg: string | null;
    callerType: string | null;
    status: string;
    intakeCreatedAt: Date | null;
    minutesToCallback: number | null;
  }>(sql`
    SELECT
      cl.id,
      cl.intakeId,
      cl.handlerName,
      cl.calledAt,
      cl.disposition,
      cl.outcome,
      cl.notes,
      ir.callerName,
      ir.callerPhone,
      ir.callerOrg,
      ir.callerType,
      ir.status,
      ir.createdAt AS intakeCreatedAt,
      CASE WHEN cl.calledAt IS NOT NULL AND ir.createdAt IS NOT NULL
        THEN ROUND(TIMESTAMPDIFF(SECOND, ir.createdAt, cl.calledAt) / 60)
        ELSE NULL
      END AS minutesToCallback
    FROM callback_logs cl
    JOIN intake_records ir ON ir.id = cl.intakeId
    WHERE ${where}
    ORDER BY cl.calledAt DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRows = await db.execute<{ total: number }>(sql`
    SELECT COUNT(*) AS total
    FROM callback_logs cl
    JOIN intake_records ir ON ir.id = cl.intakeId
    WHERE ${where}
  `);

  const total = Number(((countRows as any[][])[0] ?? [])[0]?.total ?? 0);
  return { rows: (rows as any[][])[0] ?? [], total };
}

export async function getCallbackSpeedMetrics(handlerName?: string) {
  const db = await getDb();
  if (!db) return { avgMinutes: null, slaPercent: null, byHandler: [] };

  const handlerCond = handlerName ? sql`AND cl.handlerName = ${handlerName}` : sql``;

  // Overall avg and SLA %
  const overall = await db.execute<{
    avgMinutes: number | null;
    totalCbs: number;
    withinSla: number;
  }>(sql`
    SELECT
      ROUND(AVG(TIMESTAMPDIFF(SECOND, ir.createdAt, cl.calledAt) / 60)) AS avgMinutes,
      COUNT(*) AS totalCbs,
      SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, ir.createdAt, cl.calledAt) <= 240 THEN 1 ELSE 0 END) AS withinSla
    FROM callback_logs cl
    JOIN intake_records ir ON ir.id = cl.intakeId
    WHERE cl.calledAt IS NOT NULL AND ir.createdAt IS NOT NULL
    ${handlerCond}
  `);

  // Per-handler breakdown (only if no specific handler filter)
  const byHandlerRows = handlerName ? [] : await db.execute<{
    handlerName: string;
    avgMinutes: number | null;
    totalCbs: number;
    withinSla: number;
  }>(sql`
    SELECT
      cl.handlerName,
      ROUND(AVG(TIMESTAMPDIFF(SECOND, ir.createdAt, cl.calledAt) / 60)) AS avgMinutes,
      COUNT(*) AS totalCbs,
      SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, ir.createdAt, cl.calledAt) <= 240 THEN 1 ELSE 0 END) AS withinSla
    FROM callback_logs cl
    JOIN intake_records ir ON ir.id = cl.intakeId
    WHERE cl.calledAt IS NOT NULL AND ir.createdAt IS NOT NULL
      AND cl.handlerName IS NOT NULL
    GROUP BY cl.handlerName
    ORDER BY avgMinutes ASC
  `);

  const o = ((overall as any[][])[0] ?? [])[0] ?? {};
  const avgMinutes = o.avgMinutes != null ? Number(o.avgMinutes) : null;
  const totalCbs = Number(o.totalCbs ?? 0);
  const withinSla = Number(o.withinSla ?? 0);
  const slaPercent = totalCbs > 0 ? Math.round((withinSla / totalCbs) * 100) : null;
  const byHandler = ((byHandlerRows as any[][])[0] ?? []).map((r: any) => ({
    handlerName: r.handlerName as string,
    avgMinutes: r.avgMinutes != null ? Number(r.avgMinutes) : null,
    totalCbs: Number(r.totalCbs),
    slaPercent: Number(r.totalCbs) > 0
      ? Math.round((Number(r.withinSla) / Number(r.totalCbs)) * 100)
      : null,
  }));

  return { avgMinutes, slaPercent, totalCbs, byHandler };
}

// ─── Dashboard: Overdue Callback Details ──────────────────────────────────────
export async function getOverdueCallbackDetails() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute<{
    id: number; callerName: string | null; callerOrg: string | null;
    callerPhone: string | null; handlerName: string | null;
    callbackDueBy: string | null; priority: string | null; createdAt: string;
  }>(sql`
    SELECT id, callerName, callerOrg, callerPhone, handlerName, callbackDueBy, priority, createdAt
    FROM intake_records
    WHERE source = 'voicemail' AND status != 'closed'
      AND callbackAt IS NULL AND callbackDueBy IS NOT NULL AND callbackDueBy < NOW()
    ORDER BY callbackDueBy ASC LIMIT 20
  `);
  return ((rows as any[][])[0] ?? []).map((r: any) => ({
    id: Number(r.id), callerName: r.callerName as string | null,
    callerOrg: r.callerOrg as string | null, callerPhone: r.callerPhone as string | null,
    handlerName: r.handlerName as string | null, callbackDueBy: r.callbackDueBy as string | null,
    priority: r.priority as string | null, createdAt: r.createdAt as string,
  }));
}

// ─── Dashboard: 7-Day Intake Trend by Caller Type ─────────────────────────────
export async function get7DayIntakeTrend() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute<{ day: string; callerType: string | null; count: number }>(sql`
    SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day, callerType, COUNT(*) AS count
    FROM intake_records
    WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
    GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d'), callerType
    ORDER BY day ASC, count DESC
  `);
  // Drizzle execute() returns [[rows], [fieldPackets]] — use [0] to get just the rows
  const rowsArr = (rows as any[][])[0] ?? [];
  return rowsArr.map((r: any) => ({
    day: String(r.day ?? '').slice(0, 10),
    callerType: (r.callerType ?? 'unknown') as string,
    count: Number(r.count),
  }));
}

// ─── Dashboard: Call Analytics by Month ───────────────────────────────────────
export async function getCallAnalyticsByMonth(yearMonth: string) {
  const db = await getDb();
  if (!db) return null;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null;

  // Compute previous month string (e.g. 2026-05 → 2026-04)
  const [yr, mo] = yearMonth.split('-').map(Number);
  const prevMo = mo === 1 ? 12 : mo - 1;
  const prevYr = mo === 1 ? yr - 1 : yr;
  const prevYearMonth = `${prevYr}-${String(prevMo).padStart(2, '0')}`;

  const [totals, byDirection, byDay, availableMonths, afterHoursRow, prevTotals, byCallerType, intakeVoicemail] = await Promise.all([
    db.execute<{ status: string; count: number }>(sql`
      SELECT status, CAST(COUNT(*) AS SIGNED) AS count FROM call_history
      WHERE DATE_FORMAT(startedAt, '%Y-%m') = ${yearMonth} GROUP BY status
    `),
    db.execute<{ direction: string; count: number }>(sql`
      SELECT direction, CAST(COUNT(*) AS SIGNED) AS count FROM call_history
      WHERE DATE_FORMAT(startedAt, '%Y-%m') = ${yearMonth} GROUP BY direction
    `),
    db.execute<{ day: string; total: number; answered: number; missed: number; voicemail: number }>(sql`
      SELECT DATE_FORMAT(startedAt, '%Y-%m-%d') AS day,
        CAST(COUNT(*) AS SIGNED) AS total,
        CAST(SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) AS SIGNED) AS answered,
        CAST(SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) AS SIGNED) AS missed,
        CAST(SUM(CASE WHEN status='voicemail' THEN 1 ELSE 0 END) AS SIGNED) AS voicemail
      FROM call_history WHERE DATE_FORMAT(startedAt, '%Y-%m') = ${yearMonth}
      GROUP BY DATE_FORMAT(startedAt, '%Y-%m-%d') ORDER BY day ASC
    `),
    db.execute<{ month: string }>(sql`
      SELECT DISTINCT DATE_FORMAT(startedAt, '%Y-%m') AS month FROM call_history
      WHERE startedAt IS NOT NULL ORDER BY month DESC LIMIT 12
    `),
    // After-hours/weekend/biz-hours breakdown — INBOUND ONLY
    // Outbound calls (handlers calling clients back) must NOT be counted here;
    // after-hours only makes sense for inbound calls we received.
    db.execute<{ total: number; afterHours: number; weekend: number; businessHoursAnswered: number; businessHoursTotal: number }>(sql`
      SELECT
        CAST(COUNT(*) AS SIGNED) AS total,
        CAST(SUM(CASE WHEN HOUR(startedAt) < 8 OR HOUR(startedAt) >= 18 THEN 1 ELSE 0 END) AS SIGNED) AS afterHours,
        CAST(SUM(CASE WHEN DAYOFWEEK(startedAt) IN (1,7) THEN 1 ELSE 0 END) AS SIGNED) AS weekend,
        CAST(SUM(CASE WHEN status='answered' AND HOUR(startedAt) >= 8 AND HOUR(startedAt) < 18 AND DAYOFWEEK(startedAt) NOT IN (1,7) THEN 1 ELSE 0 END) AS SIGNED) AS businessHoursAnswered,
        CAST(SUM(CASE WHEN HOUR(startedAt) >= 8 AND HOUR(startedAt) < 18 AND DAYOFWEEK(startedAt) NOT IN (1,7) THEN 1 ELSE 0 END) AS SIGNED) AS businessHoursTotal
      FROM call_history
      WHERE DATE_FORMAT(startedAt, '%Y-%m') = ${yearMonth}
        AND direction = 'inbound'
    `),
    // Previous month totals for MoM comparison
    db.execute<{ status: string; count: number }>(sql`
      SELECT status, CAST(COUNT(*) AS SIGNED) AS count FROM call_history
      WHERE DATE_FORMAT(startedAt, '%Y-%m') = ${prevYearMonth} GROUP BY status
    `),
    // Caller type breakdown for this month
    db.execute<{ callerType: string | null; count: number }>(sql`
      SELECT COALESCE(callerType, 'unknown') AS callerType, CAST(COUNT(*) AS SIGNED) AS count FROM call_history
      WHERE DATE_FORMAT(startedAt, '%Y-%m') = ${yearMonth} GROUP BY callerType ORDER BY count DESC
    `),
    // Voicemail count from intake_records + inbound-answered count for missed supplement
    db.execute<{ voicemailIntakes: number; inboundAnswered: number }>(sql`
      SELECT
        (SELECT CAST(COUNT(*) AS SIGNED) FROM intake_records WHERE DATE_FORMAT(createdAt, '%Y-%m') = ${yearMonth}) AS voicemailIntakes,
        CAST(SUM(CASE WHEN direction='inbound' AND status='answered' THEN 1 ELSE 0 END) AS SIGNED) AS inboundAnswered
      FROM call_history
      WHERE DATE_FORMAT(startedAt, '%Y-%m') = ${yearMonth}
    `),
  ]);

  // Drizzle execute() returns [[rows], [fieldPackets]] — use [0] to get just the rows
  const totalsRows     = (totals as any[][])[0] ?? [];
  const byDirectionRows = (byDirection as any[][])[0] ?? [];
  const byDayRows      = (byDay as any[][])[0] ?? [];
  const availMonthRows = (availableMonths as any[][])[0] ?? [];
  const ahRow          = ((afterHoursRow as any[][])[0] ?? [])[0] ?? {};
  const prevTotalsRows = (prevTotals as any[][])[0] ?? [];
  const byCallerTypeRows = (byCallerType as any[][])[0] ?? [];
  const intakeVoicemailRow = ((intakeVoicemail as any[][])[0] ?? [])[0] ?? {};
  const intakeVoicemailCount = Number(intakeVoicemailRow.voicemailIntakes ?? 0);
  const inboundAnsweredCount = Number(intakeVoicemailRow.inboundAnswered ?? 0);

  const prevTotalsArr = prevTotalsRows.map((r: any) => ({ status: r.status as string, count: Number(r.count) }));
  const prevTotal = prevTotalsArr.reduce((s: number, r: any) => s + r.count, 0);
  const prevAnswered = prevTotalsArr.find((r: any) => r.status === 'answered')?.count ?? 0;

  return {
    yearMonth,
    prevYearMonth,
    // Merge call_history totals with intake_records voicemail count.
    // For months where Aircall sync didn't capture missed/voicemail (e.g. May 2026 live data),
    // supplement missed = inbound calls that are NOT answered (inbound - answered_inbound),
    // and voicemail = intake_records count (which includes extension voicemails).
    totals: (() => {
      const rows = totalsRows.map((r: any) => ({ status: r.status as string, count: Number(r.count) }));
      const hasVoicemail = rows.some(r => r.status === 'voicemail');
      const hasMissed = rows.some(r => r.status === 'missed');
      const inboundCount = byDirectionRows.find((r: any) => r.direction === 'inbound')?.count ?? 0;
      const answeredCount = rows.find(r => r.status === 'answered')?.count ?? 0;
      // If no voicemail in call_history, use intake_records count
      if (!hasVoicemail && intakeVoicemailCount > 0) {
        rows.push({ status: 'voicemail', count: intakeVoicemailCount });
      }
      // If no missed in call_history, estimate from inbound - inbound_answered (all unanswered inbound calls)
      // Use inboundAnsweredCount (direction='inbound' AND status='answered') not total answeredCount
      // which includes outbound calls and would give a wrong negative result.
      if (!hasMissed) {
        const estimatedMissed = Math.max(0, Number(inboundCount) - inboundAnsweredCount);
        if (estimatedMissed > 0) rows.push({ status: 'missed', count: estimatedMissed });
      }
      return rows;
    })(),
    byDirection: byDirectionRows.map((r: any) => ({ direction: r.direction as string, count: Number(r.count) })),
    byDay: byDayRows.map((r: any) => ({
      day: String(r.day ?? '').slice(0, 10),
      total: Number(r.total), answered: Number(r.answered),
      missed: Number(r.missed), voicemail: Number(r.voicemail),
    })),
    availableMonths: availMonthRows.map((r: any) => r.month as string),
    afterHours: Number(ahRow.afterHours ?? 0),
    weekend: Number(ahRow.weekend ?? 0),
    businessHoursAnswered: Number(ahRow.businessHoursAnswered ?? 0),
    businessHoursTotal: Number(ahRow.businessHoursTotal ?? 0),
    prevMonth: {
      yearMonth: prevYearMonth,
      total: prevTotal,
      answered: prevAnswered,
      answerRate: prevTotal > 0 ? Math.round((prevAnswered / prevTotal) * 100) : 0,
    },
    byCallerType: byCallerTypeRows.map((r: any) => ({ callerType: String(r.callerType ?? 'unknown'), count: Number(r.count) })),
  };
}

// ─── Handler Weekly Stats (for QA page) ──────────────────────────────────────
export async function getHandlerWeeklyStats(weekStart: string): Promise<{
  handlerName: string;
  totalCalls: number;
  answeredCalls: number;
  answerRate: number;
  callsByCallerType: Record<string, number>;
  overdueCallbacks: number;
  callbackRate: number; // % of voicemails that got a callback
  avgCallDurationMin: number;
}[]> {
  const db = await getDb();
  if (!db) return [];
  const client = (db as any).$client.promise();

  // week window: weekStart (Monday) to weekStart + 7 days
  const [callRows] = await client.query(
    `SELECT
       agentName,
       COUNT(*) as total,
       SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered,
       ROUND(AVG(durationSeconds)/60, 1) as avgDurationMin
     FROM call_history
     WHERE agentName IS NOT NULL
       AND startedAt >= ?
       AND startedAt < DATE_ADD(?, INTERVAL 7 DAY)
     GROUP BY agentName
     ORDER BY total DESC`,
    [weekStart, weekStart]
  );

  // caller type breakdown per handler from intake_records for the same week
  const [callerTypeRows] = await client.query(
    `SELECT handlerName, callerType, COUNT(*) as cnt
     FROM intake_records
     WHERE handlerName IS NOT NULL
       AND createdAt >= ?
       AND createdAt < DATE_ADD(?, INTERVAL 7 DAY)
     GROUP BY handlerName, callerType`,
    [weekStart, weekStart]
  );

  // overdue callbacks per handler
  const [overdueRows] = await client.query(
    `SELECT handlerName, COUNT(*) as overdue
     FROM intake_records
     WHERE callbackAt IS NULL
       AND callbackDueBy IS NOT NULL
       AND callbackDueBy < NOW()
       AND status != 'closed'
     GROUP BY handlerName`
  );

  // callback rate: voicemails assigned to handler that got a callbackAt
  const [callbackRows] = await client.query(
    `SELECT handlerName,
       COUNT(*) as total_voicemails,
       SUM(CASE WHEN callbackAt IS NOT NULL THEN 1 ELSE 0 END) as called_back
     FROM intake_records
     WHERE source = 'voicemail'
       AND handlerName IS NOT NULL
       AND createdAt >= ?
       AND createdAt < DATE_ADD(?, INTERVAL 7 DAY)
     GROUP BY handlerName`,
    [weekStart, weekStart]
  );

  // Build lookup maps
  const callerTypeMap: Record<string, Record<string, number>> = {};
  for (const row of callerTypeRows as any[]) {
    const hn = String(row.handlerName ?? "");
    if (!callerTypeMap[hn]) callerTypeMap[hn] = {};
    callerTypeMap[hn][String(row.callerType ?? "unknown")] = Number(row.cnt ?? 0);
  }

  const overdueMap: Record<string, number> = {};
  for (const row of overdueRows as any[]) {
    overdueMap[String(row.handlerName ?? "")] = Number(row.overdue ?? 0);
  }

  const callbackMap: Record<string, { total: number; calledBack: number }> = {};
  for (const row of callbackRows as any[]) {
    callbackMap[String(row.handlerName ?? "")] = {
      total: Number(row.total_voicemails ?? 0),
      calledBack: Number(row.called_back ?? 0),
    };
  }

  return (callRows as any[]).map((row: any) => {
    const hn = String(row.agentName ?? "");
    const total = Number(row.total ?? 0);
    const answered = Number(row.answered ?? 0);
    const cb = callbackMap[hn] ?? { total: 0, calledBack: 0 };
    return {
      handlerName: hn,
      totalCalls: total,
      answeredCalls: answered,
      answerRate: total > 0 ? Math.round((answered / total) * 100) : 0,
      callsByCallerType: callerTypeMap[hn] ?? {},
      overdueCallbacks: overdueMap[hn] ?? 0,
      callbackRate: cb.total > 0 ? Math.round((cb.calledBack / cb.total) * 100) : 100,
      avgCallDurationMin: Number(row.avgDurationMin ?? 0),
    };
  });
}

// ─── Generate Weekly QA Report via LLM ───────────────────────────────────────
export async function generateWeeklyQAReport(weekStart: string): Promise<{
  handlerName: string;
  weekOf: string;
  greetingScore: number;
  holdManagementScore: number;
  resolutionScore: number;
  empathyScore: number;
  callControlScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  coachingNote: string;
  callsAnalyzed: number;
}[]> {
  const { invokeLLM } = await import("./_core/llm");
  const db = await getDb();
  if (!db) return [];
  const client = (db as any).$client.promise();

  // Get handler stats for the week
  const stats = await getHandlerWeeklyStats(weekStart);
  if (stats.length === 0) return [];

  // Get recent transcripts for each handler (last 7 days)
  const [transcriptRows] = await client.query(
    `SELECT ir.handlerName, ir.transcription, ir.callerType, ir.summary, ir.createdAt
     FROM intake_records ir
     WHERE ir.handlerName IS NOT NULL
       AND ir.transcription IS NOT NULL
       AND ir.createdAt >= ?
       AND ir.createdAt < DATE_ADD(?, INTERVAL 7 DAY)
     ORDER BY ir.createdAt DESC
     LIMIT 100`,
    [weekStart, weekStart]
  );

  // Group transcripts by handler
  const transcriptsByHandler: Record<string, string[]> = {};
  for (const row of transcriptRows as any[]) {
    const hn = String(row.handlerName ?? "");
    if (!transcriptsByHandler[hn]) transcriptsByHandler[hn] = [];
    if (transcriptsByHandler[hn].length < 5) { // max 5 transcripts per handler
      transcriptsByHandler[hn].push(
        `[${row.callerType ?? "unknown"} caller] ${row.transcription?.slice(0, 400) ?? ""}`
      );
    }
  }

  const results = [];

  for (const handler of stats) {
    const transcripts = transcriptsByHandler[handler.handlerName] ?? [];
    const callerTypeSummary = Object.entries(handler.callsByCallerType)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ") || "no intake records this week";

    const prompt = `You are a call center QA manager reviewing a claims handler's performance for the week of ${weekStart}.

Handler: ${handler.handlerName}
Total calls: ${handler.totalCalls} (${handler.answeredCalls} answered, ${handler.answerRate}% answer rate)
Avg call duration: ${handler.avgCallDurationMin} min
Caller types handled: ${callerTypeSummary}
Overdue callbacks: ${handler.overdueCallbacks}
Callback rate: ${handler.callbackRate}%

${transcripts.length > 0 ? `Sample call transcripts (${transcripts.length} of ${handler.totalCalls} calls):\n${transcripts.map((t, i) => `--- Call ${i + 1} ---\n${t}`).join("\n\n")}` : "No transcripts available for this week — base scores on call volume and callback metrics only."}

Score this handler 1-10 on each dimension and provide coaching feedback. Be specific and actionable. Base your assessment on the data provided.`;

    try {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a professional call center QA manager. Output structured JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "qa_report",
            strict: true,
            schema: {
              type: "object",
              properties: {
                greetingScore: { type: "number" },
                holdManagementScore: { type: "number" },
                resolutionScore: { type: "number" },
                empathyScore: { type: "number" },
                callControlScore: { type: "number" },
                overallScore: { type: "number" },
                strengths: { type: "array", items: { type: "string" } },
                improvements: { type: "array", items: { type: "string" } },
                coachingNote: { type: "string" },
              },
              required: ["greetingScore","holdManagementScore","resolutionScore","empathyScore","callControlScore","overallScore","strengths","improvements","coachingNote"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response?.choices?.[0]?.message?.content;
      if (!content) continue;
      const parsed = typeof content === "string" ? JSON.parse(content) : content;

      results.push({
        handlerName: handler.handlerName,
        weekOf: weekStart,
        greetingScore: Number(parsed.greetingScore ?? 7),
        holdManagementScore: Number(parsed.holdManagementScore ?? 7),
        resolutionScore: Number(parsed.resolutionScore ?? 7),
        empathyScore: Number(parsed.empathyScore ?? 7),
        callControlScore: Number(parsed.callControlScore ?? 7),
        overallScore: Number(parsed.overallScore ?? 7),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        coachingNote: String(parsed.coachingNote ?? ""),
        callsAnalyzed: handler.totalCalls,
      });
    } catch (err: any) {
      console.warn(`[QA] Failed to generate report for ${handler.handlerName}:`, err.message);
    }
  }

  return results;
}

// ─── QA: Get scorecards for a specific week ─────────────────────────────────
export async function getScorecardsByWeek(weekOf: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(qaScorecards)
    .where(eq(qaScorecards.weekOf, weekOf))
    .orderBy(desc(qaScorecards.overallScore));
}

// ─── QA: Delete all scorecards for a specific week (before regenerating) ────
export async function deleteScorecardsByWeek(weekOf: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(qaScorecards).where(eq(qaScorecards.weekOf, weekOf));
}

// ─── QA: Get all available weeks that have scorecards ───────────────────────
export async function getQaWeeks(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ weekOf: qaScorecards.weekOf })
    .from(qaScorecards)
    .orderBy(desc(qaScorecards.weekOf));
  return rows.map((r) => r.weekOf);
}
