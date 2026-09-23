import { ENV } from "./_core/env";
import {
  finishLossIntakeSyncRun,
  findPrimaryLossIntakeClaimByDuplicateGroup,
  getLossIntakeClaimBySlackKey,
  getLossIntakeSettings,
  listLossIntakeClaims,
  startLossIntakeSyncRun,
  upsertLossIntakeClaimBundle,
} from "./lossIntakeDb";
import {
  analyzeFnolThread,
  parseLossNoticeParent,
  type IntakeAgentAssignment,
  type SlackFileRef,
  type SlackLossMessage,
  type SlackLossParent,
} from "./lossIntakeDomain";
import {
  applyClaimsTrackerCorroboration,
  getClaimsTrackerIndex,
} from "./claimsTrackerCorroboration";

const SLACK_API_BASE = "https://slack.com/api";
const INITIAL_BACKFILL_DAYS = 30;
const SYNC_OVERLAP_MINUTES = 10;
const MAX_HISTORY_PAGES = 10;
const MAX_THREAD_PAGES = 10;
const MAX_THREADS_PER_RUN = 75;

interface SlackApiEnvelope {
  ok: boolean;
  error?: string;
  response_metadata?: { next_cursor?: string };
}

interface SlackApiFile {
  id?: string;
  name?: string;
  mimetype?: string;
}

interface SlackApiMessage {
  type?: string;
  subtype?: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  files?: SlackApiFile[];
}

interface SlackHistoryResponse extends SlackApiEnvelope {
  messages?: SlackApiMessage[];
}

interface SlackPermalinkResponse extends SlackApiEnvelope {
  permalink?: string;
}

interface SlackUserInfoResponse extends SlackApiEnvelope {
  user?: {
    profile?: { title?: string; display_name?: string; real_name?: string };
    real_name?: string;
  };
}

const storeOpsUserCache = new Map<string, { isStoreOps: boolean; name: string | null }>();

export class SlackApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SlackApiError";
  }
}

function requireSlackToken() {
  if (!ENV.slackBotToken) {
    throw new SlackApiError(
      "SLACK_BOT_TOKEN is not configured for the Whip IVR server.",
      "missing_token",
    );
  }
  return ENV.slackBotToken;
}

function delay(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function slackGet<T extends SlackApiEnvelope>(
  method: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const url = new URL(`${SLACK_API_BASE}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${requireSlackToken()}` },
      signal: controller.signal,
    });
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "60");
      throw new SlackApiError(
        `Slack rate-limited ${method}.`,
        "ratelimited",
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60,
      );
    }
    const responseText = await response.text();
    let payload: T;
    try {
      payload = JSON.parse(responseText) as T;
    } catch {
      throw new SlackApiError(
        `Slack ${method} returned HTTP ${response.status} with an unreadable response.`,
        `http_${response.status}`,
      );
    }
    if (!response.ok) {
      throw new SlackApiError(
        `Slack ${method} failed with HTTP ${response.status}: ${payload.error ?? "unknown_error"}.`,
        payload.error ?? `http_${response.status}`,
      );
    }
    if (!payload.ok) {
      throw new SlackApiError(
        `Slack ${method} failed: ${payload.error ?? "unknown_error"}.`,
        payload.error,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof SlackApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SlackApiError(`Slack ${method} timed out.`, "timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toDomainFiles(files?: SlackApiFile[]): SlackFileRef[] {
  return (files ?? []).map(file => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
  }));
}

function toDomainMessage(message: SlackApiMessage): SlackLossMessage | null {
  if (!message.ts) return null;
  return {
    ts: message.ts,
    text: message.text ?? "",
    userId: message.user ?? null,
    userName: null,
    files: toDomainFiles(message.files),
  };
}

function isStoreOperationsProfile(profile: SlackUserInfoResponse["user"]) {
  const identity = [profile?.profile?.title, profile?.profile?.display_name, profile?.profile?.real_name, profile?.real_name]
    .filter(Boolean)
    .join(" ");
  return /\b(?:store|branch)\b.*\b(?:ops|operations)\b|\b(?:ops|operations)\b.*\b(?:store|branch)\b/i.test(identity);
}

