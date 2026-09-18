import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  lossIntakeClaims,
  lossIntakeEvents,
  lossIntakeProcessorVinExclusions,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getClaimsTrackerIndex, normalizeVinFragment } from "./claimsTrackerCorroboration";

const PROCESSOR_SOURCE_CHANNELS = ["claims", "remote-markets", "escalations"] as const;
export type ProcessorQueueStatus = "not_started" | "filing" | "filed" | "not_a_claim";

export type ProcessorCapturedDetails = {
  factsOfLoss: string | null;
  thirdParty: string | null;
  policeReport: string | null;
  tow: string | null;
  rideshare: string | null;
  photosOrFootage: string | null;
  preliminaryLiability: string | null;
  missing: string[];
};

export type ProcessorQueueItem = {
  id: number;
  memberName: string | null;
  customerId: string | null;
  market: string | null;
  vinLastSix: string | null;
  dateOfLoss: string | null;
  postedAt: Date;
  slackPermalink: string | null;
  sourceChannel: string;
  daysUnfiled: number;
  status: ProcessorQueueStatus;
  claimNumber: string | null;
  takenByName: string | null;
  takenAt: Date | null;
  statusUpdatedAt: Date | null;
  filedVisibleUntil: Date | null;
  details: ProcessorCapturedDetails;
};

function validDateOfLoss(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw || /^(?:unknown|n\/?a|unreported)/i.test(raw)) return null;
  // A month/day without year is a partial note, not a valid date of loss. Do
  // not let the runtime guess a century and inflate the unfiled age.
  if (!/(?:\b\d{4}\b|\b\d{1,2}\s*(?:AM|PM)\b)/i.test(raw)) return null;
  const normalized = raw.replace(/(\d)(AM|PM)\b/i, "$1 $2");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localEndOfDayEt(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  // September is EDT; constructing the intended local wall-clock time through the
  // observed offset avoids quietly using the host's timezone.
  const intended = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 23, 59, 59, 999);
  const observed = new Date(intended);
  const observedParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(observed).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const observedLocal = Date.UTC(Number(observedParts.year), Number(observedParts.month) - 1, Number(observedParts.day), Number(observedParts.hour), Number(observedParts.minute));
  const intendedLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 23, 59);
  return new Date(intended + (intendedLocal - observedLocal));
}

function firstMatch(text: string, expression: RegExp) {
  return text.match(expression)?.[1]?.trim() || null;
}

