/**
 * Pull all FNOL threads from #claims and #claims-remotemarkets that any rep touched today
 * Reps: Ana (U091NDYN0E6), Bennet (U09UUPZC50W), Carlito (U09H80U9TSP)
 * Today: Jul 20, 2026 ET
 */

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const REPS = {
  U091NDYN0E6: "Ana",
  U09UUPZC50W: "Bennet",
  U09H80U9TSP: "Carlito",
};

const CHANNELS = [
  { id: "CHWRXH4HK", name: "#claims" },
  { id: "C092UPKR79D", name: "#claims-remotemarkets" },
];

// Jul 20 2026 00:00 ET = 04:00 UTC; Jul 21 2026 00:00 ET = 04:00 UTC
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

function detectTemplateType(text) {
  const t = (text || "").toLowerCase();
  // Standard full template
  const standardKeywords = ["claim id", "claim #", "adjuster:", "tnc status", "date of loss:", "member name:"];
  const standardCount = standardKeywords.filter(k => t.includes(k)).length;
  if (standardCount >= 3) return "full_template";

  // Short format: Member\nDOL:\nFact of loss:\nPreliminary:
  const shortKeywords = ["fact of loss:", "preliminary:", "dol:", "activity:"];
  const shortCount = shortKeywords.filter(k => t.includes(k)).length;
  if (shortCount >= 2) return "short_template";

  // FOL/Rideshare template
  const folKeywords = ["facts of loss", "preliminary liability", "rideshare status", "police report"];
  const folCount = folKeywords.filter(k => t.includes(k)).length;
  if (folCount >= 2) return "fol_template";

  return null;
}

