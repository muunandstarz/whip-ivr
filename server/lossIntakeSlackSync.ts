import { ENV } from "./_core/env";
import {
  finishLossIntakeSyncRun,
  getLossIntakeSettings,
  listLossIntakeClaims,
  startLossIntakeSyncRun,
  upsertLossIntakeClaimBundle,
} from "./lossIntakeDb";
import {
  analyzeFnolThread,
  parseFnolParent,
  type IntakeAgentAssignment,
  type SlackFileRef,
  type SlackLossMessage,
  type SlackLossParent,
} from "./lossIntakeDomain";

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
  oldest: string;
}) {
  const targets = new Map<string, ThreadTarget>();
  const channels = [
    { channelId: input.claimsChannelId, channelName: "claims" },
    { channelId: input.remoteMarketsChannelId, channelName: "remote-markets" },
  ];

  for (const channel of channels) {
    const parents = await fetchChannelParents({ ...channel, oldest: input.oldest });
    for (const parent of parents) {
      if (!parseFnolParent(parent)) continue;
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

  return Array.from(targets.values())
    .sort((left, right) => Number(right.threadTs) - Number(left.threadTs))
    .slice(0, MAX_THREADS_PER_RUN);
}

export interface LossIntakeSyncResult {
  claimsDiscovered: number;
  claimsUpdated: number;
  eventsProcessed: number;
  targetsProcessed: number;
}

export async function runLossIntakeSlackSync(): Promise<LossIntakeSyncResult> {
  const runId = await startLossIntakeSyncRun();
  try {
    requireSlackToken();
    const settings = await getLossIntakeSettings();
    const assignments = parseAssignments(settings.agentAssignments);
    const targets = await collectThreadTargets({
      claimsChannelId: settings.claimsChannelId,
      remoteMarketsChannelId: settings.remoteMarketsChannelId,
      oldest: incrementalOldest(settings.lastSuccessfulSyncAt),
    });

    let claimsDiscovered = 0;
    let claimsUpdated = 0;
    let eventsProcessed = 0;

    for (const target of targets) {
      const thread = await fetchThread(target.channelId, target.threadTs);
      const threadParent = thread[0];
      if (!threadParent) continue;
      let permalink = target.permalink;
      if (!permalink) {
        permalink = await fetchPermalink(target.channelId, target.threadTs);
        await delay(150);
      }
      const parent: SlackLossParent = {
        ...(target.discoveredParent ?? threadParent),
        channelId: target.channelId,
        channelName: target.channelName,
        permalink,
      };
      const parsedParent = parseFnolParent(parent);
      if (!parsedParent) continue;
      if (target.discoveredParent) claimsDiscovered += 1;

      const analysis = analyzeFnolThread({
        parent: parsedParent,
        replies: thread.slice(1),
        assignments,
        slaMinutes: settings.firstContactSlaMinutes,
        atRiskMinutes: settings.atRiskMinutes,
      });
      await upsertLossIntakeClaimBundle({ parent: parsedParent, analysis });
      claimsUpdated += 1;
      eventsProcessed += analysis.events.length;
      await delay(150);
    }

    const result = {
      claimsDiscovered,
      claimsUpdated,
      eventsProcessed,
      targetsProcessed: targets.length,
    };
    await finishLossIntakeSyncRun(runId, { status: "success", ...result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishLossIntakeSyncRun(runId, {
      status: "failed",
      errorMessage: message.slice(0, 4_000),
    }).catch(() => undefined);
    throw error;
  }
}