function captureDetails(input: {
  factsOfLoss: string | null;
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  hasPhotos: boolean;
  attachmentCount: number;
  events: Array<{ body: string | null; metadata: unknown }>;
}): ProcessorCapturedDetails {
  const source = input.events.map(event => event.body ?? "").join("\n");
  const thirdParty = firstMatch(source, /(?:third[- ]?party|other (?:driver|vehicle|party)|adverse (?:driver|party))\s*(?:name|vehicle|insurance|carrier)?\s*[:\-–]\s*([^\n]+)/i);
  const policeReport = firstMatch(source, /(?:police|incident)\s*(?:report(?:\s*(?:number|#))?|#)\s*[:\-–]?\s*([^\n]+)/i);
  const tow = firstMatch(source, /(?:tow(?:ing)?|tow company|tow yard|impound)\s*(?:details?|company|provider)?\s*[:\-–]\s*([^\n]+)/i);
  const footageMentioned = /(?:tesla|dash ?cam|footage|video)/i.test(source);
  const photosOrFootage = input.hasPhotos || input.attachmentCount > 0
    ? `${input.attachmentCount || 1} source attachment(s) posted${footageMentioned ? "; footage mentioned" : ""}.`
    : footageMentioned
      ? "Footage is mentioned in the thread."
      : null;
  const missing = [
    !input.factsOfLoss && "facts of loss",
    !thirdParty && "third-party details",
    !policeReport && "police report details",
    !tow && "tow details",
    !input.rideshareStatus && "rideshare status / period",
    !photosOrFootage && "photos or footage status",
    !input.preliminaryLiability && "preliminary liability",
  ].filter((value): value is string => Boolean(value));
  return {
    factsOfLoss: input.factsOfLoss,
    thirdParty,
    policeReport,
    tow,
    rideshare: input.rideshareStatus,
    photosOrFootage,
    preliminaryLiability: input.preliminaryLiability,
    missing,
  };
}

function dayDifference(date: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

export function isProcessorQueueMember(input: {
  vinLastSix: string | null;
  isDuplicate: boolean;
  channelName: string;
  processorStatus: ProcessorQueueStatus;
  processorFiledVisibleUntil: Date | null;
}, filedVins: Set<string>, excludedVins: Set<string>, now: Date) {
  const vin = normalizeVinFragment(input.vinLastSix);
  if (!vin || input.isDuplicate || !PROCESSOR_SOURCE_CHANNELS.includes(input.channelName as (typeof PROCESSOR_SOURCE_CHANNELS)[number])) return false;
  if (excludedVins.has(vin) || filedVins.has(vin) || input.processorStatus === "not_a_claim") return false;
  return input.processorStatus !== "filed" || Boolean(input.processorFiledVisibleUntil && input.processorFiledVisibleUntil.getTime() > now.getTime());
}

/**
 * The Processors queue has a deliberately narrow membership rule:
 * only notices from #claims, #claims-remotemarkets, or #escalations whose
 * six-digit VIN has no row in All Reported IncidentsStatus.
 */
export async function listLossIntakeProcessorQueue(now = new Date()) {
  const db = await getDb();
  if (!db) return { available: false, warning: "Database not available", items: [] as ProcessorQueueItem[] };
  const tracker = await getClaimsTrackerIndex();
  if (!tracker.available) return { available: false, warning: tracker.warning ?? "All Reported IncidentsStatus is unavailable", items: [] as ProcessorQueueItem[] };

  const candidates = await db
    .select()
    .from(lossIntakeClaims)
    .where(and(
      eq(lossIntakeClaims.isDuplicate, false),
      inArray(lossIntakeClaims.channelName, [...PROCESSOR_SOURCE_CHANNELS]),
    ))
    .orderBy(desc(lossIntakeClaims.postedAt))
    .limit(500);

  const vinFragments = Array.from(new Set(candidates.map(item => normalizeVinFragment(item.vinLastSix)).filter(Boolean)));
  const exclusions = vinFragments.length
    ? await db.select().from(lossIntakeProcessorVinExclusions).where(inArray(lossIntakeProcessorVinExclusions.vinLastSix, vinFragments))
    : [];
  const excludedVins = new Set(exclusions.map(exclusion => exclusion.vinLastSix));

  // A six-digit VIN is the confirmed source join. Keep the earliest notice for
  // each fragment, so repeated Slack posts do not present two processors with
  // the same filing task.
  const byVin = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates.sort((left, right) => left.postedAt.getTime() - right.postedAt.getTime())) {
    const vin = normalizeVinFragment(candidate.vinLastSix);
    if (!vin || byVin.has(vin)) continue;
    if (isProcessorQueueMember(candidate, tracker.filedVins, excludedVins, now)) byVin.set(vin, candidate);
  }
  const visible = Array.from(byVin.values());

  const ids = visible.map(claim => claim.id);
  const events = ids.length
    ? await db.select().from(lossIntakeEvents).where(inArray(lossIntakeEvents.claimId, ids))
    : [];
  const eventsByClaim = new Map<number, typeof events>();
  for (const event of events) {
    eventsByClaim.set(event.claimId, [...(eventsByClaim.get(event.claimId) ?? []), event]);
  }

  const items = visible.map(claim => {
    const parsedDateOfLoss = validDateOfLoss(claim.dateOfLoss);
    const dateOfLoss = parsedDateOfLoss ?? claim.postedAt;
    return {
      id: claim.id,
      memberName: claim.memberName,
      customerId: claim.customerId,
      market: claim.market,
      vinLastSix: normalizeVinFragment(claim.vinLastSix) || null,
      dateOfLoss: parsedDateOfLoss ? claim.dateOfLoss : null,
      postedAt: claim.postedAt,
      slackPermalink: claim.slackPermalink,
      sourceChannel: claim.channelName,
      daysUnfiled: dayDifference(dateOfLoss, now),
      status: claim.processorStatus,
      claimNumber: claim.processorClaimNumber,
      takenByName: claim.processorTakenByName,
      takenAt: claim.processorTakenAt,
      statusUpdatedAt: claim.processorStatusUpdatedAt,
      filedVisibleUntil: claim.processorFiledVisibleUntil,
      details: captureDetails({
        factsOfLoss: claim.factsOfLoss,
        preliminaryLiability: claim.preliminaryLiability,
        rideshareStatus: claim.rideshareStatus,
        hasPhotos: claim.hasPhotos,
        attachmentCount: claim.attachmentCount,
        events: eventsByClaim.get(claim.id) ?? [],
      }),
    } satisfies ProcessorQueueItem;
  }).sort((left, right) => (validDateOfLoss(left.dateOfLoss) ?? left.postedAt).getTime() - (validDateOfLoss(right.dateOfLoss) ?? right.postedAt).getTime());

  return { available: true, warning: null, items };
}

export async function updateLossIntakeProcessorStatus(input: {
  claimId: number;
  status: ProcessorQueueStatus;
  claimNumber?: string | null;
  notAClaimReason?: string | null;
  actor: { handlerId: number | null; name: string };
  now?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = input.now ?? new Date();
  const [claim] = await db.select().from(lossIntakeClaims).where(eq(lossIntakeClaims.id, input.claimId)).limit(1);
  if (!claim) throw new Error("Loss Intake record not found");

  const actorName = input.actor.name.trim() || "Processor";
  const claimNumber = input.claimNumber?.trim() || null;
  const notAClaimReason = input.notAClaimReason?.trim() || null;
  if (input.status === "filed" && !claimNumber) throw new Error("A Snapsheet claim number is required before marking an item Filed.");
  if (input.status === "not_a_claim" && !notAClaimReason) throw new Error("A one-line Not a claim reason is required.");

  if (
    input.status === "filing" &&
    claim.processorStatus === "filing" &&
    claim.processorTakenByHandlerId !== null &&
    claim.processorTakenByHandlerId !== input.actor.handlerId
  ) {
    throw new Error(`${claim.processorTakenByName ?? "Another processor"} is already filing this claim. Refresh the queue before taking it over.`);
  }

  if (
    input.status === "filed" &&
    (claim.processorStatus !== "filing" || (input.actor.handlerId === null
      ? claim.processorTakenByName !== actorName
      : claim.processorTakenByHandlerId !== input.actor.handlerId))
  ) {
    throw new Error("Only the processor who marked this item Filing can mark it Filed. Refresh the queue and coordinate before changing ownership.");
  }

  const isRelease = input.status === "not_started";
  const values = {
    processorStatus: input.status,
    processorClaimNumber: input.status === "filed" ? claimNumber : null,
    processorTakenByHandlerId: isRelease ? null : input.actor.handlerId,
    processorTakenByName: isRelease ? null : actorName,
    processorTakenAt: isRelease ? null : now,
    processorNotAClaimReason: input.status === "not_a_claim" ? notAClaimReason : null,
    processorStatusUpdatedAt: now,
    processorStatusUpdatedBy: actorName,
    processorFiledVisibleUntil: input.status === "filed" ? localEndOfDayEt(now) : null,
  };
  // The conditional write is the concurrency guard. If two processors click
  // Filing at nearly the same time, only the first update can move the row
  // from not_started to filing; the other sees an explicit conflict.
  const allowedOwner = input.actor.handlerId === null
    ? eq(lossIntakeClaims.processorTakenByName, actorName)
    : eq(lossIntakeClaims.processorTakenByHandlerId, input.actor.handlerId);
  const ownershipCondition = input.status === "filing"
    ? or(eq(lossIntakeClaims.processorStatus, "not_started"), allowedOwner)
    : input.status === "filed"
      ? and(eq(lossIntakeClaims.processorStatus, "filing"), allowedOwner)
      : undefined;
  const result = await db.update(lossIntakeClaims).set(values).where(and(
    eq(lossIntakeClaims.id, input.claimId),
    ...(ownershipCondition ? [ownershipCondition] : []),
  ));
  const resultHeader = Array.isArray(result) ? result[0] : result;
  const affectedRows = Number((resultHeader as unknown as { affectedRows?: number })?.affectedRows ?? 0);
  if (ownershipCondition && affectedRows === 0) {
    throw new Error("Another processor updated this item first. Refresh the queue before continuing.");
  }

  if (input.status === "not_a_claim") {
    const vinLastSix = normalizeVinFragment(claim.vinLastSix);
    if (!vinLastSix) throw new Error("Cannot exclude a non-claim without a valid six-digit VIN fragment.");
    await db.insert(lossIntakeProcessorVinExclusions).values({
      vinLastSix,
      reason: notAClaimReason!,
      markedByHandlerId: input.actor.handlerId,
      markedByName: actorName,
      markedAt: now,
    }).onDuplicateKeyUpdate({
      set: { reason: notAClaimReason!, markedByHandlerId: input.actor.handlerId, markedByName: actorName, markedAt: now },
    });
  }

  return { claimId: input.claimId, status: input.status, takenByName: isRelease ? null : actorName };
}

export const processorQueueInternals = { captureDetails, localEndOfDayEt, validDateOfLoss };
