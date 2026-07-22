/**
 * One-shot backfill: pull ALL calls from today (midnight UTC) from Aircall
 * and upsert them into call_history with callSource=extension where appropriate.
 *
 * Run: node scripts/backfill-today-extension-calls.mjs
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const AIRCALL_API_BASE = "https://api.aircall.io/v1";
const WHIP_CLAIMS_NUMBER_ID = 1125090;
const WHIP_CLAIMS_NUMBER_NAME = "Whip Claims Line";

function getAuth() {
  const id = process.env.AIRCALL_API_ID;
  const token = process.env.AIRCALL_API_TOKEN;
  if (!id || !token) throw new Error("AIRCALL_API_ID / AIRCALL_API_TOKEN not set");
  return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

async function aircallFetch(path) {
  const res = await fetch(`${AIRCALL_API_BASE}${path}`, {
    headers: { Authorization: getAuth(), "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Aircall ${res.status}: ${await res.text()}`);
  return res.json();
}

function mapStatus(status, missedReason) {
  if (status === "done") {
    if (!missedReason) return "answered";
    if (missedReason === "voicemail") return "voicemail";
    return "missed";
  }
  if (status === "answered") return "answered";
  if (status === "voicemail") return "voicemail";
  return "missed";
}

async function main() {
  // Start of today in UTC
  const now = new Date();
  const todayMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = Math.floor(todayMidnightUTC.getTime() / 1000);
  console.log(`Fetching calls since ${todayMidnightUTC.toISOString()} (unix=${from})`);

  // First fetch all drivewhip users to build number → handler map
  const EMAIL_TO_HANDLER = {
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

  const allowedNumberIds = new Set([WHIP_CLAIMS_NUMBER_ID]);
  const allowedNumberNames = new Set([WHIP_CLAIMS_NUMBER_NAME]);
  const userIdToHandler = new Map();
  const userIdToName = new Map();

  let page = 1;
  while (true) {
    const data = await aircallFetch(`/users?per_page=50&page=${page}`);
    const users = data.users ?? [];
    if (users.length === 0) break;
    for (const user of users) {
      const email = (user.email ?? "").toLowerCase();
      const uid = user.id ? Number(user.id) : null;
      if (uid) {
        const fullName = (user.name ?? `${user.first_name ?? ""} ${user.last_name ?? ""}`).trim();
        if (fullName) userIdToName.set(uid, fullName);
      }
      if (!email.endsWith("@drivewhip.com")) continue;
      if (uid && EMAIL_TO_HANDLER[email]) userIdToHandler.set(uid, EMAIL_TO_HANDLER[email]);
      for (const num of (user.numbers ?? [])) {
        if (num.id) allowedNumberIds.add(Number(num.id));
        if (num.name) allowedNumberNames.add(String(num.name));
      }
    }
    if (users.length < 50) break;
    page++;
  }
  console.log(`Loaded ${allowedNumberIds.size} number IDs, ${userIdToHandler.size} handler mappings`);

  // Fetch today's calls
  let allCalls = [];
  page = 1;
  while (true) {
    const data = await aircallFetch(`/calls?from=${from}&order=asc&per_page=50&page=${page}`);
    const calls = data.calls ?? [];
    if (calls.length === 0) break;
    allCalls = allCalls.concat(calls);
    if (calls.length < 50) break;
    page++;
  }
  console.log(`Fetched ${allCalls.length} total calls from Aircall today`);

  // Filter to claims-team calls
  const claimsCalls = allCalls.filter(call => {
    const numberId = call?.number?.id ? Number(call.number.id) : null;
    const numberName = call?.number?.name ?? "";
    const agentId = call?.user?.id ? Number(call.user.id) : null;
    if (agentId && userIdToHandler.has(agentId)) return true;
    if (numberId && allowedNumberIds.has(numberId)) return true;
    if (numberName && allowedNumberNames.has(numberName)) return true;
    return false;
  });
  console.log(`${claimsCalls.length} claims-team calls to upsert`);

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  let upserted = 0;
  for (const call of claimsCalls) {
    const agentUser = call.user ?? null;
    const agentIdForName = agentUser ? Number(agentUser.id) : null;
    const agentName = agentUser
      ? ((agentUser.name ?? `${agentUser.first_name ?? ""} ${agentUser.last_name ?? ""}`).trim() ||
         (agentIdForName ? userIdToName.get(agentIdForName) ?? null : null))
      : (agentIdForName ? userIdToName.get(agentIdForName) ?? null : null);

    const numberId = call.number?.id ? Number(call.number.id) : null;
    let callSource;
    if (call.direction === "outbound") {
      callSource = "outbound";
    } else if (numberId === WHIP_CLAIMS_NUMBER_ID || (call.number?.name ?? "") === WHIP_CLAIMS_NUMBER_NAME) {
      callSource = "ring_group";
    } else {
      callSource = "extension";
    }

    const status = mapStatus(call.status, call.missed_call_reason);
    const startedAt = call.started_at ? new Date(call.started_at * 1000) : new Date();
    const endedAt = call.ended_at ? new Date(call.ended_at * 1000) : null;
    const aircallCallId = String(call.id);

    await conn.execute(
      `INSERT INTO call_history
         (aircallCallId, callerPhone, status, agentId, agentName, durationSeconds,
          recordingUrl, voicemailUrl, startedAt, endedAt, direction,
          aircallNumberName, aircallNumberId, callSource)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         agentId = VALUES(agentId),
         agentName = VALUES(agentName),
         durationSeconds = VALUES(durationSeconds),
         recordingUrl = VALUES(recordingUrl),
         voicemailUrl = VALUES(voicemailUrl),
         endedAt = VALUES(endedAt),
         aircallNumberName = VALUES(aircallNumberName),
         aircallNumberId = VALUES(aircallNumberId),
         callSource = VALUES(callSource)`,
      [
        aircallCallId,
        call.raw_digits ?? call.number?.digits ?? null,
        status,
        agentUser ? Number(agentUser.id) : null,
        agentName || null,
        call.duration ?? 0,
        call.recording ?? null,
        call.voicemail ?? null,
        startedAt,
        endedAt,
        call.direction === "outbound" ? "outbound" : "inbound",
        call.number?.name ?? null,
        numberId,
        callSource,
      ]
    );
    upserted++;
    if (upserted % 10 === 0) process.stdout.write(".");
  }

  await conn.end();
  console.log(`\nDone. Upserted ${upserted} calls (${claimsCalls.filter(c => {
    const nid = c.number?.id ? Number(c.number.id) : null;
    return c.direction !== "outbound" && nid !== WHIP_CLAIMS_NUMBER_ID && (c.number?.name ?? "") !== WHIP_CLAIMS_NUMBER_NAME;
  }).length} extension calls).`);
}

main().catch(err => { console.error(err); process.exit(1); });
