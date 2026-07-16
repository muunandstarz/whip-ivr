/**
 * Manually applies pending drizzle migrations by inserting their hash into
 * __drizzle_migrations and running only the NEW tables (0002).
 * 
 * The 0001 tables (call_sessions, intake_records) already exist in production,
 * so we only need to:
 *   1. Record 0001 hash in __drizzle_migrations (so drizzle-kit migrate won't re-run it)
 *   2. Apply 0002 (new loss intake tables) and record its hash
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(dbUrl);

// Helper: compute drizzle hash for a migration file
function drizzleHash(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

// Check current state
const [existing] = await conn.execute("SELECT hash FROM `__drizzle_migrations` ORDER BY id");
const appliedHashes = new Set(existing.map(r => r.hash));
console.log("Currently applied migration hashes:", [...appliedHashes]);

// ── 0001: already-existing tables, just record the hash ──
const sql0001 = readFileSync(resolve(projectRoot, "drizzle/0001_strong_tony_stark.sql"), "utf8");
const hash0001 = drizzleHash(sql0001);
if (!appliedHashes.has(hash0001)) {
  console.log("Recording 0001 hash (tables already exist in DB)...");
  await conn.execute(
    "INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)",
    [hash0001, 1776981113838]
  );
  console.log("✓ 0001 recorded");
} else {
  console.log("0001 already recorded, skipping");
}

// ── 0002: new loss intake tables — apply each statement ──
const sql0002 = readFileSync(resolve(projectRoot, "drizzle/0002_add_loss_intake_monitoring.sql"), "utf8");
const hash0002 = drizzleHash(sql0002);
if (!appliedHashes.has(hash0002)) {
  console.log("Applying 0002 loss intake tables...");
  // Split on semicolons, filter empty
  const stmts = sql0002.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    try {
      await conn.execute(stmt);
      const tableName = stmt.match(/CREATE TABLE.*?`([^`]+)`/)?.[1] ?? "(unknown)";
      console.log(`  ✓ Created table: ${tableName}`);
    } catch (e) {
      if (e.code === "ER_TABLE_EXISTS_ERROR") {
        console.log(`  ⚠ Table already exists (skipping): ${e.sqlMessage}`);
      } else {
        console.error(`  ✗ Error: ${e.message}`);
        throw e;
      }
    }
  }
  // Record the hash
  await conn.execute(
    "INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)",
    [hash0002, 1784072382592]
  );
  console.log("✓ 0002 applied and recorded");
} else {
  console.log("0002 already applied, skipping");
}

await conn.end();
console.log("\nMigration complete.");
