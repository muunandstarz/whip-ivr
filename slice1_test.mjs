import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
let pass = true;

async function check(label, query, expected) {
  const [[row]] = await conn.execute(query);
  const actual = Number(Object.values(row)[0]);
  const ok = actual === expected;
  if (!ok) pass = false;
  console.log(`${ok ? '✅' : '❌'} ${label}: expected ${expected}, got ${actual}`);
}

await check('teams (active)', 'SELECT COUNT(*) FROM teams WHERE active = 1', 6);
await check('mail-lane handlers (distinct)',
  `SELECT COUNT(DISTINCT tm.handler_id) FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.is_review_lane = 0`, 8);
await check('category_routing rows', 'SELECT COUNT(*) FROM category_routing', 7);
await check('mail_settings keys', 'SELECT COUNT(*) FROM mail_settings', 6);

const [[fk1]] = await conn.execute('SELECT COUNT(*) AS cnt FROM category_routing cr LEFT JOIN teams t ON t.id = cr.team_id WHERE t.id IS NULL');
const fk1ok = Number(fk1.cnt) === 0; if (!fk1ok) pass = false;
console.log(`${fk1ok ? '✅' : '❌'} category_routing FKs all resolve`);

const [[fk2]] = await conn.execute('SELECT COUNT(*) AS cnt FROM team_members tm LEFT JOIN handlers h ON h.id = tm.handler_id WHERE h.id IS NULL');
const fk2ok = Number(fk2.cnt) === 0; if (!fk2ok) pass = false;
console.log(`${fk2ok ? '✅' : '❌'} team_members handler FKs all resolve`);

const [[fk3]] = await conn.execute('SELECT COUNT(*) AS cnt FROM team_members tm LEFT JOIN teams t ON t.id = tm.team_id WHERE t.id IS NULL');
const fk3ok = Number(fk3.cnt) === 0; if (!fk3ok) pass = false;
console.log(`${fk3ok ? '✅' : '❌'} team_members team FKs all resolve`);

const [members] = await conn.execute(
  `SELECT t.name AS team, GROUP_CONCAT(h.name ORDER BY h.name SEPARATOR ', ') AS handlers
   FROM team_members tm JOIN teams t ON t.id = tm.team_id JOIN handlers h ON h.id = tm.handler_id
   GROUP BY t.id, t.name ORDER BY t.id`);
console.log('\nTeam membership:');
for (const r of members) console.log(`  ${r.team}: ${r.handlers}`);

const [routing] = await conn.execute(
  `SELECT cr.category, t.name AS team FROM category_routing cr JOIN teams t ON t.id = cr.team_id ORDER BY cr.id`);
console.log('\nCategory routing:');
for (const r of routing) console.log(`  ${r.category} → ${r.team}`);

const [settings] = await conn.execute('SELECT `key`, value FROM mail_settings ORDER BY `key`');
console.log('\nMail settings:');
for (const r of settings) console.log(`  ${r.key} = ${r.value}`);

conn.end();
console.log(`\n${pass ? '✅ SLICE 1 PASS' : '❌ SLICE 1 FAIL'}`);
