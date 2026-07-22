/**
 * Diagnostic: show what number IDs/names appear in today's Aircall calls
 * and what callSource they would get.
 */
import * as dotenv from "dotenv";
dotenv.config();

const AIRCALL_API_BASE = "https://api.aircall.io/v1";
const WHIP_CLAIMS_NUMBER_ID = 1125090;
const WHIP_CLAIMS_NUMBER_NAME = "Whip Claims Line";

function getAuth() {
  const id = process.env.AIRCALL_API_ID;
  const token = process.env.AIRCALL_API_TOKEN;
  return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

async function aircallFetch(path) {
  const res = await fetch(`${AIRCALL_API_BASE}${path}`, {
    headers: { Authorization: getAuth(), "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Aircall ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const now = new Date();
  const todayMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = Math.floor(todayMidnightUTC.getTime() / 1000);

  // Build handler map
  const EMAIL_TO_HANDLER = {
    "natashiae@drivewhip.com": "Natashia",
    "jayla.bernard@drivewhip.com": "Jayla",
    "mj.badua@drivewhip.com": "MJ",
    "carlito.legarde@drivewhip.com": "Carlito",
    "annie.ortiz@drivewhip.com": "Annie",
    "anap@drivewhip.com": "Ana",
    "catherine.cestina@drivewhip.com": "Catherine",
    "lorraine.tria@drivewhip.com": "Lorraine",
    "daniel.giono@drivewhip.com": "Daniel",
    "jovel.villa@drivewhip.com": "Jovel",
    "daryl.ochate@drivewhip.com": "Daryl",
    "madeline.green@drivewhip.com": "Madeline",
    "demily.flores@drivewhip.com": "Demily",
    "tim.chan@drivewhip.com": "Tim",
    "geovanni.cabrera@drivewhip.com": "Geovanni",
  };

  const allowedNumberIds = new Set([WHIP_CLAIMS_NUMBER_ID]);
  const allowedNumberNames = new Set([WHIP_CLAIMS_NUMBER_NAME]);
  const userIdToHandler = new Map();

  let page = 1;
  while (true) {
    const data = await aircallFetch(`/users?per_page=50&page=${page}`);
    const users = data.users ?? [];
    if (users.length === 0) break;
    for (const user of users) {
      const email = (user.email ?? "").toLowerCase();
      const uid = user.id ? Number(user.id) : null;
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

  console.log("Allowed number IDs:", [...allowedNumberIds]);
  console.log("Allowed number names:", [...allowedNumberNames]);

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

  // Show breakdown by number
  const byNumber = new Map();
  for (const call of allCalls) {
    const numberId = call?.number?.id ? Number(call.number.id) : null;
    const numberName = call?.number?.name ?? "unknown";
    const agentId = call?.user?.id ? Number(call.user.id) : null;
    const isClaimsTeam = (agentId && userIdToHandler.has(agentId)) ||
      (numberId && allowedNumberIds.has(numberId)) ||
      (numberName && allowedNumberNames.has(numberName));
    if (!isClaimsTeam) continue;

    let callSource;
    if (call.direction === "outbound") callSource = "outbound";
    else if (numberId === WHIP_CLAIMS_NUMBER_ID || numberName === WHIP_CLAIMS_NUMBER_NAME) callSource = "ring_group";
    else callSource = "extension";

    const key = `${numberId} | ${numberName} | ${callSource}`;
    byNumber.set(key, (byNumber.get(key) ?? 0) + 1);
  }

  console.log("\nClaims-team call breakdown by number (today):");
  for (const [key, count] of [...byNumber.entries()].sort()) {
    console.log(`  ${count.toString().padStart(3)}  ${key}`);
  }

  // Show a sample of extension calls
  const extensionCalls = allCalls.filter(call => {
    const numberId = call?.number?.id ? Number(call.number.id) : null;
    const numberName = call?.number?.name ?? "";
    const agentId = call?.user?.id ? Number(call.user.id) : null;
    const isClaimsTeam = (agentId && userIdToHandler.has(agentId)) ||
      (numberId && allowedNumberIds.has(numberId)) ||
      (numberName && allowedNumberNames.has(numberName));
    if (!isClaimsTeam) return false;
    return call.direction !== "outbound" && numberId !== WHIP_CLAIMS_NUMBER_ID && numberName !== WHIP_CLAIMS_NUMBER_NAME;
  });

  console.log(`\nExtension calls (${extensionCalls.length} total). First 5:`);
  for (const call of extensionCalls.slice(0, 5)) {
    console.log(JSON.stringify({
      id: call.id,
      direction: call.direction,
      status: call.status,
      missed_call_reason: call.missed_call_reason,
      number: call.number,
      user: call.user ? { id: call.user.id, name: call.user.name } : null,
      duration: call.duration,
      started_at: call.started_at,
    }, null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
