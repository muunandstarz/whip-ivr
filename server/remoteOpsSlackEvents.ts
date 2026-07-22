/**
 * Remote Ops @claims-intake Slack Event Handler
 *
 * Listens for messages in the Remote Ops channel (C092UPKR79D) that mention
 * the @claims-intake user group (S0AK7MBDQ49). When triggered:
 *   1. Creates a remote_ops_intakes record with SLA clock
 *   2. Posts a threaded reply in Slack with the SLA deadline
 *   3. Sends Slack DMs to Ana + available intake reps
 *
 * This handler is mounted at /api/slack/remote-ops-events and uses the same
 * Slack app credentials (signing secret + bot token) as the loss intake handler.
 */
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { verifySlackRequestSignature, type SlackEventEnvelope } from "./lossIntakeSlackEvents";
import { computeSlaDueAt } from "./remoteOpsDb";
import { createRemoteOpsIntake } from "./remoteOpsDb";

// ─── Constants ────────────────────────────────────────────────────────────────

export const REMOTE_OPS_SLACK_PATH = "/api/slack/remote-ops-events";

/** The Remote Ops Slack channel */
const REMOTE_OPS_CHANNEL_ID = "C092UPKR79D";

/** The @claims-intake Slack user group ID */
const CLAIMS_INTAKE_GROUP_ID = "S0AK7MBDQ49";

/** Slack user IDs for intake reps to notify (Ana + others) */
// Ana Padilla's Slack user ID — add others as needed
// These are looked up via /api/slack/users.list if unknown; hardcode known ones here.
const INTAKE_REP_SLACK_IDS: string[] = []; // Will be resolved from the loss intake settings

const SLACK_API_BASE = "https://slack.com/api";

// ─── Slack API helpers ────────────────────────────────────────────────────────

function requireSlackToken(): string {
  if (!ENV.slackBotToken) throw new Error("SLACK_BOT_TOKEN is not configured");
  return ENV.slackBotToken;
}

async function slackPost<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = requireSlackToken();
  const res = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) {
    console.warn(`[RemoteOps] Slack ${method} failed: ${data.error}`);
  }
  return data;
}

