/**
 * Aircall Sync Service
 * Polls the Aircall API every 15 minutes to pull recent calls into call_history.
 *
 * Syncs calls for ALL numbers that belong to the Whip Claims team.
 * "Claims team" is determined by fetching the Aircall /users list and keeping
 * only users whose email ends in @drivewhip.com.  Any number that has at least
 * one drivewhip.com agent assigned to it is treated as a claims-team number.
 * Helpdesk, billing, HR, and other non-claims numbers are automatically excluded.
 *
 * The Whip Claims Line (ID 1125090) is always included as a hard-coded fallback
 * so voicemail intake continues even if the user-list fetch fails.
 */
import cron from "node-cron";
import { upsertCallHistory } from "./db";
import { classifyCallBatch } from "./classifyCalls";

const AIRCALL_API_BASE = "https://api.aircall.io/v1";

// Hard-coded fallback — always include the main Claims Line
const WHIP_CLAIMS_NUMBER_ID = 1125090;
const WHIP_CLAIMS_NUMBER_NAME = "Whip Claims Line";

// Cache of allowed number IDs (refreshed every sync cycle)
let _allowedNumberIds: Set<number> = new Set([WHIP_CLAIMS_NUMBER_ID]);
let _allowedNumberNames: Set<string> = new Set([WHIP_CLAIMS_NUMBER_NAME]);
let _aircallUserIdToHandler: Map<number, { id: number; name: string }> = new Map();
// Full aircallUserId → display name map for ALL users (used to populate agentName on every call)
let _aircallUserIdToName: Map<number, string> = new Map();

