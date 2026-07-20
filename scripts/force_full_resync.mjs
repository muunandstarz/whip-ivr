/**
 * Force a full re-sync of ALL existing loss_intake_claims regardless of stage.
 * This re-fetches every thread from Slack and re-runs analyzeFnolThread with
 * the current agent assignments, updating stage/completion/template fields.
 *
 * Run from project root: node scripts/force_full_resync.mjs
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!DB_URL || !SLACK_TOKEN) {
  console.error("Missing DATABASE_URL or SLACK_BOT_TOKEN");
  process.exit(1);
}

const SLACK_API_BASE = "https://slack.com/api";

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function slackGet(method, params) {
  const url = new URL(`${SLACK_API_BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? "60");
    console.log(`Rate limited — waiting ${retry}s`);
    await delay(retry * 1000);
    return slackGet(method, params);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method} error: ${data.error}`);
  return data;
}

async function fetchThread(channelId, threadTs) {
  const messages = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const payload = await slackGet("conversations.replies", {
      channel: channelId,
      ts: threadTs,
      limit: 200,
      cursor,
    });
    for (const m of payload.messages ?? []) {
      if (m.ts) messages.push({ ts: m.ts, text: m.text ?? "", userId: m.user ?? null, files: m.files ?? [] });
    }
    cursor = payload.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
    await delay(250);
  }
  messages.sort((a, b) => Number(a.ts) - Number(b.ts));
  return messages;
}

// ---- Template detection (mirrors lossIntakeDomain.ts) ----
function isHandlerTemplate(text) {
  const hasFol = /\b(?:facts? of loss|FOL)\s*[:\-–]/i.test(text);
  const hasPrelim = /\b(?:preliminary liability|prelim\s*liability|liability)\s*[:\-–]/i.test(text);
  const hasRideshare = /\b(?:rideshare|TNC)\s*(?:status)?\s*[:\-–]/i.test(text);
  return [hasFol, hasPrelim, hasRideshare].filter(Boolean).length >= 2;
}

function isAcknowledgment(text) {
  return /\b(?:calling|called|on\s+it|got\s+it|on\s+my\s+way|reaching\s+out|contacting|will\s+call|calling\s+now|calling\s+the\s+mbr|on\s+the\s+phone|left\s+(?:a\s+)?(?:vm|voicemail)|texted|emailed)\b/i.test(text);
}

function isContactAttempt(text) {
  return /\b(?:calling|called|left\s+(?:a\s+)?(?:vm|voicemail)|no\s+answer|na\b|n\/a|attempted|attempt|tried|reaching\s+out|texted|emailed|sent\s+(?:a\s+)?text|follow\s*up|follow-up)\b/i.test(text);
}

function minutesBetween(a, b) {
  return (b.getTime() - a.getTime()) / 60000;
}

function eventDate(msg) {
  return new Date(Number(msg.ts) * 1000);
}

// ---- Business hours SLA (mirrors lossIntakeDomain.ts) ----
function getEtOffset(date) {
  // Rough DST: second Sunday March → first Sunday November
  const year = date.getUTCFullYear();
  const marchSecondSun = new Date(Date.UTC(year, 2, 1));
  marchSecondSun.setUTCDate(1 + ((7 - marchSecondSun.getUTCDay()) % 7) + 7);
  const novFirstSun = new Date(Date.UTC(year, 10, 1));
  novFirstSun.setUTCDate(1 + ((7 - novFirstSun.getUTCDay()) % 7));
  const isDST = date >= marchSecondSun && date < novFirstSun;
  return isDST ? -4 : -5;
}

function isBusinessHours(date) {
  const offsetHours = getEtOffset(date);
  const etMs = date.getTime() + offsetHours * 3600000;
  const et = new Date(etMs);
  const day = et.getUTCDay(); // 0=Sun,6=Sat
  const hour = et.getUTCHours();
  const minute = et.getUTCMinutes();
  const minuteOfDay = hour * 60 + minute;
  return day >= 1 && day <= 5 && minuteOfDay >= 9 * 60 && minuteOfDay < 18 * 60;
}

function nextBusinessOpen(date) {
  const offsetHours = getEtOffset(date);
  const etMs = date.getTime() + offsetHours * 3600000;
  const et = new Date(etMs);
  let day = et.getUTCDay();
  // Advance to next business day
  let daysToAdd = 1;
  if (day === 5) daysToAdd = 3; // Friday → Monday
  if (day === 6) daysToAdd = 2; // Saturday → Monday
  const nextOpen = new Date(etMs);
  nextOpen.setUTCDate(nextOpen.getUTCDate() + daysToAdd);
  nextOpen.setUTCHours(9, 0, 0, 0);
  return new Date(nextOpen.getTime() - offsetHours * 3600000);
}

function computeSlaDeadline(postedAt, hasPhotos) {
  if (hasPhotos) {
    return { slaType: "immediate", slaDeadlineAt: new Date(postedAt.getTime() + 10 * 60000) };
  }
  if (!isBusinessHours(postedAt)) {
    const nextOpen = nextBusinessOpen(postedAt);
    return { slaType: "after_hours", slaDeadlineAt: new Date(nextOpen.getTime() + 4 * 60 * 60000) };
  }
  return { slaType: "immediate", slaDeadlineAt: new Date(postedAt.getTime() + 10 * 60000) };
}

async function main() {
  const conn = await createConnection(DB_URL);

  // Load settings + agent assignments
  const [settingsRows] = await conn.execute(
    "SELECT agentAssignments, firstContactSlaMinutes, atRiskMinutes FROM loss_intake_settings LIMIT 1"
  );
  const settings = settingsRows[0];
  let assignments = [];
  try {
    assignments = typeof settings.agentAssignments === "string"
      ? JSON.parse(settings.agentAssignments)
      : (settings.agentAssignments ?? []);
  } catch {}

  console.log(`Loaded ${assignments.length} agent assignments:`, assignments.map(a => `${a.handlerName}=${a.slackUserId}`).join(", "));

  // Load ALL claims
  const [claims] = await conn.execute(
    "SELECT id, channelId, channelName, slackMessageTs, slackPermalink, postedAt, hasPhotos FROM loss_intake_claims ORDER BY postedAt DESC"
  );

  console.log(`Re-syncing ${claims.length} claims...`);

  let updated = 0;
  let completed = 0;
  let errors = 0;

  for (const claim of claims) {
    try {
      const thread = await fetchThread(claim.channelId, claim.slackMessageTs);
      if (!thread.length) continue;

      const postedAt = new Date(claim.postedAt);
      const hasPhotos = Boolean(claim.hasPhotos);
      const { slaType, slaDeadlineAt } = computeSlaDeadline(postedAt, hasPhotos);

      // Find first agent acknowledgment
      const firstAck = thread.slice(1).find(
        m => assignments.some(a => a.slackUserId === m.userId) && isAcknowledgment(m.text)
      );

      // Find template post
      const templateMsg = thread.slice(1).find(
        m => assignments.some(a => a.slackUserId === m.userId) && isHandlerTemplate(m.text)
      );

      // Assigned agent
      let assignedAgent = null;
      let assignedHandlerId = null;
      const firstAgentMsg = thread.slice(1).find(m => assignments.some(a => a.slackUserId === m.userId));
      if (firstAgentMsg) {
        const match = assignments.find(a => a.slackUserId === firstAgentMsg.userId);
        if (match) {
          assignedAgent = match.handlerName;
          assignedHandlerId = match.handlerId;
        }
      }

      // Contact attempts
      const contactAttempts = thread.slice(1).filter(
        m => assignments.some(a => a.slackUserId === m.userId) && isContactAttempt(m.text)
      ).length;

      // No-answer attempts
      const noAnswerAttempts = thread.slice(1).filter(
        m => /\b(?:no\s+answer|na\b|n\/a|left\s+(?:a\s+)?(?:vm|voicemail))\b/i.test(m.text)
      ).length;

      // Timing
      const firstContactAt = firstAck ? eventDate(firstAck) : null;
      const firstContactMinutes = firstContactAt ? minutesBetween(postedAt, firstContactAt) : null;
      const templatePostedAt = templateMsg ? eventDate(templateMsg) : null;
      const templatePostMinutesFromContact = templatePostedAt && firstContactAt
        ? minutesBetween(firstContactAt, templatePostedAt) : null;
      const templatePostMinutesFromReport = templatePostedAt
        ? minutesBetween(postedAt, templatePostedAt) : null;

      // Stage
      let stage = "awaiting_outreach";
      if (templateMsg) {
        stage = "complete";
      } else if (firstAck) {
        stage = "outreach_started";
      } else if (contactAttempts > 0) {
        stage = "contact_attempts";
      }

      // SLA state
      const now = new Date();
      let slaState = "within_sla";
      if (firstContactAt) {
        slaState = "within_sla"; // already contacted
      } else {
        const slaMinutes = settings.firstContactSlaMinutes ?? 10;
        const atRiskMinutes = settings.atRiskMinutes ?? 7;
        const elapsed = minutesBetween(postedAt, now);
        if (elapsed >= slaMinutes) slaState = "breached";
        else if (elapsed >= atRiskMinutes) slaState = "at_risk";
      }

      const completedAt = templateMsg ? eventDate(templateMsg) : null;
      const intakeCycleMinutes = completedAt ? minutesBetween(postedAt, completedAt) : null;

      await conn.execute(
        `UPDATE loss_intake_claims SET
          stage = ?,
          slaState = ?,
          slaType = ?,
          slaDeadlineAt = ?,
          assignedAgent = ?,
          assignedHandlerId = ?,
          firstContactAt = ?,
          firstContactMinutes = ?,
          templatePostedAt = ?,
          templatePostMinutesFromContact = ?,
          templatePostMinutesFromReport = ?,
          contactAttempts = ?,
          noAnswerAttempts = ?,
          completedAt = ?,
          intakeCycleMinutes = ?,
          lastSyncedAt = NOW()
        WHERE id = ?`,
        [
          stage,
          slaState,
          slaType,
          slaDeadlineAt,
          assignedAgent,
          assignedHandlerId,
          firstContactAt,
          firstContactMinutes,
          templatePostedAt,
          templatePostMinutesFromContact,
          templatePostMinutesFromReport,
          contactAttempts,
          noAnswerAttempts,
          completedAt,
          intakeCycleMinutes,
          claim.id,
        ]
      );

      if (stage === "complete") completed++;
      updated++;
      process.stdout.write(`\r  ${updated}/${claims.length} updated (${completed} complete)`);
      await delay(120);
    } catch (err) {
      errors++;
      console.error(`\n  Error on claim ${claim.id}:`, err.message);
    }
  }

  console.log(`\nDone. ${updated} updated, ${completed} marked complete, ${errors} errors.`);
  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