async function resolveStoreOpsPoster(userId: string | null | undefined) {
  if (!userId) return { isStoreOps: false, name: null };
  const cached = storeOpsUserCache.get(userId);
  if (cached) return cached;
  try {
    const payload = await slackGet<SlackUserInfoResponse>("users.info", { user: userId });
    const result = {
      isStoreOps: isStoreOperationsProfile(payload.user),
      name: payload.user?.profile?.display_name || payload.user?.profile?.real_name || payload.user?.real_name || null,
    };
    storeOpsUserCache.set(userId, result);
    return result;
  } catch (error) {
    // If users:read is unavailable, no attachment is promoted to an in-office
    // signal by guesswork; source sync remains otherwise functional.
    console.warn(`[Loss Intake Sync] Could not resolve Slack poster ${userId}:`, error instanceof Error ? error.message : error);
    const result = { isStoreOps: false, name: null };
    storeOpsUserCache.set(userId, result);
    return result;
  }
}

async function enrichStoreOpsMessages(messages: SlackLossMessage[]) {
  const uniqueUsers = Array.from(new Set(messages.map(message => message.userId).filter((value): value is string => Boolean(value))));
  const identities = new Map<string, { isStoreOps: boolean; name: string | null }>();
  for (const userId of uniqueUsers) {
    identities.set(userId, await resolveStoreOpsPoster(userId));
    await delay(60);
  }
  return messages.map(message => {
    const identity = message.userId ? identities.get(message.userId) : null;
    return { ...message, userName: message.userName ?? identity?.name ?? null, isStoreOpsPoster: identity?.isStoreOps ?? false };
  });
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

function incrementalOldest(lastSuccessfulSyncAt: Date | null | undefined) {
  const fallback = Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000;
  const last = lastSuccessfulSyncAt?.getTime() ?? fallback;
  return ((last - SYNC_OVERLAP_MINUTES * 60 * 1000) / 1000).toFixed(6);
}

async function fetchChannelParents(input: {
  channelId: string;
  channelName: string;
  oldest: string;
}): Promise<SlackLossParent[]> {
  const parents: SlackLossParent[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const payload: SlackHistoryResponse = await slackGet("conversations.history", {
      channel: input.channelId,
      oldest: input.oldest,
      inclusive: true,
      limit: 200,
      cursor,
    });
    for (const message of payload.messages ?? []) {
      if (message.type && message.type !== "message") continue;
      if (message.subtype && message.subtype !== "file_share") continue;
      if (message.thread_ts && message.thread_ts !== message.ts) continue;
      const domain = toDomainMessage(message);
      if (!domain) continue;
      parents.push({
        ...domain,
        channelId: input.channelId,
        channelName: input.channelName,
        permalink: null,
      });
    }
    cursor = payload.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
    await delay(250);
  }
  return parents;
}

async function fetchThread(channelId: string, threadTs: string) {
  const messages: SlackLossMessage[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_THREAD_PAGES; page += 1) {
    const payload: SlackHistoryResponse = await slackGet("conversations.replies", {
      channel: channelId,
      ts: threadTs,
      limit: 200,
      cursor,
    });
    for (const message of payload.messages ?? []) {
      const domain = toDomainMessage(message);
      if (domain) messages.push(domain);
    }
    cursor = payload.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
    await delay(250);
  }

  messages.sort((left, right) => Number(left.ts) - Number(right.ts));
  return messages;
}

async function fetchPermalink(channelId: string, messageTs: string) {
  const payload: SlackPermalinkResponse = await slackGet("chat.getPermalink", {
    channel: channelId,
    message_ts: messageTs,
  });
  return payload.permalink ?? null;
}

interface ThreadTarget {
  channelId: string;
  channelName: string;
  threadTs: string;
  permalink: string | null;
  discoveredParent?: SlackLossParent;
}

function addTarget(targets: Map<string, ThreadTarget>, target: ThreadTarget) {
  const key = `${target.channelId}:${target.threadTs}`;
  const existing = targets.get(key);
  targets.set(key, {
    ...existing,
    ...target,
    permalink: target.permalink ?? existing?.permalink ?? null,
    discoveredParent: target.discoveredParent ?? existing?.discoveredParent,
  });
}

async function collectThreadTargets(input: {
  claimsChannelId: string;
  remoteMarketsChannelId: string;
  escalationsChannelId: string;
  oldest: string;
  maxThreads?: number;
}) {
  const targets = new Map<string, ThreadTarget>();
  const channelErrors: string[] = [];
  const channels = [
    { channelId: input.claimsChannelId, channelName: "claims" },
    { channelId: input.remoteMarketsChannelId, channelName: "remote-markets" },
    { channelId: input.escalationsChannelId, channelName: "escalations" },
  ];

  for (const channel of channels) {
    let parents: SlackLossParent[];
    try {
      parents = await fetchChannelParents({ ...channel, oldest: input.oldest });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // One private or renamed channel must not freeze #claims and remote-market
      // refreshes. Preserve the exact source warning for the admin source panel.
      channelErrors.push(`#${channel.channelName}: ${detail}`);
      console.warn(`[Loss Intake Sync] Skipping unreadable #${channel.channelName}: ${detail}`);
      continue;
    }
    for (const parent of parents) {
      if (!parseLossNoticeParent(parent)) continue;
      // Skip posts that are already stored as duplicates — their original thread
      // is the source of truth and will be picked up via the stage/slaState queries below.
      const slackKey = `${parent.channelId}:${parent.ts}`;
      const existingRecord = await getLossIntakeClaimBySlackKey(slackKey);
      if (existingRecord?.isDuplicate) {
        console.log(`[Loss Intake Sync] Skipping known duplicate post ${slackKey} → original ${existingRecord.originalSlackKey}`);
        continue;
      }
      addTarget(targets, {
        channelId: parent.channelId,
        channelName: parent.channelName,
        threadTs: parent.ts,
        permalink: null,
        discoveredParent: parent,
      });
    }
    await delay(250);
  }

  for (const stage of ["awaiting_outreach", "outreach_started", "contact_attempts"] as const) {
    const { claims } = await listLossIntakeClaims({ stage, limit: 200, offset: 0 });
    for (const claim of claims) {
      addTarget(targets, {
        channelId: claim.channelId,
        channelName: claim.channelName,
        threadTs: claim.slackMessageTs,
        permalink: claim.slackPermalink,
      });
    }
  }

  // Also include breached claims — they may have completion/contact data in the
  // original Slack thread that hasn't been picked up yet (e.g. Ana completing
  // a thread that Bennet forwarded, or late replies after the SLA window).
  for (const slaState of ["breached"] as const) {
    const { claims } = await listLossIntakeClaims({ slaState, limit: 200, offset: 0 });
    for (const claim of claims) {
      // Only add if not already in targets (non-complete breached claims)
      addTarget(targets, {
        channelId: claim.channelId,
        channelName: claim.channelName,
        threadTs: claim.slackMessageTs,
        permalink: claim.slackPermalink,
      });
    }
  }

  return {
    targets: Array.from(targets.values())
      .sort((left, right) => Number(left.threadTs) - Number(right.threadTs))
      .slice(0, Math.max(1, Math.min(input.maxThreads ?? MAX_THREADS_PER_RUN, MAX_THREADS_PER_RUN))),
    channelErrors,
  };
}

export interface LossIntakeSyncResult {
  claimsDiscovered: number;
  claimsUpdated: number;
  eventsProcessed: number;
  targetsProcessed: number;
  channelErrors: string[];
}

/**
 * Optional bounded historical replay support. The ordinary scheduled path keeps
 * using the stored cursor; an explicit `oldest` is reserved for a deliberate,
 * non-publishing reconciliation pass and is always capped to the normal
 * per-run thread limit.
 */
export interface LossIntakeSlackSyncOptions {
  oldest?: string;
  maxThreads?: number;
}

/**
 * Re-fetch and re-analyze a single Slack thread, updating the claim record with
 * the latest completion/contact data. Used when a duplicate FNOL is detected to
 * reconcile the original thread (e.g. Ana completing a thread that Bennet forwarded).
 */
export async function resyncLossIntakeThread(input: {
  channelId: string;
  channelName: string;
  threadTs: string;
  permalink?: string | null;
  assignments: IntakeAgentAssignment[];
  slaMinutes: number;
  atRiskMinutes: number;
}): Promise<boolean> {
  try {
    requireSlackToken();
    const thread = await enrichStoreOpsMessages(await fetchThread(input.channelId, input.threadTs));
    const threadParent = thread[0];
    if (!threadParent) return false;
    const permalink = input.permalink ?? await fetchPermalink(input.channelId, input.threadTs);
    const parent: SlackLossParent = {
      ...threadParent,
      channelId: input.channelId,
      channelName: input.channelName,
      permalink,
    };
    const parsedParent = parseLossNoticeParent(parent);
    if (!parsedParent) return false;
    const slackAnalysis = analyzeFnolThread({
      parent: parsedParent,
      replies: thread.slice(1),
      assignments: input.assignments,
      slaMinutes: input.slaMinutes,
      atRiskMinutes: input.atRiskMinutes,
    });
    const analysis = applyClaimsTrackerCorroboration(slackAnalysis, await getClaimsTrackerIndex(), {
      memberName: parsedParent.memberName,
      dateOfLoss: parsedParent.dateOfLoss,
      vinLastSix: slackAnalysis.correctedVinLastSix ?? parsedParent.vinLastSix,
    });
    await upsertLossIntakeClaimBundle({ parent: parsedParent, analysis });
    console.log(`[Loss Intake] Reconciled original thread ${input.channelId}:${input.threadTs} — stage=${analysis.stage}, completed=${!!analysis.completedAt}`);
    return true;
  } catch (error) {
    console.error(`[Loss Intake] Failed to resync thread ${input.channelId}:${input.threadTs}:`, error);
    return false;
  }
}

export async function runLossIntakeSlackSync(options: LossIntakeSlackSyncOptions = {}): Promise<LossIntakeSyncResult> {
  const runId = await startLossIntakeSyncRun();
  try {
    requireSlackToken();
    const settings = await getLossIntakeSettings();
    const assignments = parseAssignments(settings.agentAssignments);
    const targetResult = await collectThreadTargets({
      claimsChannelId: settings.claimsChannelId,
      remoteMarketsChannelId: settings.remoteMarketsChannelId,
      escalationsChannelId: settings.escalationsChannelId,
      oldest: options.oldest ?? incrementalOldest(settings.lastSuccessfulSyncAt),
      maxThreads: options.maxThreads,
    });
    const targets = targetResult.targets;
    const claimsTrackerIndex = await getClaimsTrackerIndex();

    let claimsDiscovered = 0;
    let claimsUpdated = 0;
    let eventsProcessed = 0;

    for (const target of targets) {
      const thread = await enrichStoreOpsMessages(await fetchThread(target.channelId, target.threadTs));
      const threadParent = thread[0];
      if (!threadParent) continue;
      let permalink = target.permalink;
      if (!permalink) {
        permalink = await fetchPermalink(target.channelId, target.threadTs);
        await delay(150);
      }
      const parent: SlackLossParent = {
        ...threadParent,
        channelId: target.channelId,
        channelName: target.channelName,
        permalink,
      };
      const parsedParent = parseLossNoticeParent(parent);
      if (!parsedParent) continue;
      if (target.discoveredParent) claimsDiscovered += 1;

      const slackAnalysis = analyzeFnolThread({
        parent: parsedParent,
        replies: thread.slice(1),
        assignments,
        slaMinutes: settings.firstContactSlaMinutes,
        atRiskMinutes: settings.atRiskMinutes,
      });
      const analysis = applyClaimsTrackerCorroboration(slackAnalysis, claimsTrackerIndex, {
        memberName: parsedParent.memberName,
        dateOfLoss: parsedParent.dateOfLoss,
        vinLastSix: slackAnalysis.correctedVinLastSix ?? parsedParent.vinLastSix,
      });
      const primary = await findPrimaryLossIntakeClaimByDuplicateGroup({
        duplicateGroupKey: analysis.duplicateGroupKey,
        customerId: parsedParent.customerId,
        vinLastSix: analysis.correctedVinLastSix ?? parsedParent.vinLastSix,
      });
      const isDuplicate = Boolean(primary && primary.slackKey !== parsedParent.slackKey);
      await upsertLossIntakeClaimBundle({
        parent: parsedParent,
        analysis,
        isDuplicate,
        originalSlackKey: isDuplicate ? primary?.slackKey ?? null : null,
      });
      claimsUpdated += 1;
      eventsProcessed += analysis.events.length;
      await delay(150);
    }

    const result = {
      claimsDiscovered,
      claimsUpdated,
      eventsProcessed,
      targetsProcessed: targets.length,
      channelErrors: targetResult.channelErrors,
    };
    await finishLossIntakeSyncRun(runId, {
      status: "success",
      ...result,
      errorMessage: targetResult.channelErrors.length ? targetResult.channelErrors.join(" | ") : null,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause instanceof Error ? `\nCaused by: ${error.cause.message}` : "";
    console.error("[Loss Intake Sync] FAILED:", message, cause);
    await finishLossIntakeSyncRun(runId, {
      status: "failed",
      errorMessage: (message + cause).slice(0, 4_000),
    }).catch(() => undefined);
    throw error;
  }
}
