import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import {
  handlers,
  lossIntakeClaims,
  lossIntakeEvents,
  lossIntakeQas,
  lossIntakeQualityItems,
  lossIntakeSettings,
  lossIntakeSyncRuns,
  type InsertLossIntakeClaim,
  type InsertLossIntakeEvent,
  type InsertLossIntakeQa,
  type InsertLossIntakeQualityItem,
  type InsertLossIntakeSetting,
} from "../drizzle/schema";
import { getDb } from "./db";
import type {
  ParsedLossParent,
  ThreadAnalysis,
} from "./lossIntakeDomain";

export const DEFAULT_LOSS_INTAKE_SETTINGS = {
  configKey: "default",
  claimsChannelId: "CHWRXH4HK",
  remoteMarketsChannelId: "C092UPKR79D",
  firstContactSlaMinutes: 10,
  atRiskMinutes: 7,
  qaDueHours: 24,
  scoringWeights: {
    first_contact_sla: 30,
    facts_of_loss: 10,
    fol_quality: 10,
    preliminary_liability: 15,
    rideshare_status: 10,
    photo_evidence: 10,
    attempt_documentation: 5,
    store_team_tagged: 10,
    tesla_footage_request: 10,
  },
  agentAssignments: [],
  lastSuccessfulSyncAt: null,
  lastSyncError: null,
  scheduleCronTaskUid: null,
} satisfies InsertLossIntakeSetting;

function requireDb<T>(db: T | null): T {
  if (!db) throw new Error("Database not available");
  return db;
}

export async function ensureLossIntakeSettings() {
  const db = requireDb(await getDb());
  await db
    .insert(lossIntakeSettings)
    .values(DEFAULT_LOSS_INTAKE_SETTINGS)
    .onDuplicateKeyUpdate({ set: { configKey: "default" } });
  return getLossIntakeSettings();
}

export async function getLossIntakeSettings() {
  const db = await getDb();
  if (!db) return DEFAULT_LOSS_INTAKE_SETTINGS;
  const rows = await db
    .select()
    .from(lossIntakeSettings)
    .where(eq(lossIntakeSettings.configKey, "default"))
    .limit(1);
  return rows[0] ?? DEFAULT_LOSS_INTAKE_SETTINGS;
}

export async function updateLossIntakeSettings(
  patch: Partial<InsertLossIntakeSetting>,
  updatedBy: string,
) {
  const db = requireDb(await getDb());
  await ensureLossIntakeSettings();
  await db
    .update(lossIntakeSettings)
    .set({ ...patch, updatedBy })
    .where(eq(lossIntakeSettings.configKey, "default"));
  return getLossIntakeSettings();
}

export async function listLossIntakeHandlers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: handlers.id,
      name: handlers.name,
      email: handlers.email,
      active: handlers.active,
    })
    .from(handlers)
    .where(eq(handlers.active, true))
    .orderBy(handlers.name);
}

