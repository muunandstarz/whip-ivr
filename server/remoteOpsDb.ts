/**
 * Remote Ops @claims-intake DB helpers
 *
 * SLA rules:
 *   - Business hours (Mon–Fri 9am–6pm ET): 10 minutes to claim
 *   - After hours / weekends: 4 business hours (next available business window)
 */
import { eq, desc, and, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { remoteOpsIntakes, type InsertRemoteOpsIntake, type RemoteOpsIntake } from "../drizzle/schema";

// ─── SLA helpers ─────────────────────────────────────────────────────────────

const ET_OFFSET_HOURS = -4; // EDT (UTC-4); adjust to -5 for EST in winter if needed
const BIZ_START_HOUR = 9;   // 9am ET
const BIZ_END_HOUR = 18;    // 6pm ET
const BIZ_DAYS = new Set([1, 2, 3, 4, 5]); // Mon–Fri

/** Convert a UTC Date to Eastern Time */
function toET(utc: Date): Date {
  const et = new Date(utc);
  et.setHours(et.getHours() + ET_OFFSET_HOURS);
  return et;
}

/** Is the given UTC timestamp within business hours (Mon–Fri 9am–6pm ET)? */
export function isBusinessHours(utc: Date): boolean {
  const et = toET(utc);
  const day = et.getDay(); // 0=Sun, 6=Sat
  const hour = et.getHours();
  return BIZ_DAYS.has(day) && hour >= BIZ_START_HOUR && hour < BIZ_END_HOUR;
}

/**
 * Compute SLA due timestamp.
 * - Business hours: now + 10 minutes
 * - After hours/weekend: advance to next business day 9am ET, then add 4 hours
 */
export function computeSlaDueAt(triggeredAt: Date): { slaDueAt: Date; slaType: "business_hours" | "after_hours" } {
  if (isBusinessHours(triggeredAt)) {
    const slaDueAt = new Date(triggeredAt.getTime() + 10 * 60 * 1000);
    return { slaDueAt, slaType: "business_hours" };
  }

  // After hours: find next business window start (9am ET), then add 4 hours
  const et = toET(triggeredAt);
  let candidate = new Date(et);

  // Advance to next business day if needed
  let iterations = 0;
  while (iterations < 10) {
    const day = candidate.getDay();
    const hour = candidate.getHours();

    if (BIZ_DAYS.has(day) && hour < BIZ_END_HOUR) {
      // We're on a business day — set to 9am if before 9am, or keep current hour if after 9am
      if (hour < BIZ_START_HOUR) {
        candidate.setHours(BIZ_START_HOUR, 0, 0, 0);
      }
      break;
    }

    // Move to next day at 9am
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(BIZ_START_HOUR, 0, 0, 0);
    iterations++;
  }

  // candidate is now the start of the next business window in ET
  // Add 4 business hours
  let bizHoursRemaining = 4;
  while (bizHoursRemaining > 0) {
    const hour = candidate.getHours();
    const day = candidate.getDay();

    if (!BIZ_DAYS.has(day) || hour >= BIZ_END_HOUR) {
      // Skip to next business day 9am
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(BIZ_START_HOUR, 0, 0, 0);
      continue;
    }

    const hoursUntilClose = BIZ_END_HOUR - hour;
    if (bizHoursRemaining <= hoursUntilClose) {
      candidate.setHours(candidate.getHours() + bizHoursRemaining, 0, 0, 0);
      bizHoursRemaining = 0;
    } else {
      bizHoursRemaining -= hoursUntilClose;
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(BIZ_START_HOUR, 0, 0, 0);
    }
  }

  // Convert candidate (ET) back to UTC
  const slaDueAt = new Date(candidate.getTime() - ET_OFFSET_HOURS * 60 * 60 * 1000);
  return { slaDueAt, slaType: "after_hours" };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function createRemoteOpsIntake(
  data: Omit<InsertRemoteOpsIntake, "id" | "createdAt" | "updatedAt">,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(remoteOpsIntakes).values(data);
  return (result as any).insertId as number;
}

export async function getRemoteOpsIntakes(opts?: {
  status?: "pending" | "claimed" | "complete" | "all";
  limit?: number;
}): Promise<RemoteOpsIntake[]> {
  const db = await getDb();
  if (!db) return [];
  const limit = opts?.limit ?? 100;
  const status = opts?.status ?? "all";

  const where =
    status === "all"
      ? undefined
      : status === "pending"
        ? inArray(remoteOpsIntakes.status, ["pending"])
        : status === "claimed"
          ? inArray(remoteOpsIntakes.status, ["claimed"])
          : inArray(remoteOpsIntakes.status, ["complete"]);

  return db
    .select()
    .from(remoteOpsIntakes)
    .where(where)
    .orderBy(desc(remoteOpsIntakes.createdAt))
    .limit(limit);
}

export async function claimRemoteOpsIntake(
  id: number,
  handlerId: number,
  handlerName: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(remoteOpsIntakes)
    .set({ status: "claimed", claimedByHandlerId: handlerId, claimedByName: handlerName, claimedAt: new Date() })
    .where(and(eq(remoteOpsIntakes.id, id), eq(remoteOpsIntakes.status, "pending")));
}

export async function completeRemoteOpsIntake(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(remoteOpsIntakes)
    .set({ status: "complete", completedAt: new Date() })
    .where(eq(remoteOpsIntakes.id, id));
}

export async function getRemoteOpsIntakeById(id: number): Promise<RemoteOpsIntake | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(remoteOpsIntakes).where(eq(remoteOpsIntakes.id, id)).limit(1);
  return rows[0] ?? null;
}
