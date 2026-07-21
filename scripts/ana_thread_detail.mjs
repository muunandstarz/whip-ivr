/**
 * Pull full text of Ana's replies in #claims-remotemarkets today
 * to verify if the second thread has a completed template
 */

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const ANA_USER_ID = "U091NDYN0E6";
const CHANNEL_ID = "C092UPKR79D";

// Today's window in ET
const oldest = Math.floor(new Date("2026-07-20T04:00:00Z").getTime() / 1000);
const latest = Math.floor(new Date("2026-07-21T04:00:00Z").getTime() / 1000);

async function slackGet(method, params) {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${BOT_TOKEN}` },
  });
  return res.json();
}

const history = await slackGet("conversations.history", {
  channel: CHANNEL_ID,
  oldest: oldest.toString(),
  latest: latest.toString(),
  limit: 200,
});

if (!history.ok) {
  console.log("Error:", history.error);
  process.exit(1);
}

const messages = history.messages || [];
console.log(`Messages today: ${messages.length}`);

for (const msg of messages) {
  if (!msg.thread_ts || msg.thread_ts !== msg.ts) continue; // only parent messages

  console.log(`\n${"=".repeat(70)}`);
  console.log(`THREAD ts=${msg.ts} (${new Date(parseFloat(msg.ts) * 1000).toLocaleString("en-US", { timeZone: "America/New_York" })})`);
  console.log(`Parent text (first 300 chars):\n${(msg.text || "").substring(0, 300)}`);

  const replies = await slackGet("conversations.replies", {
    channel: CHANNEL_ID,
    ts: msg.ts,
    limit: 50,
  });

  const allMsgs = replies.messages || [];
  console.log(`\nAll replies (${allMsgs.length} total):`);

  for (const r of allMsgs) {
    const isAna = r.user === ANA_USER_ID;
    const time = new Date(parseFloat(r.ts) * 1000).toLocaleString("en-US", { timeZone: "America/New_York" });
    const prefix = isAna ? "*** ANA ***" : `user=${r.user || r.bot_id || "bot"}`;
    console.log(`\n  [${time}] ${prefix}`);
    console.log(`  ${(r.text || "").replace(/\n/g, "\n  ")}`);
  }
}

process.exit(0);
