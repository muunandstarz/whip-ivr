import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const sql = readFileSync('./drizzle/0002_option_c_tables.sql', 'utf8');

// Split on semicolons but filter empty statements
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await createConnection(process.env.DATABASE_URL);

for (const stmt of statements) {
  try {
    console.log('Executing:', stmt.substring(0, 80) + '...');
    await conn.execute(stmt);
    console.log('  ✓ OK');
  } catch (err) {
    console.error('  ✗ Error:', err.message);
  }
}

await conn.end();
console.log('\nMigration complete.');