function extractMemberInfo(text) {
  const t = text || "";
  const memberMatch = t.match(/(?:Customer ID\/Member Name|Member Name)[^:\n]*[:\n]\s*([^\n*]+)/i);
  const vinMatch = t.match(/VIN[^:\n]*[:\n]\s*([^\n*]+)/i);
  const marketMatch = t.match(/Market[^:\n]*[:\n]\s*([^\n*]+)/i);
  return {
    member: memberMatch ? memberMatch[1].replace(/[*#]/g, "").trim() : "unknown",
    vin: vinMatch ? vinMatch[1].replace(/[*#]/g, "").trim().slice(-6) : "—",
    market: marketMatch ? marketMatch[1].replace(/[*#]/g, "").trim() : "—",
  };
}

function classifyRepAction(replies, repId) {
  const repReplies = replies.filter(r => r.user === repId);
  if (repReplies.length === 0) return null;

  const actions = [];
  let hasTemplate = false;
  let templateType = null;
  let templateTs = null;
  let firstContactTs = repReplies[0].ts;

  for (const r of repReplies) {
    const ttype = detectTemplateType(r.text);
    if (ttype && !hasTemplate) {
      hasTemplate = true;
      templateType = ttype;
      templateTs = r.ts;
    }
  }

  // Check for contact attempts
  const contactKeywords = ["calling now", "called", "no response", "no answer", "vm", "voicemail", "left a vm", "can't leave"];
  const contactReplies = repReplies.filter(r => {
    const t = (r.text || "").toLowerCase();
    return contactKeywords.some(k => t.includes(k));
  });

  // Check for filing
  const filedReplies = repReplies.filter(r => {
    const t = (r.text || "").toLowerCase();
    return t.includes("filed") || t.includes("filed on behalf");
  });

  // Build action summary
  if (hasTemplate) {
    actions.push(`completed_template (${templateType})`);
  }
  if (filedReplies.length > 0) {
    actions.push("filed_ar");
  }
  if (contactReplies.length > 0) {
    const attempts = contactReplies.length;
    const lastReply = repReplies[repReplies.length - 1];
    const lastText = (lastReply.text || "").toLowerCase();
    if (lastText.includes("no response") || lastText.includes("no answer") || lastText.includes("can't leave")) {
      actions.push(`contact_attempted (${attempts}x, no answer)`);
    } else {
      actions.push(`contact_attempted (${attempts}x)`);
    }
  }

  if (actions.length === 0) {
    // Generic participation
    actions.push(`replied (${repReplies.length}x)`);
  }

  return {
    repId,
    repName: REPS[repId],
    firstContactTs,
    templateTs,
    hasTemplate,
    templateType,
    actions,
    replyCount: repReplies.length,
    lastReplyText: repReplies[repReplies.length - 1].text?.substring(0, 150),
  };
}

const allThreadActivity = [];

for (const channel of CHANNELS) {
  console.log(`\nFetching ${channel.name}...`);
  
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
  // Get parent messages (FNOL workflows are bot messages or have thread_ts = ts)
  const parents = messages.filter(m => !m.thread_ts || m.thread_ts === m.ts);
  
  console.log(`  ${parents.length} threads, ${messages.length} total messages`);

  for (const parent of parents) {
    // Check if this is an FNOL workflow post
    const text = parent.text || "";
    const isFnol = (
      parent.subtype === "bot_message" ||
      text.includes("First Notice of Loss") ||
      text.includes("FNOL") ||
      text.includes("Customer ID/Member Name") ||
      text.includes("Date and Time of Loss") ||
      text.includes("Brief summary of what happened")
    );
    
    if (!isFnol) continue;

    const info = extractMemberInfo(text);
    const parentTime = new Date(parseFloat(parent.ts) * 1000).toLocaleString("en-US", { timeZone: "America/New_York" });

    // Get all replies
    const repliesData = await slackGet("conversations.replies", {
      channel: channel.id,
      ts: parent.ts,
      limit: 100,
    });

    const replies = repliesData.messages || [];

    // Check which reps touched this thread
    const repActivity = [];
    for (const repId of Object.keys(REPS)) {
      const activity = classifyRepAction(replies, repId);
      if (activity) repActivity.push(activity);
    }

    if (repActivity.length === 0) continue; // No rep touched this thread today

    allThreadActivity.push({
      channel: channel.name,
      channelId: channel.id,
      threadTs: parent.ts,
      parentTime,
      member: info.member,
      vin: info.vin,
      market: info.market,
      repActivity,
    });
  }
}

// Print summary
console.log("\n\n" + "=".repeat(70));
console.log("TODAY'S REP ACTIVITY SUMMARY — Jul 20, 2026");
console.log("=".repeat(70));

// Group by rep
const byRep = {};
for (const repId of Object.keys(REPS)) {
  byRep[repId] = [];
}

for (const thread of allThreadActivity) {
  for (const activity of thread.repActivity) {
    byRep[activity.repId].push({ thread, activity });
  }
}

for (const [repId, items] of Object.entries(byRep)) {
  const repName = REPS[repId];
  console.log(`\n${"─".repeat(50)}`);
  console.log(`${repName} (${repId}) — ${items.length} claim(s) touched`);
  console.log("─".repeat(50));

  if (items.length === 0) {
    console.log("  No activity today");
    continue;
  }

  for (const { thread, activity } of items) {
    const contactMin = activity.firstContactTs
      ? Math.round((parseFloat(activity.firstContactTs) - parseFloat(thread.threadTs)) / 60)
      : null;
    const templateMin = activity.templateTs
      ? Math.round((parseFloat(activity.templateTs) - parseFloat(thread.threadTs)) / 60)
      : null;

    console.log(`\n  Member: ${thread.member} | VIN: ${thread.vin} | Market: ${thread.market}`);
    console.log(`  Channel: ${thread.channel}`);
    console.log(`  FNOL posted: ${thread.parentTime}`);
    if (contactMin !== null) console.log(`  First contact: ${contactMin} min after posting`);
    if (templateMin !== null) console.log(`  Template posted: ${templateMin} min after posting`);
    console.log(`  Actions: ${activity.actions.join(", ")}`);
    console.log(`  Replies: ${activity.replyCount}`);
    console.log(`  Last reply: "${activity.lastReplyText}"`);
  }
}

// Output as JSON for use by the server
const output = {
  date: "2026-07-20",
  threads: allThreadActivity,
  byRep: Object.fromEntries(
    Object.entries(byRep).map(([id, items]) => [REPS[id], items.map(({ thread, activity }) => ({
      member: thread.member,
      vin: thread.vin,
      market: thread.market,
      channel: thread.channel,
      fnolPostedAt: thread.parentTime,
      actions: activity.actions,
      replyCount: activity.replyCount,
      hasTemplate: activity.hasTemplate,
      templateType: activity.templateType,
      lastReplyText: activity.lastReplyText,
    }))])
  ),
};

import { writeFileSync } from "fs";
writeFileSync("/tmp/today_rep_activity.json", JSON.stringify(output, null, 2));
console.log("\n\nJSON written to /tmp/today_rep_activity.json");
process.exit(0);
