import { eq, desc, like, and, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  intakeRecords,
  callSessions,
  InsertIntakeRecord,
  InsertCallSession,
  IntakeRecord,
  CallSession,
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
  return (result[0] as { insertId: number }).insertId;
}

export async function getIntakeRecords(opts: {
  search?: string;
  status?: "open" | "closed";
  callerType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { records: [], total: 0 };

  const conditions = [];
  if (opts.status) conditions.push(eq(intakeRecords.status, opts.status));
  if (opts.callerType && opts.callerType !== "all") {
    conditions.push(eq(intakeRecords.callerType, opts.callerType as IntakeRecord["callerType"]));
  }
  if (opts.search) {
    conditions.push(
      or(
        like(intakeRecords.callerName, `%${opts.search}%`),
        like(intakeRecords.organization, `%${opts.search}%`),
        like(intakeRecords.whipClaimNumber, `%${opts.search}%`),
        like(intakeRecords.callerPhone, `%${opts.search}%`),
        like(intakeRecords.assignedHandler, `%${opts.search}%`)
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
    db
      .select({ count: sql<number>`count(*)` })
      .from(intakeRecords)
      .where(where),
  ]);

  return { records, total: Number(countResult[0]?.count ?? 0) };
}

export async function getIntakeRecordById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(intakeRecords).where(eq(intakeRecords.id, id)).limit(1);
  return result[0];
}

export async function updateIntakeRecord(
  id: number,
  data: Partial<InsertIntakeRecord>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(intakeRecords).set(data).where(eq(intakeRecords.id, id));
}

export async function getIntakeAnalytics() {
  const db = await getDb();
  if (!db) return null;

  const [byCallerType, byStatus, byDay, recentRecords] = await Promise.all([
    db
      .select({
        callerType: intakeRecords.callerType,
        count: sql<number>`count(*)`,
      })
      .from(intakeRecords)
      .groupBy(intakeRecords.callerType),
    db
      .select({
        status: intakeRecords.status,
        count: sql<number>`count(*)`,
      })
      .from(intakeRecords)
      .groupBy(intakeRecords.status),
    db
      .select({
        day: sql<string>`DATE(createdAt)`,
        count: sql<number>`count(*)`,
      })
      .from(intakeRecords)
      .where(sql`createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`)
      .groupBy(sql`DATE(createdAt)`)
      .orderBy(sql`DATE(createdAt)`),
    db
      .select({
        callerPhone: intakeRecords.callerPhone,
        count: sql<number>`count(*)`,
        callerName: intakeRecords.callerName,
        organization: intakeRecords.organization,
      })
      .from(intakeRecords)
      .groupBy(intakeRecords.callerPhone, intakeRecords.callerName, intakeRecords.organization)
      .having(sql`count(*) > 2`)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ]);

  return { byCallerType, byStatus, byDay, repeatCallers: recentRecords };
}

// ─── Call Sessions ─────────────────────────────────────────────────────────

export async function upsertCallSession(data: InsertCallSession): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(callSessions)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        state: data.state,
        collectedData: data.collectedData,
        conversationHistory: data.conversationHistory,
        callerType: data.callerType,
        updatedAt: new Date(),
      },
    });
}

export async function getCallSession(callSid: string): Promise<CallSession | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(callSessions)
    .where(eq(callSessions.callSid, callSid))
    .limit(1);
  return result[0];
}

export async function deleteCallSession(callSid: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(callSessions).where(eq(callSessions.callSid, callSid));
}
