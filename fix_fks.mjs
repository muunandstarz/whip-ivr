import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Show which team IDs exist
const [teams] = await conn.execute('SELECT id, name FROM teams ORDER BY id');
console.log('Teams:', teams.map(t => `${t.id}:${t.name}`).join(', '));

// Show orphaned category_routing rows
const [orphanCR] = await conn.execute(
  'SELECT cr.id, cr.category, cr.team_id FROM category_routing cr LEFT JOIN teams t ON t.id = cr.team_id WHERE t.id IS NULL'
);
console.log('Orphaned category_routing:', orphanCR);

// Show orphaned team_members rows
const [orphanTM] = await conn.execute(
  'SELECT tm.id, tm.team_id, tm.handler_id FROM team_members tm LEFT JOIN teams t ON t.id = tm.team_id WHERE t.id IS NULL'
);
console.log('Orphaned team_members:', orphanTM);

// Fix: delete orphaned rows and re-seed from valid team IDs
if (orphanCR.length > 0) {
  await conn.execute('DELETE FROM category_routing WHERE team_id NOT IN (SELECT id FROM teams)');
  console.log('Deleted orphaned category_routing rows');
}
if (orphanTM.length > 0) {
  await conn.execute('DELETE FROM team_members WHERE team_id NOT IN (SELECT id FROM teams)');
  console.log('Deleted orphaned team_members rows');
}

// Re-seed category_routing for injury_pip_bi (which was pointing to the deleted duplicate)
const [[injuryTeam]] = await conn.execute("SELECT id FROM teams WHERE name = 'Injury'");
await conn.execute(
  "INSERT INTO category_routing (category, team_id) VALUES ('injury_pip_bi', ?) ON DUPLICATE KEY UPDATE team_id = VALUES(team_id)",
  [injuryTeam.id]
);
console.log(`Re-seeded injury_pip_bi → team ${injuryTeam.id}`);

// Re-seed team_members for any teams that lost their members
const memberships = [
  ['Injury',        'jayla.bernard@drivewhip.com'],
  ['Inbound Subro', 'geovanni.cabrera@drivewhip.com'],
  ['First Party',   'natashiae@drivewhip.com'],
  ['First Party',   'lorraine.tria@drivewhip.com'],
  ['First Party',   'jovel.villa@drivewhip.com'],
  ['First Party',   'annie.ortiz@drivewhip.com'],
  ['OB Subro',      'tim.chan@drivewhip.com'],
  ['OB Subro',      'daniel.giono@drivewhip.com'],
  ['Total Loss',    'daniel.giono@drivewhip.com'],
];
for (const [teamName, email] of memberships) {
  const [[team]] = await conn.execute('SELECT id FROM teams WHERE name = ?', [teamName]);
  const [[handler]] = await conn.execute('SELECT id FROM handlers WHERE email = ?', [email]);
  if (!team || !handler) { console.log(`WARN: missing ${teamName}/${email}`); continue; }
  await conn.execute(
    'INSERT IGNORE INTO team_members (team_id, handler_id) VALUES (?, ?)',
    [team.id, handler.id]
  );
}
console.log('Re-seeded team_members');

conn.end();
console.log('Done');
