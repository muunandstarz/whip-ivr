import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import {
  getLossIntakeSettings,
  getLossIntakeThreadState,
  upsertLossIntakeClaimBundle,
  updateClaimsIntakeTag,
} from "./lossIntakeDb";
import {
  analyzeFnolThread,
  parseFnolParent,
  type IntakeAgentAssignment,
  type ParsedLossParent,
  type SlackFileRef,
  type SlackLossMessage,
  type SlackLossParent,
} from "./lossIntakeDomain";

export const SLACK_LOSS_INTAKE_PATH = "/api/slack/loss-intake-events";
export const SLACK_LOSS_INTAKE_TEAM_ID = "TFFUXNU57";
export const SLACK_LOSS_INTAKE_APP_ID = "A0BHDG7RX7D";
export const SLACK_LOSS_INTAKE_CHANNELS = new Map([
  ["CHWRXH4HK", "claims"],
  ["C092UPKR79D", "claims-remotemarkets"],
] as const);

// The @claims-intake user group ID — tagging this starts the SLA clock
const CLAIMS_INTAKE_GROUP_ID = "S0AK7MBDQ49";

/** Returns true if the message text mentions the @claims-intake user group */
function mentionsClaimsIntakeGroup(text: string | undefined): boolean {
  if (!text) return false;
  // Slack encodes user group mentions as <!subteam^ID> or <!subteam^ID|@handle>
  return text.includes(`<!subteam^${CLAIMS_INTAKE_GROUP_ID}>`) ||
    text.includes(`<!subteam^${CLAIMS_INTAKE_GROUP_ID}|`);
}

/** SLA calculation: 10 min during business hours (Mon–Fri 9am–6pm ET), 4 business hours otherwise */
function computeClaimsIntakeSla(taggedAtMs: number): {
  slaType: "business_hours" | "after_hours";
  slaDeadlineAt: number;
} {
  const taggedAt = new Date(taggedAtMs);
  // Convert to ET (UTC-5 or UTC-4 during DST)
  const etOffset = isDaylightSavingTime(taggedAt) ? -4 * 60 : -5 * 60;
  const etMs = taggedAtMs + etOffset * 60 * 1000;
  const etDate = new Date(etMs);
  const dayOfWeek = etDate.getUTCDay(); // 0=Sun, 6=Sat
  const hourET = etDate.getUTCHours();
  const isBusinessHours = dayOfWeek >= 1 && dayOfWeek <= 5 && hourET >= 9 && hourET < 18;
  if (isBusinessHours) {
    return { slaType: "business_hours", slaDeadlineAt: taggedAtMs + 10 * 60 * 1000 };
  }
  // After hours: add 4 business hours from next business open
  const nextOpen = nextBusinessOpenMs(taggedAtMs, etOffset);
  return { slaType: "after_hours", slaDeadlineAt: nextOpen + 4 * 60 * 60 * 1000 };
}

function isDaylightSavingTime(date: Date): boolean {
  // Simplified DST check for US ET: second Sunday in March to first Sunday in November
  const year = date.getUTCFullYear();
  const dstStart = nthSundayOfMonth(year, 2, 2); // March (month=2), 2nd Sunday
  const dstEnd = nthSundayOfMonth(year, 10, 1);  // November (month=10), 1st Sunday
  return date >= dstStart && date < dstEnd;
}

function nthSundayOfMonth(year: number, month: number, n: number): Date {
  const d = new Date(Date.UTC(year, month, 1));
  const firstSunday = (7 - d.getUTCDay()) % 7;
  return new Date(Date.UTC(year, month, 1 + firstSunday + (n - 1) * 7, 7, 0, 0)); // 2am ET = 7am UTC
}

