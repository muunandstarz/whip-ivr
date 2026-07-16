const token = process.env.SLACK_BOT_TOKEN;

async function resolveUserId(dmChannelId) {
  const r = await fetch(`https://slack.com/api/conversations.info?channel=${dmChannelId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await r.json();
  if (!d.ok) return { dmChannelId, error: d.error };
  return { dmChannelId, userId: d.channel?.user, name: d.channel?.name };
}

// Also search users by name as a fallback
async function searchUsers(query) {
  const r = await fetch(`https://slack.com/api/users.list?limit=200`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await r.json();
  if (!d.ok) return { error: d.error };
  const matches = d.members.filter(m =>
    !m.deleted && m.real_name && m.real_name.toLowerCase().includes(query.toLowerCase())
  );
  return matches.map(m => ({ id: m.id, name: m.real_name, displayName: m.profile?.display_name }));
}

const [ana, bennet, carlito] = await Promise.all([
  resolveUserId('D0AGQR5GUNP'),
  resolveUserId('D09UX5Q5ZML'),
  resolveUserId('D09JJLMPG76'),
]);
console.log('DM channel resolution:', JSON.stringify({ ana, bennet, carlito }, null, 2));

// Search by name as backup
const anaSearch = await searchUsers('Ana');
const bennetSearch = await searchUsers('Bennet');
const carlitoSearch = await searchUsers('Carlito');
console.log('Ana search:', JSON.stringify(anaSearch));
console.log('Bennet search:', JSON.stringify(bennetSearch));
console.log('Carlito search:', JSON.stringify(carlitoSearch));

// Also check recent messages in claims channel for user IDs
const msgs = await fetch(`https://slack.com/api/conversations.history?channel=CHWRXH4HK&limit=5`, {
  headers: { Authorization: `Bearer ${token}` }
});
const msgsData = await msgs.json();
if (msgsData.ok) {
  const threadTs = msgsData.messages.find(m => m.reply_count > 0)?.ts;
  if (threadTs) {
    const replies = await fetch(`https://slack.com/api/conversations.replies?channel=CHWRXH4HK&ts=${threadTs}&limit=20`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const repliesData = await replies.json();
    if (repliesData.ok) {
      console.log('Sample thread reply user IDs:', repliesData.messages.slice(1).map(m => ({ user: m.user, text: m.text?.slice(0, 60) })));
    }
  }
}
