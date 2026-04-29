/**
 * Aircall Sync Service
 * Polls the Aircall API every 15 minutes to pull recent calls into call_history.
 * Only syncs calls from the Whip Claims Line — all other Aircall numbers are ignored.
 */
import cron from "node-cron";
import { upsertCallHistory } from "./db";

const AIRCALL_API_BASE = "https://api.aircall.io/v1";

// Only sync calls from the Whip Claims Line (ID 1125090, name "Whip Claims Line")
// This prevents calls from Whip Outbound, Collections, HelpDesk, HR, etc. from polluting analytics.
const WHIP_CLAIMS_NUMBER_ID = 1125090;
const WHIP_CLAIMS_NUMBER_NAME = "Whip Claims Line";

// Credentials stored as env vars (set via webdev_request_secrets)
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
 * Sync calls from the last N minutes into call_history.
 * Uses the Aircall /calls endpoint filtered by from/to timestamps.
 * Only stores calls from the Whip Claims Line (number ID 1125090).
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
      // Filter: only process calls on the Whip Claims Line
      const numberId = call.number?.id ? Number(call.number.id) : null;
      const numberName: string = call.number?.name ?? "";
      const isClaimsLine =
        numberId === WHIP_CLAIMS_NUMBER_ID ||
        numberName === WHIP_CLAIMS_NUMBER_NAME;

      if (!isClaimsLine) {
        skipped++;
        continue;
      }

      const agentUser = call.user ?? null;
      const agentName = agentUser
        ? `${agentUser.first_name ?? ""} ${agentUser.last_name ?? ""}`.trim()
        : null;

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

    // Aircall paginates; stop if we got fewer than 50
    if (calls.length < 50) break;
    page++;
  }

  if (skipped > 0) {
    console.log(`[AircallSync] Skipped ${skipped} calls from non-Claims lines`);
  }
  return synced;
}

function mapStatus(
  status: string,
  missedReason?: string
): "answered" | "missed" | "voicemail" | "abandoned" {
  if (status === "done" || status === "answered") return "answered";
  if (status === "voicemail") return "voicemail";
  if (status === "missed" || status === "abandoned") {
    if (missedReason === "voicemail") return "voicemail";
    return "missed";
  }
  return "missed";
}

let syncRunning = false;

async function runSync() {
  if (syncRunning) return; // prevent overlap
  syncRunning = true;
  try {
    const count = await syncRecentCalls(20);
    if (count > 0) {
      console.log(`[AircallSync] Synced ${count} calls from Whip Claims Line`);
    }
  } catch (err: any) {
    console.error("[AircallSync] Error:", err.message ?? err);
  } finally {
    syncRunning = false;
  }
}

/**
 * Start the 15-minute cron job.
 * Called once from server startup.
 */
export function startAircallSyncJob() {
  if (!process.env.AIRCALL_API_ID || !process.env.AIRCALL_API_TOKEN) {
    console.warn("[AircallSync] Credentials not set — sync job not started. Set AIRCALL_API_ID and AIRCALL_API_TOKEN.");
    return;
  }
  // Run immediately on startup, then every 15 minutes
  runSync();
  cron.schedule("*/15 * * * *", runSync);
  console.log("[AircallSync] Scheduled sync every 15 minutes (Whip Claims Line only)");
}