function nextBusinessOpenMs(fromMs: number, etOffsetMinutes: number): number {
  const etMs = fromMs + etOffsetMinutes * 60 * 1000;
  const d = new Date(etMs);
  // Advance to 9am ET next business day
  d.setUTCHours(9, 0, 0, 0);
  // If already past 9am today, move to next day
  if (d.getTime() <= etMs) d.setUTCDate(d.getUTCDate() + 1);
  // Skip weekends
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime() - etOffsetMinutes * 60 * 1000; // back to UTC ms
}
type SlackLossIntakeChannelId = "CHWRXH4HK" | "C092UPKR79D";

function approvedChannelName(channelId: string) {
  return SLACK_LOSS_INTAKE_CHANNELS.get(channelId as SlackLossIntakeChannelId);
}

const SLACK_SIGNATURE_VERSION = "v0";
const SLACK_REPLAY_WINDOW_SECONDS = 5 * 60;
const SUPPORTED_MESSAGE_SUBTYPES = new Set([undefined, "file_share"]);

interface SlackEventFile {
  id?: string;
  name?: string;
  mimetype?: string;
}

interface SlackMessageEvent {
  type?: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
  files?: SlackEventFile[];
}

export interface SlackEventEnvelope {
  type?: string;
  challenge?: string;
  team_id?: string;
  api_app_id?: string;
  event_id?: string;
  event_time?: number;
  event?: SlackMessageEvent;
}

export interface SlackSignatureVerification {
  ok: boolean;
  status: number;
  reason?: string;
}

