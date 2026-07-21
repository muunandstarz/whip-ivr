/**
 * Find the correct #claims channel ID and test bot access
 */

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

async function slackGet(method, params = {}) {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${BOT_TOKEN}` },
  });
  return res.json();
}

// List all channels the bot can see
console.log("Listing channels bot can access...");
let allChannels = [];
let cursor = undefined;

do {
  const params = { limit: "200", types: "public_channel,private_channel" };
  if (cursor) params.cursor = cursor;
  const data = await slackGet("conversations.list", params);
  if (!data.ok) {
    console.log("Error listing channels:", data.error);
    break;
  }
  allChannels = allChannels.concat(data.channels || []);
  cursor = data.response_metadata?.next_cursor;
} while (cursor);

console.log(`Total channels visible to bot: ${allChannels.length}`);

// Find claims-related channels
const claimsChannels = allChannels.filter(c => 
  c.name.includes("claim") || c.name.includes("intake") || c.name.includes("loss")
);

console.log("\nClaims-related channels:");
for (const c of claimsChannels) {
  console.log(`  ${c.name} (${c.id}) — is_member: ${c.is_member}, is_private: ${c.is_private}`);
}

// Try to directly access C0BHDG7RX7D
console.log("\n\nTesting direct access to C0BHDG7RX7D (#claims)...");
const test1 = await slackGet("conversations.info", { channel: "C0BHDG7RX7D" });
console.log("conversations.info result:", JSON.stringify(test1, null, 2).substring(0, 500));

// Try to get history
const test2 = await slackGet("conversations.history", { channel: "C0BHDG7RX7D", limit: "1" });
console.log("\nconversations.history result:", JSON.stringify(test2, null, 2).substring(0, 300));

// Try joining the channel
console.log("\n\nAttempting to join C0BHDG7RX7D...");
const joinRes = await fetch("https://slack.com/api/conversations.join", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${BOT_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ channel: "C0BHDG7RX7D" }),
});
const joinData = await joinRes.json();
console.log("Join result:", JSON.stringify(joinData, null, 2).substring(0, 500));

process.exit(0);
