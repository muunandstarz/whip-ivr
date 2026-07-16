const token = process.env.SLACK_BOT_TOKEN;

// Get all users
const r = await fetch('https://slack.com/api/users.list?limit=500', {
  headers: { Authorization: `Bearer ${token}` }
});
const d = await r.json();
if (!d.ok) { console.error('users.list failed:', d.error); process.exit(1); }

const active = d.members.filter(m => !m.deleted && !m.is_bot && m.id !== 'USLACKBOT');
console.log('All active human users:');
active.forEach(m => console.log(`  ${m.id}  ${m.real_name}  (${m.profile?.display_name || ''})`));

// Get recent threads in claims channel and look at who is replying
const hist = await fetch('https://slack.com/api/conversations.history?channel=CHWRXH4HK&limit=20', {
  headers: { Authorization: `Bearer ${token}` }
});
const histData = await hist.json();
const threadsWithReplies = histData.ok ? histData.messages.filter(m => m.reply_count > 0).slice(0, 3) : [];

console.log('\nSample reply user IDs from recent threads:');
for (const thread of threadsWithReplies) {
  const rep = await fetch(`https://slack.com/api/conversations.replies?channel=CHWRXH4HK&ts=${thread.ts}&limit=10`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const repData = await rep.json();
  if (repData.ok) {
    repData.messages.slice(1).forEach(m => {
      const user = active.find(u => u.id === m.user);
      console.log(`  user=${m.user} name=${user?.real_name || 'unknown'} text="${m.text?.slice(0, 50)}"`);
    });
  }
}
