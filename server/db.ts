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

export async function createIntakeRecord(data: InsertIntakeRecord): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(intakeRecords).values(data);
  return (result[0] as any).insertId;
}

export async function getIntakeRecords(opts: {
  search?: string;
  status?: "open" | "closed" | "escalated";
  callerType?: string;
  handlerName?: string;
  priority?: string;
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

  const [byCallerType, byStatus, byDay, repeatCallers, byHandler, byPriority] = await Promise.all([
    db
      .select({ callerType: intakeRecords.callerType, count: sql<number>`count(*)` })
      .from(intakeRecords)
      .groupBy(intakeRecords.callerType),
    db
      .select({ status: intakeRecords.status, count: sql<number>`count(*)` })
      .from(intakeRecords)
      .groupBy(intakeRecords.status),
    db
      .select({ day: sql<string>`DATE(createdAt)`, count: sql<number>`count(*)` })
      .from(intakeRecords)
      .where(sql`createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
      .groupBy(sql`DATE(createdAt)`)
      .orderBy(sql`DATE(createdAt)`),
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
  ]);

  return { byCallerType, byStatus, byDay, repeatCallers, byHandler, byPriority };
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
  'Elizabeth Avilla', 'Jayla Bernard', 'Jovel Villa', 'Lorraine Tria',
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
  disposition: "reached" | "no_answer" | "left_voicemail" | "wrong_number" | "busy";
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
