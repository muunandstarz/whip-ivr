import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const sql = readFileSync('./drizzle/0002_option_c_tables.sql', 'utf8');
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 5);

const conn = await createConnection(process.env.DATABASE_URL);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 70));
  } catch (err) {
    console.error('ERR:', err.message.substring(0, 100), '|', stmt.substring(0, 50));
  }
}

const [rows] = await conn.execute('SHOW TABLES');
console.log('\nAll tables:');
rows.forEach(r => console.log(' -', Object.values(r)[0]));

await conn.end();
