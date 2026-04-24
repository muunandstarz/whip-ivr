import { eq, desc, like, and, or, sql } from "drizzle-orm";
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

// ─── Intake Records ────────────────────────────────────────────────────────

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

  const [records, countResult] = await Promise.all([
    db
      .select()
      .from(intakeRecords)
      .where(where)
      .orderBy(desc(intakeRecords.createdAt))
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
      .where(sql`startedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
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

// ─── Handlers ──────────────────────────────────────────────────────────────

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

// ─── Full Call Analytics (all 1,866 calls) ─────────────────────────────────
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

// Mark an intake record as called back (close it with a note)
export async function markCalledBack(id: number, handlerName?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const note = `[Called back by ${handlerName ?? "handler"} on ${new Date().toLocaleString()}]`;
  await db
    .update(intakeRecords)
    .set({
      status: "closed",
      notes: sql`CONCAT(COALESCE(notes, ''), '\n', ${note})`,
      updatedAt: new Date(),
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