export function verifySlackRequestSignature(input: {
  signingSecret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
  nowSeconds?: number;
}): SlackSignatureVerification {
  if (!input.signingSecret) {
    return { ok: false, status: 503, reason: "Slack signing secret is not configured" };
  }
  if (!input.timestamp || !input.signature) {
    return { ok: false, status: 401, reason: "Missing Slack signature headers" };
  }

  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > SLACK_REPLAY_WINDOW_SECONDS
  ) {
    return { ok: false, status: 401, reason: "Slack request timestamp is outside the replay window" };
  }

  const baseString = `${SLACK_SIGNATURE_VERSION}:${input.timestamp}:${input.rawBody.toString("utf8")}`;
  const expected = `${SLACK_SIGNATURE_VERSION}=${createHmac("sha256", input.signingSecret)
    .update(baseString, "utf8")
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(input.signature, "utf8");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return { ok: false, status: 401, reason: "Invalid Slack request signature" };
  }

  return { ok: true, status: 200 };
}

function parseAssignments(value: unknown): IntakeAgentAssignment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.slackUserId !== "string" ||
      typeof candidate.handlerId !== "number" ||
      typeof candidate.handlerName !== "string"
    ) {
      return [];
    }
    return [{
      slackUserId: candidate.slackUserId,
      handlerId: candidate.handlerId,
      handlerName: candidate.handlerName,
    }];
  });
}

function toDomainFiles(files: SlackEventFile[] | undefined): SlackFileRef[] {
  return (files ?? []).map(file => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
  }));
}

function handlerName(
  slackUserId: string | undefined,
  assignments: IntakeAgentAssignment[],
) {
  return assignments.find(assignment => assignment.slackUserId === slackUserId)?.handlerName ?? null;
}

function toDomainMessage(
  event: SlackMessageEvent,
  eventId: string,
  assignments: IntakeAgentAssignment[],
): SlackLossMessage | null {
  if (!event.ts) return null;
  return {
    ts: event.ts,
    text: event.text ?? "",
    userId: event.user ?? null,
    userName: handlerName(event.user, assignments),
    files: toDomainFiles(event.files),
    eventId,
  };
}

function metadataFileCount(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const count = (metadata as Record<string, unknown>).fileCount;
  return typeof count === "number" && Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 0;
}

function rehydrateParent(
  threadState: NonNullable<Awaited<ReturnType<typeof getLossIntakeThreadState>>>,
): ParsedLossParent {
  const { claim, events } = threadState;
  const postedEvent = events.find(event => event.eventType === "posted");
  return {
    slackKey: claim.slackKey,
    channelId: claim.channelId,
    channelName: claim.channelName,
    slackMessageTs: claim.slackMessageTs,
    slackEventId: postedEvent?.slackEventKey ?? null,
    slackPermalink: claim.slackPermalink,
    postedAt: claim.postedAt,
    memberName: claim.memberName,
    customerId: claim.customerId,
    vinLastSix: claim.vinLastSix,
    market: claim.market,
    vehicleType: claim.vehicleType,
    hasPhotos: claim.hasPhotos,
    attachmentCount: claim.attachmentCount,
    rideshareStatus: claim.rideshareStatus,
    dateOfLoss: claim.dateOfLoss ?? null,
  };
}

function rehydrateReplies(
  threadState: NonNullable<Awaited<ReturnType<typeof getLossIntakeThreadState>>>,
): SlackLossMessage[] {
  return threadState.events
    .filter(event => event.eventType !== "posted")
    .map(event => ({
      ts: event.slackEventTs,
      text: event.body ?? "",
      userId: event.actorSlackUserId,
      userName: event.actorName,
      files: Array.from({ length: metadataFileCount(event.metadata) }, () => ({})),
      eventId: event.slackEventKey,
    }));
}

const pendingReplies = new Map<string, SlackLossMessage[]>();
const inFlightEventIds = new Set<string>();
const threadProcessingTails = new Map<string, Promise<void>>();

function addPendingReply(threadKey: string, reply: SlackLossMessage) {
  const replies = pendingReplies.get(threadKey) ?? [];
  if (!replies.some(existing => existing.eventId === reply.eventId)) {
    replies.push(reply);
    pendingReplies.set(threadKey, replies);
  }
}

function mergeReplies(
  existing: SlackLossMessage[],
  additions: SlackLossMessage[],
): SlackLossMessage[] {
  const byEventId = new Map<string, SlackLossMessage>();
  for (const reply of [...existing, ...additions]) {
    byEventId.set(reply.eventId ?? reply.ts, reply);
  }
  return Array.from(byEventId.values());
}

export async function processSlackLossIntakeEvent(payload: SlackEventEnvelope) {
  const eventId = payload.event_id;
  const event = payload.event;
  if (!eventId || !event?.channel || !event.ts) return { status: "ignored" as const };
  if (inFlightEventIds.has(eventId)) return { status: "duplicate" as const };

  const parentTs = event.thread_ts && event.thread_ts !== event.ts
    ? event.thread_ts
    : event.ts;
  const threadKey = `${event.channel}:${parentTs}`;
  const priorThreadWork = threadProcessingTails.get(threadKey) ?? Promise.resolve();
  let releaseThread: (() => void) | undefined;
  const currentThreadWork = new Promise<void>(resolve => {
    releaseThread = resolve;
  });
  const threadTail = priorThreadWork.then(() => currentThreadWork);
  threadProcessingTails.set(threadKey, threadTail);

  inFlightEventIds.add(eventId);
  await priorThreadWork;
  try {
    const settings = await getLossIntakeSettings();
    const assignments = parseAssignments(settings.agentAssignments);
    const message = toDomainMessage(event, eventId, assignments);
    if (!message) return { status: "ignored" as const };

    const channelId = event.channel;
    const channelName = approvedChannelName(channelId);
    if (!channelName) return { status: "ignored" as const };

    const isReply = parentTs !== event.ts;
    const threadState = await getLossIntakeThreadState(channelId, parentTs);

    if (!isReply) {
      const parent: SlackLossParent = {
        ...message,
        channelId,
        channelName,
        permalink: null,
      };
      const parsedParent = parseFnolParent(parent);
      if (!parsedParent) return { status: "ignored" as const };
      const replies = pendingReplies.get(threadKey) ?? [];
      const analysis = analyzeFnolThread({
        parent: parsedParent,
        replies,
        assignments,
        slaMinutes: settings.firstContactSlaMinutes,
        atRiskMinutes: settings.atRiskMinutes,
      });
      await upsertLossIntakeClaimBundle({ parent: parsedParent, analysis });
      pendingReplies.delete(threadKey);
      return { status: "created" as const };
    }

    if (!threadState) {
      addPendingReply(threadKey, message);
      return { status: "buffered" as const };
    }

    const parent = rehydrateParent(threadState);
    const replies = mergeReplies(rehydrateReplies(threadState), [message]);
    const analysis = analyzeFnolThread({
      parent,
      replies,
      assignments,
      slaMinutes: settings.firstContactSlaMinutes,
      atRiskMinutes: settings.atRiskMinutes,
    });
    await upsertLossIntakeClaimBundle({ parent, analysis });

    // If this reply mentions @claims-intake, start the SLA clock on the existing claim
    if (mentionsClaimsIntakeGroup(event.text)) {
      const taggedAtMs = Math.round(parseFloat(event.ts) * 1000);
      const sla = computeClaimsIntakeSla(taggedAtMs);
      await updateClaimsIntakeTag({
        slackKey: parent.slackKey,
        taggedAt: taggedAtMs,
        slaType: sla.slaType,
        slaDeadlineAt: sla.slaDeadlineAt,
      });
      console.log(`[Loss Intake] @claims-intake SLA clock started for ${parent.slackKey}: ${sla.slaType}, due ${new Date(sla.slaDeadlineAt).toISOString()}`);
    }

    return { status: "updated" as const };
  } finally {
    inFlightEventIds.delete(eventId);
    releaseThread?.();
    if (threadProcessingTails.get(threadKey) === threadTail) {
      threadProcessingTails.delete(threadKey);
    }
  }
}

function envelopeMatchesInstallation(payload: SlackEventEnvelope) {
  return payload.team_id === SLACK_LOSS_INTAKE_TEAM_ID &&
    payload.api_app_id === SLACK_LOSS_INTAKE_APP_ID;
}

function isSupportedMessageEvent(payload: SlackEventEnvelope) {
  const event = payload.event;
  if (payload.type !== "event_callback" || !event) return false;
  if (event.type !== "message") return false;
  if (!event.channel || !approvedChannelName(event.channel)) return false;
  if (event.channel_type && event.channel_type !== "channel" && event.channel_type !== "group") {
    return false;
  }
  if (event.bot_id || !event.user) return false;
  return SUPPORTED_MESSAGE_SUBTYPES.has(event.subtype);
}

export function slackLossIntakeEventsHandler(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : "", "utf8");
  const verification = verifySlackRequestSignature({
    signingSecret: ENV.slackSigningSecret,
    timestamp: req.get("x-slack-request-timestamp") ?? undefined,
    signature: req.get("x-slack-signature") ?? undefined,
    rawBody,
  });
  if (!verification.ok) {
    res.status(verification.status).json({ error: verification.reason });
    return;
  }

  let payload: SlackEventEnvelope;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as SlackEventEnvelope;
  } catch {
    res.status(400).json({ error: "Invalid Slack JSON payload" });
    return;
  }

  if (payload.type === "url_verification") {
    if (
      (payload.team_id && payload.team_id !== SLACK_LOSS_INTAKE_TEAM_ID) ||
      (payload.api_app_id && payload.api_app_id !== SLACK_LOSS_INTAKE_APP_ID) ||
      typeof payload.challenge !== "string"
    ) {
      res.status(403).json({ error: "Slack URL verification payload is not approved" });
      return;
    }
    res.status(200).json({ challenge: payload.challenge });
    return;
  }

  if (!envelopeMatchesInstallation(payload) || !isSupportedMessageEvent(payload)) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  res.status(200).json({ ok: true });
  void processSlackLossIntakeEvent(payload).catch(error => {
    console.error("[Loss Intake Slack Events] asynchronous processing failed", {
      eventId: payload.event_id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
