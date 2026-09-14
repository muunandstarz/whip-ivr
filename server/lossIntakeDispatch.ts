import { createHash } from "node:crypto";
import { ENV } from "./_core/env";
import {
  getLossIntakeSettings,
  listLossIntakeClaims,
  updateLossIntakeSettings,
} from "./lossIntakeDb";

const SLACK_API_BASE = "https://slack.com/api";

export type DispatchWorkClaim = {
  id: number;
  memberName: string | null;
  customerId: string | null;
  market: string | null;
  channelName: string;
  vinLastSix: string | null;
  postedAt: Date;
  slackPermalink: string | null;
  factsOfLoss: string | null;
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  hasPhotos: boolean;
  attachmentCount: number;
  stage: "awaiting_outreach" | "outreach_started" | "contact_attempts" | "complete";
  completedAt: Date | null;
  firstResponseBusinessMinutes: number | null;
  slaTargetBusinessMinutes: number | null;
  slaState: "within_sla" | "at_risk" | "breached";
  onSiteFlag: boolean;
  onSiteReason: string | null;
  contactAttempts: number;
  filingState: "filed" | "unfiled" | "pending_statement" | "unverified";
  filingEvidence: string | null;
  dataWarnings: string | null;
};

function etDateKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function formatBusinessMinutes(minutes: number | null) {
  if (minutes === null) return "not started";
  if (minutes < 60) return `${Math.round(minutes)} business min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m business time`;
}

export function dispatchMessageSignature(message: string) {
  return createHash("sha256").update(message).digest("hex");
}

export function shouldPublishDispatchMessage(input: {
  previousSignature: string | null | undefined;
  previousMessageTs: string | null | undefined;
  nextMessage: string;
}) {
  return !input.previousMessageTs || input.previousSignature !== dispatchMessageSignature(input.nextMessage);
}

function dispatchTargetMinutes(claim: DispatchWorkClaim) {
  return claim.slaTargetBusinessMinutes ?? (claim.channelName === "remote-markets" ? 240 : 10);
}

function sourceLink(claim: DispatchWorkClaim) {
  return claim.slackPermalink ? `<${claim.slackPermalink}|Open Slack thread>` : "Slack permalink unavailable";
}

function dispatchPriority(claim: DispatchWorkClaim) {
  if (claim.onSiteFlag) return 0;
  if (claim.slaState === "breached") return 1;
  if (claim.slaState === "at_risk") return 2;
  return 3;
}

export function buildDispatchMessages(claims: DispatchWorkClaim[], now = new Date()) {
  const dateKey = etDateKey(now);
  const active = claims.filter(claim => !claim.completedAt);
  const unfiled = active
    .filter(claim => claim.filingState === "unfiled")
    .sort((left, right) => left.postedAt.getTime() - right.postedAt.getTime());
  const intake = active
    .filter(claim => claim.stage !== "complete")
    .sort((left, right) => dispatchPriority(left) - dispatchPriority(right) || left.postedAt.getTime() - right.postedAt.getTime());

  const processorLines = unfiled.length === 0
    ? ["No unfiled loss reports are currently identified."]
    : unfiled.map((claim, index) => [
      `*${index + 1}. ${claim.memberName ?? "Unidentified member"}${claim.customerId ? ` · Customer ${claim.customerId}` : ""}*`,
      `${claim.market ?? "Market unknown"} · VIN ${claim.vinLastSix ?? "not captured"} · Reported ${claim.postedAt.toLocaleString("en-US", { timeZone: "America/New_York" })}`,
      `Source: ${sourceLink(claim)}`,
      `Facts captured: ${claim.factsOfLoss ?? "Not documented"}`,
      `Liability: ${claim.preliminaryLiability ?? "Not documented"} · Rideshare: ${claim.rideshareStatus ?? "Not documented"}`,
      `Evidence: ${claim.attachmentCount ? `${claim.attachmentCount} file(s)` : "No files"}${claim.hasPhotos ? ", photos present" : ""}`,
      `Filing evidence: ${claim.filingEvidence ?? "No claim ID or filing evidence documented"}`,
      claim.dataWarnings ? `Warning: ${claim.dataWarnings}` : null,
    ].filter(Boolean).join("\n"));
  const processorsMessage = [
    `*Unfiled Claims — ${dateKey}* (${unfiled.length})`,
    "*File with the information available. Do not call the member.*",
    "Member outreach and recorded statements remain with the Intake team.",
    "",
    ...processorLines,
  ].join("\n");

  const intakeLines = intake.length === 0
    ? ["No active recorded-statement follow-up is currently required."]
    : intake.map((claim, index) => [
      `*${index + 1}. ${claim.onSiteFlag ? "(this driver appears to be in office) " : ""}${claim.memberName ?? "Unidentified member"}${claim.customerId ? ` · Customer ${claim.customerId}` : ""}*`,
      `${claim.market ?? "Market unknown"} · VIN ${claim.vinLastSix ?? "not captured"} · ${formatBusinessMinutes(claim.firstResponseBusinessMinutes)} of ${dispatchTargetMinutes(claim)}-minute target`,
      `Status: ${claim.slaState.replace("_", " ")} · Attempts documented: ${claim.contactAttempts}`,
      claim.onSiteReason ? `On-site evidence: ${claim.onSiteReason}` : null,
      `Thread: ${sourceLink(claim)}`,
    ].filter(Boolean).join("\n"));
  const intakeMessage = [
    `*Loss Intake Follow-up — ${dateKey}* (${intake.length} active)`,
    "Shared pull queue. Work top-down; do not assign by market.",
    "",
    ...intakeLines,
  ].join("\n");

  return { dateKey, unfiled, intake, processorsMessage, intakeMessage };
}