function getAircallAuth(): string {
  const id = process.env.AIRCALL_API_ID;
  const token = process.env.AIRCALL_API_TOKEN;
  if (!id || !token) {
    throw new Error("AIRCALL_API_ID and AIRCALL_API_TOKEN must be set");
  }
  return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

async function aircallFetch(path: string): Promise<any> {
  const res = await fetch(`${AIRCALL_API_BASE}${path}`, {
    headers: {
      Authorization: getAircallAuth(),
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Aircall API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetch all Aircall users and build:
 *   1. A set of number IDs/names that belong to drivewhip.com agents
 *   2. A map of aircallUserId → handler (for extension-based voicemail routing)
 *
 * Handler name matching uses the HANDLER_ROUTING table from aircall.ts by
 * looking up the user's email against known drivewhip.com emails.
 */
export async function refreshClaimsTeamNumbers(): Promise<void> {
  try {
    // Known drivewhip.com handler emails → handler info
    const EMAIL_TO_HANDLER: Record<string, { id: number; name: string }> = {
      "natashiae@drivewhip.com":           { id: 1,     name: "Natashia Edulan" },
      "jayla.bernard@drivewhip.com":       { id: 2,     name: "Jayla Bernard" },
      "mj.badua@drivewhip.com":            { id: 3,     name: "Mary Joy Badua" },
      "carlito.legarde@drivewhip.com":     { id: 4,     name: "Carlito Legarde Jr" },
      "annie.ortiz@drivewhip.com":         { id: 5,     name: "Annie Ortiz" },
      "anap@drivewhip.com":                { id: 6,     name: "Ana Padilla" },
      "catherine.cestina@drivewhip.com":   { id: 7,     name: "Catherine Cestina" },
      "lorraine.tria@drivewhip.com":       { id: 9,     name: "Lorraine Tria" },
      "daniel.giono@drivewhip.com":        { id: 10,    name: "Daniel Giono" },
      "jovel.villa@drivewhip.com":         { id: 30001, name: "Jovel Villa" },
      "daryl.ochate@drivewhip.com":        { id: 30002, name: "Daryl Ochate" },
      "madeline.green@drivewhip.com":      { id: 30004, name: "Madeline Green" },
      "demily.flores@drivewhip.com":       { id: 30005, name: "Demily Flores" },
      "tim.chan@drivewhip.com":            { id: 90001, name: "Tim Chan" },
      "geovanni.cabrera@drivewhip.com":    { id: 90002, name: "Geovanni Cabrera" },
    };

    const newAllowedIds = new Set<number>([WHIP_CLAIMS_NUMBER_ID]);
    const newAllowedNames = new Set<string>([WHIP_CLAIMS_NUMBER_NAME]);
    const newUserMap = new Map<number, { id: number; name: string }>();
    const newUserIdToName = new Map<number, string>();

    // Fetch all Aircall users (paginated)
    let page = 1;
    while (true) {
      const data = await aircallFetch(`/users?per_page=50&page=${page}`);
      const users: any[] = data.users ?? [];
      if (users.length === 0) break;

      for (const user of users) {
        const email: string = (user.email ?? "").toLowerCase();
        const aircallUserId = user.id ? Number(user.id) : null;

        // Build full name map for ALL users (used for agentName on every call)
        if (aircallUserId) {
          const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
          if (fullName) newUserIdToName.set(aircallUserId, fullName);
        }

        // Only process drivewhip.com accounts for handler routing
        if (!email.endsWith("@drivewhip.com")) continue;

        // Map aircall user ID → handler for extension routing
        if (aircallUserId && EMAIL_TO_HANDLER[email]) {
          newUserMap.set(aircallUserId, EMAIL_TO_HANDLER[email]);
        }

        // Collect all number IDs/names assigned to this user
        const numbers: any[] = user.numbers ?? [];
        for (const num of numbers) {
          if (num.id) newAllowedIds.add(Number(num.id));
          if (num.name) newAllowedNames.add(String(num.name));
        }
      }

      if (users.length < 50) break;
      page++;
    }

    _allowedNumberIds = newAllowedIds;
    _allowedNumberNames = newAllowedNames;
    _aircallUserIdToHandler = newUserMap;
    _aircallUserIdToName = newUserIdToName;

    console.log(
      `[AircallSync] Claims-team numbers refreshed: ${newAllowedIds.size} number IDs, ` +
      `${newUserMap.size} agent→handler mappings`
    );
  } catch (err: any) {
    console.warn("[AircallSync] Could not refresh claims-team numbers:", err.message ?? err);
    // Keep existing cache — don't wipe it on transient errors
  }
}

/**
 * Returns the handler assigned to an Aircall user ID, if known.
 * Used by the voicemail intake pipeline for extension-based routing.
 */
export function getHandlerByAircallUserId(
  aircallUserId: number | null | undefined
): { id: number; name: string } | null {
  if (!aircallUserId) return null;
  return _aircallUserIdToHandler.get(aircallUserId) ?? null;
}

function isClaimsTeamCall(call: any): boolean {
  const numberId = call?.number?.id ? Number(call.number.id) : null;
  const numberName: string = call?.number?.name ?? "";
  // Also check the agent — if the agent is a drivewhip.com handler, include the call
  const agentId = call?.user?.id ? Number(call.user.id) : null;
  if (agentId && _aircallUserIdToHandler.has(agentId)) return true;
  if (numberId && _allowedNumberIds.has(numberId)) return true;
  if (numberName && _allowedNumberNames.has(numberName)) return true;
  return false;
}

/**
 * Sync calls from the last N minutes into call_history.
 * Includes all calls handled by claims-team numbers or agents.
 */
export async function syncRecentCalls(lookbackMinutes = 20): Promise<number> {
  const from = Math.floor((Date.now() - lookbackMinutes * 60 * 1000) / 1000);
  let page = 1;
  let synced = 0;
  let skipped = 0;

  while (true) {
    const data = await aircallFetch(
      `/calls?from=${from}&order=asc&per_page=50&page=${page}`
    );
    const calls: any[] = data.calls ?? [];
    if (calls.length === 0) break;

    for (const call of calls) {
      if (!isClaimsTeamCall(call)) {
        skipped++;
        continue;
      }

      const agentUser = call.user ?? null;
      // Resolve name: prefer call.user fields, fall back to the cached full-user map
      const agentIdForName = agentUser ? Number(agentUser.id) : null;
      const agentName = agentUser
        ? (`${agentUser.first_name ?? ""} ${agentUser.last_name ?? ""}`.trim() ||
           (agentIdForName ? _aircallUserIdToName.get(agentIdForName) ?? null : null))
        : (agentIdForName ? _aircallUserIdToName.get(agentIdForName) ?? null : null);
      const numberId = call.number?.id ? Number(call.number.id) : null;

      await upsertCallHistory({
        aircallCallId: String(call.id),
        callerPhone: call.raw_digits ?? call.number?.digits ?? null,
        status: mapStatus(call.status, call.missed_call_reason),
        agentId: agentUser ? Number(agentUser.id) : null,
        agentName: agentName || null,
        durationSeconds: call.duration ?? 0,
        recordingUrl: call.recording ?? null,
        voicemailUrl: call.voicemail ?? null,
        startedAt: call.started_at ? new Date(call.started_at * 1000) : new Date(),
        endedAt: call.ended_at ? new Date(call.ended_at * 1000) : null,
        direction: (call.direction === "outbound" ? "outbound" : "inbound") as "inbound" | "outbound",
        aircallNumberName: call.number?.name ?? null,
        aircallNumberId: numberId,
      });
      synced++;
    }

    if (calls.length < 50) break;
    page++;
  }

  if (skipped > 0) {
    console.log(`[AircallSync] Skipped ${skipped} non-claims-team calls`);
  }
  return synced;
}

function mapStatus(
  status: string,
  missedReason?: string
): "answered" | "missed" | "voicemail" | "abandoned" {
  // Aircall uses status='done' for ALL completed calls.
  // The missed_call_reason field distinguishes answered from missed:
  //   null                  → answered
  //   'voicemail'           → voicemail
  //   'short_abandoned'     → missed (caller hung up quickly)
  //   'out_of_opening_hours'→ missed (called outside business hours)
  //   'agents_did_not_answer'→ missed (rang, no pickup)
  //   any other reason      → missed
  if (status === "done") {
    if (!missedReason) return "answered";
    if (missedReason === "voicemail") return "voicemail";
    return "missed";
  }
  // Legacy status values (older API responses)
  if (status === "answered") return "answered";
  if (status === "voicemail") return "voicemail";
  if (status === "missed" || status === "abandoned") {
    if (missedReason === "voicemail") return "voicemail";
    return "missed";
  }
  return "missed";
}

/**
 * Pull unread voicemails from each handler's personal Aircall mailbox into intake records.
 * Uses GET /v1/calls/search?user_id={id}&direction=inbound for each known handler.
 * Any call with a voicemail URL that isn't already in intake_records gets processed.
 */
export async function syncAssignedVoicemails(): Promise<number> {
  if (_aircallUserIdToHandler.size === 0) return 0;

  const { processVoicemail } = await import("./aircall");
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Fetch all aircallCallIds already in intake_records to avoid duplicates
  const [existingRows] = await conn.query(
    "SELECT aircallCallId FROM intake_records WHERE aircallCallId IS NOT NULL"
  ) as any[];
  const existingIds = new Set<string>((existingRows as any[]).map((r: any) => String(r.aircallCallId)));
  await conn.end();

  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  let imported = 0;

  for (const [aircallUserId, handler] of Array.from(_aircallUserIdToHandler.entries())) {
    try {
      let page = 1;
      while (true) {
        const data = await aircallFetch(
          `/calls/search?user_id=${aircallUserId}&direction=inbound&from=${sevenDaysAgo}&order=desc&per_page=50&page=${page}`
        );
        const calls: any[] = data.calls ?? [];
        if (calls.length === 0) break;

        for (const call of calls) {
          const voicemailUrl: string | null = call.voicemail ?? null;
          if (!voicemailUrl) continue; // no voicemail on this call

          const callId = String(call.id);
          if (existingIds.has(callId)) continue; // already imported

          console.log(`[AircallSync] Importing assigned voicemail for ${handler.name}: call ${callId}`);
          try {
            await processVoicemail({
              aircallCallId: callId,
              callerPhone: call.raw_digits ?? "",
              voicemailUrl,
              startedAt: call.started_at ? new Date(call.started_at * 1000) : new Date(),
              endedAt: call.ended_at ? new Date(call.ended_at * 1000) : undefined,
              aircallNumberId: call.number?.id ? Number(call.number.id) : undefined,
              aircallNumberName: call.number?.name ?? undefined,
              aircallAgentId: aircallUserId,
              routingMethod: "extension",
            });
            existingIds.add(callId); // prevent double-import in same cycle
            imported++;
          } catch (err: any) {
            console.error(`[AircallSync] Failed to import assigned voicemail ${callId}:`, err.message ?? err);
          }
        }

        if (calls.length < 50) break;
        page++;
      }
    } catch (err: any) {
      console.warn(`[AircallSync] Could not fetch assigned voicemails for handler ${handler.name}:`, err.message ?? err);
    }
  }

  if (imported > 0) {
    console.log(`[AircallSync] Imported ${imported} assigned voicemails from handler mailboxes`);
  }
  return imported;
}

let syncRunning = false;

async function runSync() {
  if (syncRunning) return;
  syncRunning = true;
  try {
    // Refresh the claims-team number/user map first so it stays current
    await refreshClaimsTeamNumbers();
    const count = await syncRecentCalls(20);
    if (count > 0) {
      console.log(`[AircallSync] Synced ${count} calls from claims-team numbers`);
    }
    // Also pull any unread assigned voicemails from handler personal mailboxes
    await syncAssignedVoicemails();
    // Auto-classify any calls that arrived without a callerType (runs silently after sync)
    try {
      const classified = await classifyCallBatch(20);
      if (classified.processed > 0) {
        console.log(`[AircallSync] Auto-classified ${classified.processed} calls (${classified.succeeded} succeeded, ${classified.failed} failed)`);
      }
    } catch (classifyErr: any) {
      console.warn("[AircallSync] Auto-classify step failed:", classifyErr.message ?? classifyErr);
    }
  } catch (err: any) {
    console.error("[AircallSync] Error:", err.message ?? err);
  } finally {
    syncRunning = false;
  }
}

/**
 * Start the 15-minute cron job + weekly QA auto-generation.
 * Called once from server startup.
 */
export function startAircallSyncJob() {
  if (!process.env.AIRCALL_API_ID || !process.env.AIRCALL_API_TOKEN) {
    console.warn("[AircallSync] Credentials not set — sync job not started.");
    return;
  }
  // Warm up the number/user map immediately, then start sync
  refreshClaimsTeamNumbers().then(() => {
    runSync();
    cron.schedule("*/15 * * * *", runSync);
    console.log("[AircallSync] Scheduled sync every 15 minutes (all claims-team numbers)");
  });

  // Weekly QA report: every Monday at 8:00 AM (server local time)
  cron.schedule("0 8 * * 1", async () => {
    console.log("[WeeklyQA] Starting auto-generation of weekly QA reports...");
    try {
      const { generateWeeklyQAReport, getHandlers, saveHandlerScorecard } = await import("./db");
      const { notifyOwner } = await import("./_core/notification");
      // Get Monday of current week
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      const weekStart = monday.toISOString().slice(0, 10);
      const results = await generateWeeklyQAReport(weekStart);
      const handlers = await getHandlers();
      let saved = 0;
      for (const r of results) {
        const handler = handlers.find((h) =>
          h.name.toLowerCase().includes(r.handlerName.toLowerCase()) ||
          r.handlerName.toLowerCase().includes(h.name.toLowerCase())
        );
        if (handler) {
          await saveHandlerScorecard({
            handlerId: handler.id,
            handlerName: r.handlerName,
            weekOf: r.weekOf,
            greetingScore: r.greetingScore,
            holdManagementScore: r.holdManagementScore,
            resolutionScore: r.resolutionScore,
            empathyScore: r.empathyScore,
            callControlScore: r.callControlScore,
            overallScore: r.overallScore,
            strengths: r.strengths.join("\n"),
            improvements: r.improvements.join("\n"),
            managerComments: r.coachingNote,
            submittedBy: "Auto-QA",
          });
          saved++;
        }
      }
      const avgScore = results.length > 0
        ? (results.reduce((s, r) => s + r.overallScore, 0) / results.length).toFixed(1)
        : "N/A";
      await notifyOwner({
        title: `✅ Weekly QA Report Generated — ${weekStart}`,
        content: `Auto-generated QA scorecards for ${saved} handler${saved !== 1 ? 's' : ''} (week of ${weekStart}). Team avg score: ${avgScore}/10. View the full report in Weekly QA.`,
      });
      console.log(`[WeeklyQA] Generated ${saved} scorecards for week ${weekStart}, avg score ${avgScore}`);
    } catch (err: any) {
      console.error("[WeeklyQA] Auto-generation failed:", err.message ?? err);
    }
  });
  console.log("[WeeklyQA] Scheduled weekly QA auto-generation every Monday at 8:00 AM");
}
