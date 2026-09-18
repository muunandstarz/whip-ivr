import { createHash } from "node:crypto";
import { ENV } from "./_core/env";
import { getLossIntakeSettings, updateLossIntakeSettings } from "./lossIntakeDb";
import { listLossIntakeSharedQueue, type IntakeQueueClaim } from "./lossIntakeSharedQueue";

const SLACK_API_BASE = "https://slack.com/api";

function etDateKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function formatBusinessMinutes(minutes: number | null) {
  if (minutes === null) return "not started";
  if (minutes < 60) return `${Math.round(minutes)} business min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m business time`;
}

export function dispatchMessageSignature(message: string) {
  return createHash("sha256").update(message).digest("hex");
}

export function shouldPublishDispatchMessage(input: { previousSignature: string | null | undefined; previousMessageTs: string | null | undefined; nextMessage: string }) {
  return !input.previousMessageTs || input.previousSignature !== dispatchMessageSignature(input.nextMessage);
}

function todayEastern(value: Date | null, now: Date) {
  return value ? etDateKey(value) === etDateKey(now) : false;
}

function priorityForDigest(claim: IntakeQueueClaim, now: Date) {
  if (claim.onSiteFlag && !claim.firstContactAt) return 0;
  if (todayEastern(claim.inspectionScheduledAt, now) && !claim.firstContactAt) return 1;
  if (claim.slaState === "breached" && !claim.completedAt) return 2;
  return 3;
}

/** The Slack copy is the same Intake work queue: no processor work or separate source. */
export function buildIntakeDigest(claims: IntakeQueueClaim[], now = new Date()) {
  const active = claims.filter(claim => !claim.completedAt)
    .sort((left, right) => priorityForDigest(left, now) - priorityForDigest(right, now) || left.postedAt.getTime() - right.postedAt.getTime());
  const lines = active.length === 0
    ? ["No active Intake follow-up is currently required."]
    : active.map((claim, index) => [
      `*${index + 1}. ${claim.onSiteFlag ? "(this driver appears to be in office) " : ""}${claim.memberName ?? "Unidentified member"}${claim.customerId ? ` · Customer ${claim.customerId}` : ""}*`,
      `${claim.market ?? "Market unknown"} · VIN ${claim.vinLastSix ?? "not captured"} · ${claim.dateOfLoss ? `Loss ${claim.dateOfLoss}` : "Loss date not captured"}`,
      claim.inspectionScheduledAt && todayEastern(claim.inspectionScheduledAt, now) ? `Inspection today: ${claim.inspectionScheduledAt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET.` : null,
      `Status: ${claim.claimedByName ? `claimed by ${claim.claimedByName}` : "unclaimed"} · ${formatBusinessMinutes(claim.firstResponseBusinessMinutes)} · ${claim.contactAttempts} attempt${claim.contactAttempts === 1 ? "" : "s"}`,
      claim.slackPermalink ? `<${claim.slackPermalink}|Open Slack thread>` : "Slack permalink unavailable",
    ].filter(Boolean).join("\n"));
  return [
    `*Loss Intake Follow-up — ${etDateKey(now)}* (${active.length} active)`,
    "Shared queue: claim an item before working it. Store arrivals first, today’s inspections next, then overdue and oldest reports.",
    "",
    ...lines,
  ].join("\n");
}

async function slackPostOrUpdate(input: { channel: string; text: string; messageTs?: string | null }) {
  if (!ENV.slackBotToken) throw new Error("SLACK_BOT_TOKEN is not configured for Intake publishing.");
  const method = input.messageTs ? "chat.update" : "chat.postMessage";
  const response = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.slackBotToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(input.messageTs ? { channel: input.channel, ts: input.messageTs, text: input.text } : { channel: input.channel, text: input.text }),
  });
  const payload = await response.json() as { ok?: boolean; error?: string; ts?: string };
  if (!response.ok || !payload.ok || !payload.ts) throw new Error(`Slack ${method} failed: ${payload.error ?? response.statusText}`);
  return payload.ts;
}

/** Posts or updates one configured daily Intake message. No destination is hardcoded. */
export async function publishLossIntakeDispatch(input: { now?: Date } = {}) {
  const now = input.now ?? new Date();
  const settings = await getLossIntakeSettings();
  if (!settings.intakeSlackPublishingEnabled || !settings.intakeSlackDestinationChannelId) {
    return { published: {}, skipped: "destination_not_configured" as const, intake: [] as IntakeQueueClaim[], intakeMessage: null };
  }
  const intake = await listLossIntakeSharedQueue();
  const intakeMessage = buildIntakeDigest(intake, now);
  if (!shouldPublishDispatchMessage({ previousSignature: settings.intakeDigestSignature, previousMessageTs: settings.intakeDigestMessageTs, nextMessage: intakeMessage })) {
    return { published: {}, skipped: "unchanged" as const, intake, intakeMessage };
  }
  const dateKey = etDateKey(now);
  const sameDay = settings.intakeDigestDateKey === dateKey;
  const messageTs = await slackPostOrUpdate({ channel: settings.intakeSlackDestinationChannelId, text: intakeMessage, messageTs: sameDay ? settings.intakeDigestMessageTs : null });
  const patch = {
    intakeDigestMessageTs: messageTs,
    intakeDigestSignature: dispatchMessageSignature(intakeMessage),
    intakeDigestDateKey: dateKey,
  };
  await updateLossIntakeSettings(patch, "Loss Intake Dispatch");
  return { published: patch, skipped: null, intake, intakeMessage };
}