async function slackPostOrUpdate(input: { channel: string; text: string; messageTs?: string | null }) {
  if (!ENV.slackBotToken) throw new Error("SLACK_BOT_TOKEN is not configured for Dispatch publishing.");
  const method = input.messageTs ? "chat.update" : "chat.postMessage";
  const response = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.slackBotToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(input.messageTs
      ? { channel: input.channel, ts: input.messageTs, text: input.text }
      : { channel: input.channel, text: input.text }),
  });
  const payload = await response.json() as { ok?: boolean; error?: string; ts?: string };
  if (!response.ok || !payload.ok || !payload.ts) throw new Error(`Slack ${method} failed: ${payload.error ?? response.statusText}`);
  return payload.ts;
}

/** Publishes only when called by an enabled Dispatch schedule or an admin-controlled run. */
export async function publishLossIntakeDispatch(input: { now?: Date; publishProcessors?: boolean; publishIntake?: boolean } = {}) {
  const now = input.now ?? new Date();
  const settings = await getLossIntakeSettings();
  const { claims } = await listLossIntakeClaims({ limit: 200, offset: 0 });
  const messages = buildDispatchMessages(claims as DispatchWorkClaim[], now);
  const patch: Record<string, string | null> = {};

  if (input.publishProcessors && shouldPublishDispatchMessage({
    previousSignature: settings.processorsDigestSignature,
    previousMessageTs: settings.processorsDigestMessageTs,
    nextMessage: messages.processorsMessage,
  })) {
    patch.processorsDigestMessageTs = await slackPostOrUpdate({
      channel: settings.claimsProcessorsChannelId,
      text: messages.processorsMessage,
    });
    patch.processorsDigestSignature = dispatchMessageSignature(messages.processorsMessage);
  }
  if (input.publishIntake && shouldPublishDispatchMessage({
    previousSignature: settings.intakeDigestSignature,
    previousMessageTs: settings.intakeDigestMessageTs,
    nextMessage: messages.intakeMessage,
  })) {
    const sameDay = settings.intakeDigestDateKey === messages.dateKey;
    patch.intakeDigestMessageTs = await slackPostOrUpdate({
      channel: settings.claimsIntakeRepsChannelId,
      text: messages.intakeMessage,
      messageTs: sameDay ? settings.intakeDigestMessageTs : null,
    });
    patch.intakeDigestSignature = dispatchMessageSignature(messages.intakeMessage);
    patch.intakeDigestDateKey = messages.dateKey;
  }
  if (Object.keys(patch).length) {
    await updateLossIntakeSettings(patch, "Loss Intake Dispatch");
  }
  return { ...messages, published: patch };
}