export async function upsertLossIntakeClaimBundle(input: {
  parent: ParsedLossParent;
  analysis: ThreadAnalysis;
}) {
  const db = requireDb(await getDb());
  const values: InsertLossIntakeClaim = {
    slackKey: input.parent.slackKey,
    channelId: input.parent.channelId,
    channelName: input.parent.channelName,
    slackMessageTs: input.parent.slackMessageTs,
    slackPermalink: input.parent.slackPermalink,
    postedAt: input.parent.postedAt,
    memberName: input.parent.memberName,
    customerId: input.parent.customerId,
    vinLastSix: input.parent.vinLastSix,
    market: input.parent.market,
    vehicleType: input.parent.vehicleType,
    assignedHandlerId: input.analysis.assignedHandlerId,
    assignedAgent: input.analysis.assignedAgent,
    stage: input.analysis.stage,
    hasPhotos: input.parent.hasPhotos,
    attachmentCount: input.parent.attachmentCount,
    firstContactAt: input.analysis.firstContactAt,
    firstContactMinutes: input.analysis.firstContactMinutes,
    slaState: input.analysis.slaState,
    slaType: input.analysis.slaType,
    slaDeadlineAt: input.analysis.slaDeadlineAt,
    completedAt: input.analysis.completedAt,
    intakeCycleMinutes: input.analysis.intakeCycleMinutes,
    factsOfLoss: input.analysis.factsOfLoss,
    preliminaryLiability: input.analysis.preliminaryLiability,
    rideshareStatus: input.analysis.rideshareStatus,
    noAnswerAttempts: input.analysis.noAnswerAttempts,
    contactAttempts: input.analysis.contactAttempts,
    dateOfLoss: input.parent.dateOfLoss,
    templatePostedAt: input.analysis.templatePostedAt,
    templatePostMinutesFromContact: input.analysis.templatePostMinutesFromContact,
    templatePostMinutesFromReport: input.analysis.templatePostMinutesFromReport,
    storeTeamTagged: input.analysis.storeTeamTagged,
    folQualityScore: input.analysis.folQualityScore,
    teslaFootageRequested: input.analysis.teslaFootageRequested,
    qualityScore: input.analysis.qualityScore,
    missingElements: JSON.stringify(input.analysis.missingElements),
    lastSyncedAt: new Date(),
  };

  await db.insert(lossIntakeClaims).values(values).onDuplicateKeyUpdate({
    set: {
      slackPermalink: values.slackPermalink,
      memberName: values.memberName,
      customerId: values.customerId,
      vinLastSix: values.vinLastSix,
      market: values.market,
      vehicleType: values.vehicleType,
      assignedHandlerId: values.assignedHandlerId,
      assignedAgent: values.assignedAgent,
      stage: values.stage,
      hasPhotos: values.hasPhotos,
      attachmentCount: values.attachmentCount,
      firstContactAt: values.firstContactAt,
      firstContactMinutes: values.firstContactMinutes,
      slaState: values.slaState,
      slaType: values.slaType,
      slaDeadlineAt: values.slaDeadlineAt,
      completedAt: values.completedAt,
      intakeCycleMinutes: values.intakeCycleMinutes,
      factsOfLoss: values.factsOfLoss,
      preliminaryLiability: values.preliminaryLiability,
      rideshareStatus: values.rideshareStatus,
      noAnswerAttempts: values.noAnswerAttempts,
      contactAttempts: values.contactAttempts,
      dateOfLoss: values.dateOfLoss,
      templatePostedAt: values.templatePostedAt,
      templatePostMinutesFromContact: values.templatePostMinutesFromContact,
      templatePostMinutesFromReport: values.templatePostMinutesFromReport,
      storeTeamTagged: values.storeTeamTagged,
      folQualityScore: values.folQualityScore,
      teslaFootageRequested: values.teslaFootageRequested,
      qualityScore: values.qualityScore,
      missingElements: values.missingElements,
      lastSyncedAt: values.lastSyncedAt,
    },
  });

  const claimRows = await db
    .select({ id: lossIntakeClaims.id })
    .from(lossIntakeClaims)
    .where(eq(lossIntakeClaims.slackKey, input.parent.slackKey))
    .limit(1);
  const claimId = claimRows[0]?.id;
  if (!claimId) throw new Error("Loss Intake claim upsert did not return a claim ID");

  if (input.analysis.events.length > 0) {
    const eventValues: InsertLossIntakeEvent[] = input.analysis.events.map(event => ({
      slackEventKey: event.slackEventKey,
      claimId,
      slackEventTs: event.slackEventTs,
      occurredAt: event.occurredAt,
      actorSlackUserId: event.actorSlackUserId,
      actorName: event.actorName,
      eventType: event.eventType,
      body: event.body,
      metadata: event.metadata,
    }));
    for (const event of eventValues) {
      await db.insert(lossIntakeEvents).values(event).onDuplicateKeyUpdate({
        set: {
          actorSlackUserId: event.actorSlackUserId,
          actorName: event.actorName,
          eventType: event.eventType,
          body: event.body,
          metadata: event.metadata,
        },
      });
    }
  }

  await db
    .delete(lossIntakeQualityItems)
    .where(eq(lossIntakeQualityItems.claimId, claimId));
  if (input.analysis.qualityItems.length > 0) {
    const qualityValues: InsertLossIntakeQualityItem[] =
      input.analysis.qualityItems.map(item => ({
        claimId,
        criterion: item.criterion,
        result: item.result,
        points: item.points,
        maxPoints: item.maxPoints,
        evidence: item.evidence,
        coachingNote: item.coachingNote,
      }));
    await db.insert(lossIntakeQualityItems).values(qualityValues);
  }

  return claimId;
}

