import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { lossIntakeClaims, lossIntakeDailyMetrics } from "../drizzle/schema";
import { getDb } from "./db";

export const INTAKE_SOURCE_CHANNELS = ["claims", "remote-markets", "escalations"] as const;
export const INTAKE_REP_HANDLER_IDS = new Set([4, 6, 30003]); // Carlito, Ana, Bennet
const INTAKE_REP_NAMES: Record<number, string> = { 4: "Carlito Legarde Jr", 6: "Ana Padilla", 30003: "Bennet Carlos" };

export type IntakeQueueClaim = {
  id: number;
  memberName: string | null;
  customerId: string | null;
  market: string | null;
  vinLastSix: string | null;
  reportedVinLastSix: string | null;
  vinCorrectionEvidence: string | null;
  memberPhone: string | null;
  preferredLanguage: string | null;
  dateOfLoss: string | null;
  postedAt: Date;
  slackPermalink: string | null;
  sourceChannel: string;
  onSiteFlag: boolean;
  onSiteReason: string | null;
  inspectionScheduledAt: Date | null;
  inspectionScheduleSource: string | null;
  firstContactAt: Date | null;
  firstResponseBusinessMinutes: number | null;
  contactAttempts: number;
  completedAt: Date | null;
  templatePostedAt: Date | null;
  factsOfLoss: string | null;
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  claimedByHandlerId: number | null;
  claimedByName: string | null;
  claimedAt: Date | null;
  slaState: "within_sla" | "at_risk" | "breached";
  slaTargetBusinessMinutes: number | null;
};

function etDateKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function isTodayEastern(value: Date | null, now: Date) {
  return value ? etDateKey(value) === etDateKey(now) : false;
}

export async function listLossIntakeSharedQueue() {
  const db = await getDb();
  if (!db) return [] as IntakeQueueClaim[];
  const rows = await db.select({
    id: lossIntakeClaims.id,
    memberName: lossIntakeClaims.memberName,
    customerId: lossIntakeClaims.customerId,
    market: lossIntakeClaims.market,
    vinLastSix: lossIntakeClaims.vinLastSix,
    reportedVinLastSix: lossIntakeClaims.reportedVinLastSix,
    vinCorrectionEvidence: lossIntakeClaims.vinCorrectionEvidence,
    memberPhone: lossIntakeClaims.memberPhone,
    preferredLanguage: lossIntakeClaims.preferredLanguage,
    dateOfLoss: lossIntakeClaims.dateOfLoss,
    postedAt: lossIntakeClaims.postedAt,
    slackPermalink: lossIntakeClaims.slackPermalink,
    sourceChannel: lossIntakeClaims.channelName,
    onSiteFlag: lossIntakeClaims.onSiteFlag,
    onSiteReason: lossIntakeClaims.onSiteReason,
    inspectionScheduledAt: lossIntakeClaims.inspectionScheduledAt,
    inspectionScheduleSource: lossIntakeClaims.inspectionScheduleSource,
    firstContactAt: lossIntakeClaims.firstContactAt,
    firstResponseBusinessMinutes: lossIntakeClaims.firstResponseBusinessMinutes,
    contactAttempts: lossIntakeClaims.contactAttempts,
    completedAt: lossIntakeClaims.completedAt,
    templatePostedAt: lossIntakeClaims.templatePostedAt,
    factsOfLoss: lossIntakeClaims.factsOfLoss,
    preliminaryLiability: lossIntakeClaims.preliminaryLiability,
    rideshareStatus: lossIntakeClaims.rideshareStatus,
    claimedByHandlerId: lossIntakeClaims.intakeClaimedByHandlerId,
    claimedByName: lossIntakeClaims.intakeClaimedByName,
    claimedAt: lossIntakeClaims.intakeClaimedAt,
    slaState: lossIntakeClaims.slaState,
    slaTargetBusinessMinutes: lossIntakeClaims.slaTargetBusinessMinutes,
  }).from(lossIntakeClaims).where(and(
    eq(lossIntakeClaims.isDuplicate, false),
    inArray(lossIntakeClaims.channelName, [...INTAKE_SOURCE_CHANNELS]),
    isNull(lossIntakeClaims.completedAt),
  )).orderBy(asc(lossIntakeClaims.postedAt)).limit(500);
  return rows as IntakeQueueClaim[];
}

