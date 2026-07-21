import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
import { config } from 'dotenv';
config({ path: '/home/ubuntu/whip-ivr/.env' });

const { getDb } = await import('../server/db.js');
const { lossIntakeClaims, lossIntakeEvents } = await import('../drizzle/schema.js');
const { gte, desc, sql } = await import('drizzle-orm');

const db = await getDb();
if (!db) { console.log('No DB connection'); process.exit(1); }

// Today's claims (UTC midnight)
const today = new Date();
today.setHours(0, 0, 0, 0);

const claims = await db.select().from(lossIntakeClaims)
  .where(gte(lossIntakeClaims.postedAt, today))
  .orderBy(desc(lossIntakeClaims.postedAt));

console.log('Today claims in DB:', claims.length);
for (const c of claims) {
  console.log(` - ${c.memberName ?? 'unknown'} | stage: ${c.stage} | handler: ${c.assignedAgent ?? 'unassigned'} | sla: ${c.slaState}`);
}