/** Called when @claims-intake is tagged in a remote-ops thread — starts the SLA clock on the existing claim */
export async function updateClaimsIntakeTag(input: {
  slackKey: string;
  taggedAt: number; // Unix ms
  slaType: "business_hours" | "after_hours";
  slaDeadlineAt: number; // Unix ms
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(lossIntakeClaims)
    .set({
      claimsIntakeTaggedAt: input.taggedAt,
      claimsIntakeSlaType: input.slaType,
      claimsIntakeSlaDeadlineAt: input.slaDeadlineAt,
    })
    .where(eq(lossIntakeClaims.slackKey, input.slackKey));
}

export async function getLossIntakeThreadState(
  channelId: string,
  threadTs: string,
) {
  const db = await getDb();
  if (!db) return null;
  const claimRows = await db
    .select()
    .from(lossIntakeClaims)
    .where(
      and(
        eq(lossIntakeClaims.channelId, channelId),
        eq(lossIntakeClaims.slackMessageTs, threadTs),
      ),
    )
    .limit(1);
  const claim = claimRows[0];
  if (!claim) return null;
  const events = await db
    .select()
    .from(lossIntakeEvents)
    .where(eq(lossIntakeEvents.claimId, claim.id))
    .orderBy(lossIntakeEvents.occurredAt);
  return { claim, events };
}

export interface LossClaimListFilters {
  search?: string;
  stage?: "awaiting_outreach" | "outreach_started" | "contact_attempts" | "complete";
  slaState?: "within_sla" | "at_risk" | "breached";
  vehicleType?: "gas" | "ev_tesla" | "unknown";
  dateFrom?: Date;
  dateTo?: Date;
  handlerId?: number;
  agentName?: string;
  limit?: number;
  offset?: number;
}

function buildClaimConditions(filters: LossClaimListFilters) {
  const conditions = [];
  if (filters.handlerId !== undefined) {
    conditions.push(eq(lossIntakeClaims.assignedHandlerId, filters.handlerId));
  }
  if (filters.agentName) {
    conditions.push(eq(lossIntakeClaims.assignedAgent, filters.agentName));
  }
  if (filters.stage) conditions.push(eq(lossIntakeClaims.stage, filters.stage));
  if (filters.slaState) conditions.push(eq(lossIntakeClaims.slaState, filters.slaState));
  if (filters.vehicleType) {
    conditions.push(eq(lossIntakeClaims.vehicleType, filters.vehicleType));
  }
  if (filters.dateFrom) conditions.push(gte(lossIntakeClaims.postedAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(lossIntakeClaims.postedAt, filters.dateTo));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(lossIntakeClaims.market, term),
        like(lossIntakeClaims.memberName, term),
        like(lossIntakeClaims.customerId, term),
        like(lossIntakeClaims.vinLastSix, term),
        like(lossIntakeClaims.assignedAgent, term),
      ),
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function listLossIntakeClaims(filters: LossClaimListFilters) {
  const db = await getDb();
  if (!db) return { claims: [], total: 0 };
  const where = buildClaimConditions(filters);
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const [claims, totalRows] = await Promise.all([
    db
      .select()
      .from(lossIntakeClaims)
      .where(where)
      .orderBy(desc(lossIntakeClaims.postedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(lossIntakeClaims)
      .where(where),
  ]);
  return { claims, total: Number(totalRows[0]?.count ?? 0) };
}

export async function getLossIntakeClaimDetail(
  claimId: number,
  handlerId?: number,
) {
  const db = await getDb();
  if (!db) return null;
  const where =
    handlerId === undefined
      ? eq(lossIntakeClaims.id, claimId)
      : and(
          eq(lossIntakeClaims.id, claimId),
          eq(lossIntakeClaims.assignedHandlerId, handlerId),
        );
  const claimRows = await db.select().from(lossIntakeClaims).where(where).limit(1);
  const claim = claimRows[0];
  if (!claim) return null;
  const [events, qualityItems, qas] = await Promise.all([
    db
      .select()
      .from(lossIntakeEvents)
      .where(eq(lossIntakeEvents.claimId, claimId))
      .orderBy(lossIntakeEvents.occurredAt),
    db
      .select()
      .from(lossIntakeQualityItems)
      .where(eq(lossIntakeQualityItems.claimId, claimId)),
    db
      .select()
      .from(lossIntakeQas)
      .where(eq(lossIntakeQas.claimId, claimId))
      .orderBy(desc(lossIntakeQas.draftedAt)),
  ]);
  return { claim, events, qualityItems, qas };
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export async function getLossIntakeOverview(filters: {
  handlerId?: number;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const { claims } = await listLossIntakeClaims({
    ...filters,
    limit: 200,
    offset: 0,
  });
  const total = claims.length;
  const started = claims.filter(claim => claim.firstContactMinutes !== null);
  const completed = claims.filter(claim => claim.completedAt !== null);
  const onTime = started.filter(
    claim => (claim.firstContactMinutes ?? Number.POSITIVE_INFINITY) <= 10,
  ).length;
  const byStage = {
    awaiting_outreach: 0,
    outreach_started: 0,
    contact_attempts: 0,
    complete: 0,
  };
  const bySla = { within_sla: 0, at_risk: 0, breached: 0 };
  const byHandler = new Map<
    string,
    {
      handlerId: number | null;
      handlerName: string;
      total: number;
      completed: number;
      breached: number;
      scoreTotal: number;
      scored: number;
    }
  >();
  const daily = new Map<string, { date: string; total: number; breached: number }>();

  for (const claim of claims) {
    byStage[claim.stage] += 1;
    bySla[claim.slaState] += 1;
    const handlerName = claim.assignedAgent ?? "Unassigned";
    const handler = byHandler.get(handlerName) ?? {
      handlerId: claim.assignedHandlerId,
      handlerName,
      total: 0,
      completed: 0,
      breached: 0,
      scoreTotal: 0,
      scored: 0,
    };
    handler.total += 1;
    if (claim.completedAt) handler.completed += 1;
    if (claim.slaState === "breached") handler.breached += 1;
    if (claim.qualityScore !== null) {
      handler.scoreTotal += claim.qualityScore;
      handler.scored += 1;
    }
    byHandler.set(handlerName, handler);

    const date = claim.postedAt.toISOString().slice(0, 10);
    const day = daily.get(date) ?? { date, total: 0, breached: 0 };
    day.total += 1;
    if (claim.slaState === "breached") day.breached += 1;
    daily.set(date, day);
  }

  return {
    totalClaims: total,
    pendingClaims: total - completed.length,
    averageFirstContactMinutes: average(
      started.map(claim => claim.firstContactMinutes),
    ),
    averageIntakeCycleMinutes: average(
      completed.map(claim => claim.intakeCycleMinutes),
    ),
    averageQualityScore: average(claims.map(claim => claim.qualityScore)),
    onTimeRate: started.length ? (onTime / started.length) * 100 : null,
    breachedCount: bySla.breached,
    byStage,
    bySla,
    byHandler: Array.from(byHandler.values())
      .map(handler => ({
        ...handler,
        averageScore: handler.scored
          ? handler.scoreTotal / handler.scored
          : null,
      }))
      .sort((left, right) => right.total - left.total),
    daily: Array.from(daily.values()).sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
}

export async function createLossIntakeQa(data: InsertLossIntakeQa) {
  const db = requireDb(await getDb());
  const result = await db.insert(lossIntakeQas).values(data);
  return Number((result[0] as { insertId?: number }).insertId ?? 0);
}

export async function listLossIntakeQas(handlerId?: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ qa: lossIntakeQas, claim: lossIntakeClaims })
    .from(lossIntakeQas)
    .innerJoin(lossIntakeClaims, eq(lossIntakeQas.claimId, lossIntakeClaims.id))
    .where(handlerId === undefined ? undefined : eq(lossIntakeQas.handlerId, handlerId))
    .orderBy(desc(lossIntakeQas.draftedAt));
  return rows;
}

export async function updateLossIntakeQa(
  qaId: number,
  patch: Partial<InsertLossIntakeQa>,
  handlerId?: number,
) {
  const db = requireDb(await getDb());
  const where =
    handlerId === undefined
      ? eq(lossIntakeQas.id, qaId)
      : and(eq(lossIntakeQas.id, qaId), eq(lossIntakeQas.handlerId, handlerId));
  await db.update(lossIntakeQas).set(patch).where(where);
}

export async function startLossIntakeSyncRun() {
  const db = requireDb(await getDb());
  const result = await db.insert(lossIntakeSyncRuns).values({ status: "running" });
  return Number((result[0] as { insertId?: number }).insertId ?? 0);
}

export async function finishLossIntakeSyncRun(
  runId: number,
  result: {
    status: "success" | "failed";
    claimsDiscovered?: number;
    claimsUpdated?: number;
    eventsProcessed?: number;
    errorMessage?: string | null;
  },
) {
  const db = requireDb(await getDb());
  await db
    .update(lossIntakeSyncRuns)
    .set({
      ...result,
      completedAt: new Date(),
    })
    .where(eq(lossIntakeSyncRuns.id, runId));
  await ensureLossIntakeSettings();
  await db
    .update(lossIntakeSettings)
    .set(
      result.status === "success"
        ? { lastSuccessfulSyncAt: new Date(), lastSyncError: null }
        : { lastSyncError: result.errorMessage ?? "Loss Intake sync failed" },
    )
    .where(eq(lossIntakeSettings.configKey, "default"));
}

export async function getLatestLossIntakeSyncRun() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(lossIntakeSyncRuns)
    .orderBy(desc(lossIntakeSyncRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLossIntakeSettingsByScheduleTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(lossIntakeSettings)
    .where(eq(lossIntakeSettings.scheduleCronTaskUid, taskUid))
    .limit(1);
  return rows[0] ?? null;
}

export interface TodayRepActivityClaim {
  claimId: number;
  memberName: string | null;
  customerId: string | null;
  vinLastSix: string | null;
  market: string | null;
  channelName: string;
  postedAt: Date;
  stage: string;
  slaState: string;
  slaType: string;
  slaDeadlineAt: Date | null;
  firstContactAt: Date | null;
  firstContactMinutes: number | null;
  completedAt: Date | null;
  templatePostedAt: Date | null;
  templatePostMinutesFromReport: number | null;
  contactAttempts: number;
  factsOfLoss: string | null;
  slackPermalink: string | null;
  events: Array<{
    eventType: string;
    occurredAt: Date;
    actorName: string | null;
    body: string | null;
  }>;
}

export interface TodayRepActivityHandler {
  handlerId: number;
  handlerName: string;
  claims: TodayRepActivityClaim[];
  completedCount: number;
  contactAttemptedCount: number;
  awaitingCount: number;
}

/**
 * Get all Loss Intake claims that were posted or updated today (ET date),
 * grouped by assigned handler. Used for the "Today's Activity" view.
 */
export async function getTodayRepActivity(dateMs?: number): Promise<TodayRepActivityHandler[]> {
  const db = await getDb();
  if (!db) return [];

  // Default to today in ET (UTC-4 or UTC-5 depending on DST)
  const now = dateMs ? new Date(dateMs) : new Date();
  // ET offset: approximate as UTC-4 (EDT) for summer
  const ET_OFFSET_MS = 4 * 60 * 60 * 1000;
  const etNow = new Date(now.getTime() - ET_OFFSET_MS);
  const etDateStr = etNow.toISOString().slice(0, 10); // YYYY-MM-DD
  const dayStartEt = new Date(`${etDateStr}T00:00:00.000Z`);
  const dayEndEt = new Date(`${etDateStr}T23:59:59.999Z`);
  // Convert back to UTC for DB query
  const dayStartUtc = new Date(dayStartEt.getTime() + ET_OFFSET_MS);
  const dayEndUtc = new Date(dayEndEt.getTime() + ET_OFFSET_MS);

  // Get all claims posted today OR updated today (firstContactAt or completedAt today)
  const claims = await db
    .select()
    .from(lossIntakeClaims)
    .where(
      and(
        gte(lossIntakeClaims.postedAt, dayStartUtc),
        lte(lossIntakeClaims.postedAt, dayEndUtc),
      ),
    )
    .orderBy(lossIntakeClaims.postedAt);

  if (claims.length === 0) return [];

  // Get events for all these claims
  const claimIds = claims.map(c => c.id);
  const events = await db
    .select()
    .from(lossIntakeEvents)
    .where(
      and(
        sql`${lossIntakeEvents.claimId} IN (${sql.join(claimIds.map(id => sql`${id}`), sql`, `)})`,
        gte(lossIntakeEvents.occurredAt, dayStartUtc),
        lte(lossIntakeEvents.occurredAt, dayEndUtc),
      ),
    )
    .orderBy(lossIntakeEvents.occurredAt);

  // Group events by claimId
  const eventsByClaimId = new Map<number, typeof events>();
  for (const event of events) {
    const list = eventsByClaimId.get(event.claimId) ?? [];
    list.push(event);
    eventsByClaimId.set(event.claimId, list);
  }

  // Group claims by handler
  const byHandler = new Map<
    string,
    { handlerId: number; handlerName: string; claims: TodayRepActivityClaim[] }
  >();

  for (const claim of claims) {
    const handlerKey = claim.assignedHandlerId?.toString() ?? "unassigned";
    const handlerName = claim.assignedAgent ?? "Unassigned";
    const handlerId = claim.assignedHandlerId ?? 0;

    const entry = byHandler.get(handlerKey) ?? {
      handlerId,
      handlerName,
      claims: [],
    };

    const claimEvents = (eventsByClaimId.get(claim.id) ?? []).map(e => ({
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      actorName: e.actorName,
      body: e.body ?? null,
    }));

    entry.claims.push({
      claimId: claim.id,
      memberName: claim.memberName,
      customerId: claim.customerId,
      vinLastSix: claim.vinLastSix,
      market: claim.market,
      channelName: claim.channelName,
      postedAt: claim.postedAt,
      stage: claim.stage,
      slaState: claim.slaState,
      slaType: claim.slaType,
      slaDeadlineAt: claim.slaDeadlineAt ?? null,
      firstContactAt: claim.firstContactAt ?? null,
      firstContactMinutes: claim.firstContactMinutes ?? null,
      completedAt: claim.completedAt ?? null,
      templatePostedAt: claim.templatePostedAt ?? null,
      templatePostMinutesFromReport: claim.templatePostMinutesFromReport ?? null,
      contactAttempts: claim.contactAttempts ?? 0,
      factsOfLoss: claim.factsOfLoss ?? null,
      slackPermalink: claim.slackPermalink ?? null,
      events: claimEvents,
    });

    byHandler.set(handlerKey, entry);
  }

  // Convert to array with summary counts
  return Array.from(byHandler.values())
    .map(handler => ({
      ...handler,
      completedCount: handler.claims.filter(c => c.stage === "complete").length,
      contactAttemptedCount: handler.claims.filter(
        c => c.stage === "outreach_started" || c.stage === "contact_attempts",
      ).length,
      awaitingCount: handler.claims.filter(c => c.stage === "awaiting_outreach").length,
    }))
    .sort((a, b) => {
      // Sort: known handlers first, then by name
      if (a.handlerId > 0 && b.handlerId === 0) return -1;
      if (a.handlerId === 0 && b.handlerId > 0) return 1;
      return a.handlerName.localeCompare(b.handlerName);
    });
}


// ─── Rep Comparison & Handler Stats ──────────────────────────────────────────

export type RepComparisonPeriod = "today" | "week" | "month" | "ytd";

export interface RepPeriodStats {
  agentName: string;
  /** Primary assignment channel/market label */
  assignment: string;
  /** Total threads assigned in period */
  total: number;
  /** Threads with template posted */
  completed: number;
  /** Completion % */
  completionPct: number;
  /** Threads still awaiting first outreach */
  awaiting: number;
  /** Threads in active outreach (started or attempts) */
  inOutreach: number;
  /** Threads with slaState = breached */
  slaBreaches: number;
  /** Average minutes from FNOL posted to first contact (null if no contacts yet) */
  avgFirstContactMin: number | null;
  /** Total contact attempts logged */
  totalAttempts: number;
  /** Threads in #claims (in-store) */
  instoreTotal: number;
  /** Threads in #claims-remotemarkets */
  remoteTotal: number;
}

function periodWhereClause(period: RepComparisonPeriod, col: string): string {
  switch (period) {
    case "today":
      return `DATE(${col}) = CURDATE()`;
    case "week":
      return `YEARWEEK(${col}, 1) = YEARWEEK(CURDATE(), 1)`;
    case "month":
      return `MONTH(${col}) = MONTH(CURDATE()) AND YEAR(${col}) = YEAR(CURDATE())`;
    case "ytd":
      return `YEAR(${col}) = YEAR(CURDATE())`;
    default:
      return `YEAR(${col}) = YEAR(CURDATE())`;
  }
}

/**
 * Returns side-by-side comparison metrics for all 3 loss intake reps
 * (Ana Padilla, Bennet Carlos, Carlito Legarde Jr) for the given period.
 * All numbers come directly from the loss_intake_claims table — no estimates.
 */
export async function getRepComparisonMetrics(
  period: RepComparisonPeriod = "month",
): Promise<RepPeriodStats[]> {
  const db = await getDb();
  if (!db) return [];

  const whereClause = periodWhereClause(period, "postedAt");

  const rawResult = await db.execute(sql.raw(`
    SELECT
      assignedAgent,
      channelName,
      COUNT(*) AS total,
      SUM(CASE WHEN templatePostedAt IS NOT NULL OR contactAttempts >= 2 THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN stage = 'awaiting_outreach' THEN 1 ELSE 0 END) AS awaiting,
      SUM(CASE WHEN stage IN ('outreach_started','contact_attempts') AND templatePostedAt IS NULL AND contactAttempts < 2 THEN 1 ELSE 0 END) AS inOutreach,
      SUM(CASE WHEN slaState = 'breached' THEN 1 ELSE 0 END) AS slaBreaches,
      ROUND(AVG(CASE WHEN firstContactMinutes IS NOT NULL THEN firstContactMinutes END), 1) AS avgFirstContactMin,
      SUM(COALESCE(contactAttempts, 0)) AS totalAttempts,
      COUNT(CASE WHEN firstContactMinutes IS NOT NULL THEN 1 END) AS contactedCount,
      SUM(CASE WHEN firstContactMinutes IS NOT NULL THEN firstContactMinutes ELSE 0 END) AS contactedSum
    FROM loss_intake_claims
    WHERE assignedAgent IS NOT NULL
      AND ${whereClause}
    GROUP BY assignedAgent, channelName
    ORDER BY assignedAgent, channelName
  `));
  const rows = ((rawResult as any[][])[0] ?? []) as Array<{
    assignedAgent: string;
    channelName: string;
    total: number;
    completed: number;
    awaiting: number;
    inOutreach: number;
    slaBreaches: number;
    avgFirstContactMin: number | null;
    totalAttempts: number;
    contactedCount: number;
    contactedSum: number;
  }>;

  // Aggregate by agent across channels
  const byAgent = new Map<string, RepPeriodStats>();

  const AGENT_ASSIGNMENTS: Record<string, string> = {
    "Ana Padilla": "Cleveland + Remote Markets + In-Store Overflow",
    "Bennet Carlos": "Glen Burnie + Atlanta (In-Store)",
    "Carlito Legarde Jr": "Rockville + Chicago (In-Store)",
  };

  // Track weighted sum/count for proper avg first contact
  const agentContactedSum = new Map<string, number>();
  const agentContactedCount = new Map<string, number>();

  for (const row of rows) {
    const agent = row.assignedAgent;
    const isRemote = row.channelName === "claims-remotemarkets";
    const cSum = Number(row.contactedSum ?? 0);
    const cCount = Number(row.contactedCount ?? 0);

    agentContactedSum.set(agent, (agentContactedSum.get(agent) ?? 0) + cSum);
    agentContactedCount.set(agent, (agentContactedCount.get(agent) ?? 0) + cCount);

    const existing = byAgent.get(agent);
    if (!existing) {
      byAgent.set(agent, {
        agentName: agent,
        assignment: AGENT_ASSIGNMENTS[agent] ?? agent,
        total: Number(row.total),
        completed: Number(row.completed),
        completionPct: 0,
        awaiting: Number(row.awaiting),
        inOutreach: Number(row.inOutreach),
        slaBreaches: Number(row.slaBreaches),
        avgFirstContactMin: null, // computed after loop
        totalAttempts: Number(row.totalAttempts),
        instoreTotal: isRemote ? 0 : Number(row.total),
        remoteTotal: isRemote ? Number(row.total) : 0,
      });
    } else {
      existing.total += Number(row.total);
      existing.completed += Number(row.completed);
      existing.awaiting += Number(row.awaiting);
      existing.inOutreach += Number(row.inOutreach);
      existing.slaBreaches += Number(row.slaBreaches);
      existing.totalAttempts += Number(row.totalAttempts);
      if (isRemote) existing.remoteTotal += Number(row.total);
      else existing.instoreTotal += Number(row.total);
    }
  }

  // Apply proper weighted average (1 decimal) for avg first contact
  for (const [agent, stat] of Array.from(byAgent.entries())) {
    const totalSum = agentContactedSum.get(agent) ?? 0;
    const totalCount = agentContactedCount.get(agent) ?? 0;
    stat.avgFirstContactMin = totalCount > 0
      ? Math.round((totalSum / totalCount) * 10) / 10
      : null;
  }

  // Compute completion %
  for (const stat of Array.from(byAgent.values())) {
    stat.completionPct = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
  }

  // Return in canonical order
  const ORDER = ["Bennet Carlos", "Carlito Legarde Jr", "Ana Padilla"];
  return ORDER.map(name => byAgent.get(name)).filter(Boolean) as RepPeriodStats[];
}

/**
 * Returns Loss Intake performance stats for a single agent across multiple periods.
 * Used by individual handler dashboards.
 */
export async function getHandlerLossIntakeStats(agentName: string): Promise<{
  week: RepPeriodStats;
  month: RepPeriodStats;
  ytd: RepPeriodStats;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const AGENT_ASSIGNMENTS: Record<string, string> = {
    "Ana Padilla": "Cleveland + Remote Markets + In-Store Overflow",
    "Bennet Carlos": "Glen Burnie + Atlanta (In-Store)",
    "Carlito Legarde Jr": "Rockville + Chicago (In-Store)",
  };

  const buildStats = async (period: RepComparisonPeriod): Promise<RepPeriodStats> => {
    const whereClause = periodWhereClause(period, "postedAt");
    const rawResult2 = await db.execute(sql.raw(`
      SELECT
        channelName,
        COUNT(*) AS total,
        SUM(CASE WHEN templatePostedAt IS NOT NULL OR contactAttempts >= 2 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN stage = 'awaiting_outreach' THEN 1 ELSE 0 END) AS awaiting,
        SUM(CASE WHEN stage IN ('outreach_started','contact_attempts') AND templatePostedAt IS NULL AND contactAttempts < 2 THEN 1 ELSE 0 END) AS inOutreach,
        SUM(CASE WHEN slaState = 'breached' THEN 1 ELSE 0 END) AS slaBreaches,
        COUNT(CASE WHEN firstContactMinutes IS NOT NULL THEN 1 END) AS contactedCount,
        SUM(CASE WHEN firstContactMinutes IS NOT NULL THEN firstContactMinutes ELSE 0 END) AS contactedSum,
        SUM(COALESCE(contactAttempts, 0)) AS totalAttempts
      FROM loss_intake_claims
      WHERE assignedAgent = '${agentName.replace(/'/g, "''")}'
        AND ${whereClause}
      GROUP BY channelName
    `));
    const rows2 = ((rawResult2 as any[][])[0] ?? []) as Array<{
      channelName: string;
      total: number;
      completed: number;
      awaiting: number;
      inOutreach: number;
      slaBreaches: number;
      contactedCount: number;
      contactedSum: number;
      totalAttempts: number;
    }>;

    let total = 0, completed = 0, awaiting = 0, inOutreach = 0, slaBreaches = 0, totalAttempts = 0;
    let instoreTotal = 0, remoteTotal = 0;
    let contactedSum = 0, contactedCount = 0;

    for (const row of rows2) {
      const isRemote = row.channelName === "claims-remotemarkets";
      total += Number(row.total);
      completed += Number(row.completed);
      awaiting += Number(row.awaiting);
      inOutreach += Number(row.inOutreach);
      slaBreaches += Number(row.slaBreaches);
      totalAttempts += Number(row.totalAttempts);
      contactedSum += Number(row.contactedSum ?? 0);
      contactedCount += Number(row.contactedCount ?? 0);
      if (isRemote) remoteTotal += Number(row.total);
      else instoreTotal += Number(row.total);
    }

    return {
      agentName,
      assignment: AGENT_ASSIGNMENTS[agentName] ?? agentName,
      total,
      completed,
      completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
      awaiting,
      inOutreach,
      slaBreaches,
      avgFirstContactMin: contactedCount > 0
        ? Math.round((contactedSum / contactedCount) * 10) / 10
        : null,
      totalAttempts,
      instoreTotal,
      remoteTotal,
    };
  };

  const [week, month, ytd] = await Promise.all([
    buildStats("week"),
    buildStats("month"),
    buildStats("ytd"),
  ]);

  return { week, month, ytd };
}

/**
 * Returns all claims in awaiting_outreach stage for a given agent (or all agents).
 * Used by the Team Comparison drill-down modal.
 */
export async function getAwaitingOutreachClaims(agentName?: string): Promise<Array<{
  id: number;
  slackKey: string;
  channelName: string;
  slackPermalink: string | null;
  postedAt: Date;
  memberName: string | null;
  customerId: string | null;
  vinLastSix: string | null;
  market: string | null;
  assignedAgent: string | null;
  slaState: string;
  slaDeadlineAt: Date | null;
  firstContactMinutes: number | null;
  contactAttempts: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const agentFilter = agentName
    ? `AND assignedAgent = '${agentName.replace(/'/g, "''")}'`
    : "";

  const rawResult = await db.execute(sql.raw(`
    SELECT
      id, slackKey, channelName, slackPermalink, postedAt,
      memberName, customerId, vinLastSix, market, assignedAgent,
      slaState, slaDeadlineAt, firstContactMinutes, contactAttempts
    FROM loss_intake_claims
    WHERE stage = 'awaiting_outreach'
      ${agentFilter}
    ORDER BY postedAt ASC
  `));

  return ((rawResult as any[][])[0] ?? []) as any[];
}

/**
 * Bulk reassign a list of claim IDs to a new agent.
 * Logs a reassignment event for each claim.
 */
export async function reassignClaims(
  claimIds: number[],
  newAgentName: string,
  newHandlerId: number | null,
): Promise<void> {
  if (claimIds.length === 0) return;
  const db = await getDb();
  if (!db) return;

  const idList = claimIds.join(",");
  const safeName = newAgentName.replace(/'/g, "''");
  const handlerVal = newHandlerId != null ? String(newHandlerId) : "NULL";

  await db.execute(sql.raw(`
    UPDATE loss_intake_claims
    SET assignedAgent = '${safeName}',
        assignedHandlerId = ${handlerVal},
        updatedAt = NOW()
    WHERE id IN (${idList})
  `));

  // Log a reassignment event for each claim
  for (const claimId of claimIds) {
    await db.execute(sql.raw(`
      INSERT INTO loss_intake_events
        (claimId, slackEventKey, slackEventTs, occurredAt, actorSlackUserId, actorName, eventType, body, metadata)
      VALUES
        (${claimId}, CONCAT('reassign:${claimId}:', UNIX_TIMESTAMP(NOW())), UNIX_TIMESTAMP(NOW()), NOW(),
         NULL, 'System', 'other', 'Claim reassigned to ${safeName}', '{}')
    `));
  }
}