export async function claimLossIntakeItem(input: { claimId: number; handlerId: number; handlerName: string; now?: Date }) {
  if (!INTAKE_REP_HANDLER_IDS.has(input.handlerId)) throw new Error("Only Ana Padilla, Bennet Carlos, and Carlito Legarde Jr may claim Intake Dispatch work.");
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = input.now ?? new Date();
  const result = await db.update(lossIntakeClaims).set({
    intakeClaimedByHandlerId: input.handlerId,
    intakeClaimedByName: input.handlerName,
    intakeClaimedAt: now,
  }).where(and(
    eq(lossIntakeClaims.id, input.claimId),
    eq(lossIntakeClaims.isDuplicate, false),
    inArray(lossIntakeClaims.channelName, [...INTAKE_SOURCE_CHANNELS]),
    or(isNull(lossIntakeClaims.intakeClaimedByHandlerId), eq(lossIntakeClaims.intakeClaimedByHandlerId, input.handlerId)),
  ));
  const header = Array.isArray(result) ? result[0] : result;
  if (Number((header as { affectedRows?: number }).affectedRows ?? 0) === 0) {
    throw new Error("Another Intake rep claimed this item first. Refresh the live queue before continuing.");
  }
  return { claimId: input.claimId, claimedByHandlerId: input.handlerId, claimedByName: input.handlerName };
}

export async function releaseLossIntakeItem(input: { claimId: number; handlerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(lossIntakeClaims).set({ intakeClaimedByHandlerId: null, intakeClaimedByName: null, intakeClaimedAt: null }).where(and(
    eq(lossIntakeClaims.id, input.claimId),
    eq(lossIntakeClaims.intakeClaimedByHandlerId, input.handlerId),
  ));
  return { claimId: input.claimId, released: true };
}

export async function refreshLossIntakeDailyMetrics(now = new Date()) {
  const db = await getDb();
  if (!db) return [];
  const dateKey = etDateKey(now);
  // Metrics cover the whole day, including completed items that have correctly
  // left the live work queue.
  const rows = await db.select({
    claimedByHandlerId: lossIntakeClaims.intakeClaimedByHandlerId,
    claimedByName: lossIntakeClaims.intakeClaimedByName,
    claimedAt: lossIntakeClaims.intakeClaimedAt,
    firstContactAt: lossIntakeClaims.firstContactAt,
    firstResponseBusinessMinutes: lossIntakeClaims.firstResponseBusinessMinutes,
    completedAt: lossIntakeClaims.completedAt,
    templatePostedAt: lossIntakeClaims.templatePostedAt,
  }).from(lossIntakeClaims).where(and(
    eq(lossIntakeClaims.isDuplicate, false),
    inArray(lossIntakeClaims.channelName, [...INTAKE_SOURCE_CHANNELS]),
  ));
  const metrics = Array.from(INTAKE_REP_HANDLER_IDS).map(handlerId => {
    const owned = rows.filter(row => row.claimedByHandlerId === handlerId);
    const sample = owned.find(row => row.claimedByName)?.claimedByName ?? INTAKE_REP_NAMES[handlerId];
    const firstResponseValues = owned.map(row => row.firstResponseBusinessMinutes).filter((value): value is number => value !== null).sort((a, b) => a - b);
    const midpoint = Math.floor(firstResponseValues.length / 2);
    const medianBusinessMinutes = firstResponseValues.length === 0 ? null : firstResponseValues.length % 2 ? firstResponseValues[midpoint] : (firstResponseValues[midpoint - 1] + firstResponseValues[midpoint]) / 2;
    return {
      dateKey,
      handlerId,
      handlerName: sample,
      itemsClaimed: owned.filter(row => isTodayEastern(row.claimedAt, now)).length,
      firstContacts: owned.filter(row => isTodayEastern(row.firstContactAt, now)).length,
      statementsObtained: owned.filter(row => isTodayEastern(row.completedAt, now)).length,
      templatesPosted: owned.filter(row => isTodayEastern(row.templatePostedAt, now)).length,
      openAtClose: owned.filter(row => !row.completedAt).length,
      medianBusinessMinutes,
      snapshotAt: now,
    };
  });
  for (const metric of metrics) {
    await db.insert(lossIntakeDailyMetrics).values(metric).onDuplicateKeyUpdate({ set: {
      handlerName: metric.handlerName,
      itemsClaimed: metric.itemsClaimed,
      firstContacts: metric.firstContacts,
      statementsObtained: metric.statementsObtained,
      templatesPosted: metric.templatesPosted,
      openAtClose: metric.openAtClose,
      medianBusinessMinutes: metric.medianBusinessMinutes,
      snapshotAt: metric.snapshotAt,
    } });
  }
  return metrics;
}

export async function getLossIntakeDailyMetrics(now = new Date()) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lossIntakeDailyMetrics).where(eq(lossIntakeDailyMetrics.dateKey, etDateKey(now))).orderBy(lossIntakeDailyMetrics.handlerName);
}

export function sharedQueueDepth(rows: IntakeQueueClaim[]) {
  const open = rows.filter(row => !row.completedAt);
  return {
    store: open.filter(row => row.sourceChannel === "claims").length,
    remote: open.filter(row => row.sourceChannel === "remote-markets").length,
    escalations: open.filter(row => row.sourceChannel === "escalations").length,
  };
}
