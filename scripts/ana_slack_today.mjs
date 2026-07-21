/**
 * Query Slack directly for Ana's activity today in #claims and #claims-remotemarkets
 * Ana's Slack user ID: U091NDYN0E6
 * Today: Jul 20, 2026 (local ET = Jul 20; UTC = Jul 20/21 boundary)
 */

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const ANA_USER_ID = "U091NDYN0E6";

// Channel IDs (from previous investigation)
const CHANNELS = [
  { id: "C0BHDG7RX7D", name: "#claims" },
  { id: "C092UPKR79D", name: "#claims-remotemarkets" },
];

// Today in ET: Jul 20 2026 00:00 ET = Jul 20 2026 04:00 UTC
// Use a 48-hour window to be safe
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

async function getThreadReplies(channelId, threadTs) {
  const data = await slackGet("conversations.replies", {
    channel: channelId,
    ts: threadTs,
    limit: 50,
  });
  return data.messages || [];
}

for (const channel of CHANNELS) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Channel: ${channel.name} (${channel.id})`);
  console.log("=".repeat(60));

  // Get all messages in the channel today
  const history = await slackGet("conversations.history", {
    channel: channel.id,
    oldest: oldest.toString(),
    latest: latest.toString(),
    limit: 200,
  });

  if (!history.ok) {
    console.log(`  Error: ${history.error}`);
    continue;
  }

  const messages = history.messages || [];
  console.log(`  Total messages in channel today: ${messages.length}`);

  // Find FNOL workflow parent messages
  const fnolParents = messages.filter(
    (m) =>
      m.subtype === "bot_message" ||
      (m.text && (m.text.includes("First Notice of Loss") || m.text.includes("FNOL") || m.text.includes("Gas -") || m.text.includes("Tesla -") || m.text.includes("@claims-intake")))
  );
  console.log(`  FNOL workflow threads today: ${fnolParents.length}`);

  // For each FNOL thread, check if Ana replied
  let anaCompletedThreads = [];
  let anaContactedThreads = [];

  for (const parent of fnolParents) {
    const replies = await getThreadReplies(channel.id, parent.ts);
    const anaReplies = replies.filter((r) => r.user === ANA_USER_ID);

    if (anaReplies.length === 0) continue;

    // Check if any reply is a completed template (FOL/prelim liability/facts of loss)
    const templateKeywords = [
      "facts of loss",
      "preliminary liability",
      "prelim liability",
      "claim id",
      "claim #",
      "adjuster:",
      "tnc status",
      "date of loss:",
      "member name:",
    ];

    const hasTemplate = anaReplies.some((r) => {
      const text = (r.text || "").toLowerCase();
      const matchCount = templateKeywords.filter((k) => text.includes(k)).length;
      return matchCount >= 3;
    });

    // Extract member name from parent
    const memberMatch = parent.text?.match(/Member Name[^:]*:\s*([^\n]+)/i);
    const memberName = memberMatch ? memberMatch[1].trim() : "unknown";
    const vinMatch = parent.text?.match(/Last 6 of VIN[^:]*:\s*([^\n]+)/i);
    const vin = vinMatch ? vinMatch[1].trim() : "—";

    const parentTime = new Date(parseFloat(parent.ts) * 1000).toLocaleString("en-US", { timeZone: "America/New_York" });
    const firstAnaReply = anaReplies[0];
    const firstAnaTime = new Date(parseFloat(firstAnaReply.ts) * 1000).toLocaleString("en-US", { timeZone: "America/New_York" });
    const contactMinutes = Math.round((parseFloat(firstAnaReply.ts) - parseFloat(parent.ts)) / 60);

    if (hasTemplate) {
      const templateReply = anaReplies.find((r) => {
        const text = (r.text || "").toLowerCase();
        return templateKeywords.filter((k) => text.includes(k)).length >= 3;
      });
      const templateTime = new Date(parseFloat(templateReply.ts) * 1000).toLocaleString("en-US", { timeZone: "America/New_York" });
      const templateMinFromContact = Math.round((parseFloat(templateReply.ts) - parseFloat(firstAnaReply.ts)) / 60);
      const templateMinFromReport = Math.round((parseFloat(templateReply.ts) - parseFloat(parent.ts)) / 60);

      anaCompletedThreads.push({
        memberName,
        vin,
        parentTime,
        firstAnaTime,
        contactMinutes,
        templateTime,
        templateMinFromContact,
        templateMinFromReport,
        anaRepliesCount: anaReplies.length,
        templateText: templateReply.text?.substring(0, 200),
      });
    } else {
      anaContactedThreads.push({
        memberName,
        vin,
        parentTime,
        firstAnaTime,
        contactMinutes,
        anaRepliesCount: anaReplies.length,
        lastReply: anaReplies[anaReplies.length - 1].text?.substring(0, 100),
      });
    }
  }

  console.log(`\n  Ana COMPLETED (template posted): ${anaCompletedThreads.length}`);
  for (const t of anaCompletedThreads) {
    console.log(`\n    Member: ${t.memberName} | VIN: ${t.vin}`);
    console.log(`    Workflow posted: ${t.parentTime}`);
    console.log(`    Ana first contact: ${t.firstAnaTime} (${t.contactMinutes} min after posting)`);
    console.log(`    Template posted: ${t.templateTime}`);
    console.log(`    Time contact→template: ${t.templateMinFromContact} min`);
    console.log(`    Time report→template: ${t.templateMinFromReport} min`);
    console.log(`    Ana replies in thread: ${t.anaRepliesCount}`);
  }

  console.log(`\n  Ana CONTACTED but no template yet: ${anaContactedThreads.length}`);
  for (const t of anaContactedThreads) {
    console.log(`\n    Member: ${t.memberName} | VIN: ${t.vin}`);
    console.log(`    Workflow posted: ${t.parentTime}`);
    console.log(`    Ana first contact: ${t.firstAnaTime} (${t.contactMinutes} min after posting)`);
    console.log(`    Ana replies: ${t.anaRepliesCount} | Last: "${t.lastReply}"`);
  }
}

console.log("\n\nDone.");
process.exit(0);
