import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// category_routing remaining 6
const routes = [
  ['inbound_subro',           'Inbound Subro'],
  ['existing_claim_followup', 'First Party'],
  ['outbound_subro',          'OB Subro'],
  ['total_loss',              'Total Loss'],
  ['legal_or_high_risk',      'Review'],
  ['other_or_unclear',        'Review'],
];
for (const [cat, teamName] of routes) {
  const [[team]] = await conn.execute('SELECT id FROM teams WHERE name = ?', [teamName]);
  await conn.execute(
    'INSERT INTO category_routing (category, team_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE team_id = VALUES(team_id)',
    [cat, team.id]
  );
  console.log(`  category_routing: ${cat} → ${teamName} (id=${team.id})`);
}

// mail_settings
const settings = [
  ['reviewed_emoji',    'white_check_mark'],
  ['bot_marker_emoji',  'eyes'],
  ['mark_gmail_read',   'true'],
  ['add_slack_reaction','true'],
  ['confidence_auto',   '90'],
  ['confidence_review', '75'],
];
for (const [k, v] of settings) {
  await conn.execute(
    'INSERT INTO mail_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [k, v]
  );
  console.log(`  mail_settings: ${k} = ${v}`);
}

conn.end();
console.log('Done');