async function slackGet<T = unknown>(method: string, params: Record<string, string>): Promise<T> {
  const token = requireSlackToken();
  const url = new URL(`${SLACK_API_BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json() as Promise<T>;
}

/** Get display name for a Slack user ID */
async function getSlackUserName(userId: string): Promise<string> {
  try {
    const data = await slackGet<{ ok: boolean; user?: { real_name?: string; name?: string } }>(
      "users.info",
      { user: userId },
    );
    return data.user?.real_name ?? data.user?.name ?? userId;
  } catch {
    return userId;
  }
}

/** Get the permalink for a message */
async function getPermalink(channelId: string, messageTs: string): Promise<string | null> {
  try {
    const data = await slackGet<{ ok: boolean; permalink?: string }>(
      "chat.getPermalink",
      { channel: channelId, message_ts: messageTs },
    );
    return data.permalink ?? null;
  } catch {
    return null;
  }
}

/** Post a threaded reply in Slack */
async function postThreadReply(channelId: string, threadTs: string, text: string): Promise<void> {
  await slackPost("chat.postMessage", {
    channel: channelId,
    thread_ts: threadTs,
    text,
  });
}

/** Send a Slack DM to a user */
async function sendDm(userId: string, text: string): Promise<void> {
  // Open DM channel first
  const dm = await slackPost<{ ok: boolean; channel?: { id?: string } }>("conversations.open", {
    users: userId,
  });
  const dmChannelId = (dm as any)?.channel?.id;
  if (!dmChannelId) return;
  await slackPost("chat.postMessage", { channel: dmChannelId, text });
}

// ─── Resolve intake rep Slack IDs from loss intake settings ──────────────────

async function getIntakeRepSlackIds(): Promise<string[]> {
  try {
    const { getLossIntakeSettings } = await import("./lossIntakeDb");
    const settings = await getLossIntakeSettings();
    const assignments = Array.isArray(settings.agentAssignments)
      ? (settings.agentAssignments as Array<{ slackUserId?: string; handlerName?: string }>)
      : [];
    // Ana + any other loss intake reps (filter by known names)
    const intakeNames = ["ana", "carlito", "bennet"];
    return assignments
      .filter(a => a.handlerName && intakeNames.some(n => a.handlerName!.toLowerCase().includes(n)))
      .map(a => a.slackUserId!)
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Idempotency ─────────────────────────────────────────────────────────────

/** In-memory set of processed Slack event IDs to prevent duplicate processing */
const processedEventIds = new Set<string>();

// ─── Core processing ─────────────────────────────────────────────────────────

/** Does the message text mention the @claims-intake user group? */
function mentionsClaimsIntake(text: string): boolean {
  // Slack encodes user group mentions as <!subteam^GROUP_ID|@name>
  return text.includes(`<!subteam^${CLAIMS_INTAKE_GROUP_ID}`) || text.includes("@claims-intake");
}

/** Format a Date as a human-readable ET time string */
function formatET(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export async function processRemoteOpsEvent(payload: SlackEventEnvelope): Promise<void> {
  const event = payload.event;
  if (!event?.ts || !event.channel || event.channel !== REMOTE_OPS_CHANNEL_ID) return;

  // Deduplicate by event_id (Slack retries same event_id on failure)
  const eventId = payload.event_id ?? `${event.channel}:${event.ts}`;
  if (processedEventIds.has(eventId)) {
    console.log(`[RemoteOps] Skipping duplicate event ${eventId}`);
    return;
  }
  processedEventIds.add(eventId);
  // Prune old event IDs to avoid unbounded memory growth
  if (processedEventIds.size > 500) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }

  // Only process top-level messages (not replies) that mention @claims-intake
  const isReply = event.thread_ts && event.thread_ts !== event.ts;
  if (isReply) return; // Only trigger on the original handoff message, not replies

  const text = event.text ?? "";
  if (!mentionsClaimsIntake(text)) return;

  const triggeredAt = new Date(Number(event.ts) * 1000);
  const { slaDueAt, slaType } = computeSlaDueAt(triggeredAt);

  // Get triggering user's display name
  const triggeredByName = event.user ? await getSlackUserName(event.user) : "Remote Ops";

  // Get permalink
  const slackPermalink = await getPermalink(REMOTE_OPS_CHANNEL_ID, event.ts);

  // Create the DB record
  const intakeId = await createRemoteOpsIntake({
    slackTs: event.ts,
    channelId: REMOTE_OPS_CHANNEL_ID,
    threadTs: event.thread_ts ?? null,
    messageText: text,
    triggeredBySlackId: event.user ?? null,
    triggeredByName,
    slackPermalink,
    slaDueAt,
    slaType,
    status: "pending",
    claimedByHandlerId: null,
    claimedByName: null,
    claimedAt: null,
    completedAt: null,
    memberName: null,
    customerId: null,
    market: null,
    notes: null,
  });

  console.log(`[RemoteOps] Created intake #${intakeId} — SLA: ${slaType} → due ${formatET(slaDueAt)}`);

  // Post threaded reply in the Remote Ops channel
  const slaLabel = slaType === "business_hours"
    ? `⏱ *10-minute SLA* — must be claimed by *${formatET(slaDueAt)} ET*`
    : `🌙 *After-hours SLA (4 business hours)* — must be claimed by *${formatET(slaDueAt)} ET*`;

  await postThreadReply(
    REMOTE_OPS_CHANNEL_ID,
    event.ts,
    `✅ *Claims Intake notified* — intake #${intakeId} created.\n${slaLabel}\n\nAn intake rep will follow up shortly. <https://whipclaimsivr.com/loss-intake|View in Loss Intake Dashboard>`,
  );

  // Notify intake reps via DM
  const repSlackIds = await getIntakeRepSlackIds();
  const dmText = `🔔 *New Remote Ops handoff* — intake #${intakeId}\n*From:* ${triggeredByName}\n*SLA:* ${slaType === "business_hours" ? "10 minutes" : "4 business hours"} → due *${formatET(slaDueAt)} ET*\n*Message:* ${text.slice(0, 300)}${text.length > 300 ? "…" : ""}\n\n${slackPermalink ? `<${slackPermalink}|View in Slack>  ·  ` : ""}<https://whipclaimsivr.com/loss-intake|Claim in Dashboard>`;

  for (const slackUserId of repSlackIds) {
    try {
      await sendDm(slackUserId, dmText);
    } catch (err) {
      console.warn(`[RemoteOps] Failed to DM ${slackUserId}:`, err);
    }
  }
}

// ─── Express handler ──────────────────────────────────────────────────────────

export function remoteOpsSlackEventsHandler(req: Request, res: Response): void {
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
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  // Slack URL verification challenge
  if (payload.type === "url_verification") {
    if (typeof payload.challenge !== "string") {
      res.status(403).json({ error: "Invalid challenge" });
      return;
    }
    res.status(200).json({ challenge: payload.challenge });
    return;
  }

  // Acknowledge immediately, process async
  res.status(200).json({ ok: true });

  void processRemoteOpsEvent(payload).catch(err => {
    console.error("[RemoteOps] Processing failed:", err instanceof Error ? err.message : String(err));
  });
}
