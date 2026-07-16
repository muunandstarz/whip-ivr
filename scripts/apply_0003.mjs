import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await createConnection(url);

const sqls = [
  "ALTER TABLE `loss_intake_claims` ADD COLUMN IF NOT EXISTS `contactAttempts` int NOT NULL DEFAULT 0 AFTER `noAnswerAttempts`",
  "ALTER TABLE `loss_intake_claims` ADD COLUMN IF NOT EXISTS `dateOfLoss` varchar(64) AFTER `contactAttempts`",
  "ALTER TABLE `loss_intake_claims` ADD COLUMN IF NOT EXISTS `templatePostedAt` timestamp NULL AFTER `dateOfLoss`",
  "ALTER TABLE `loss_intake_claims` ADD COLUMN IF NOT EXISTS `templatePostMinutesFromContact` float AFTER `templatePostedAt`",
  "ALTER TABLE `loss_intake_claims` ADD COLUMN IF NOT EXISTS `templatePostMinutesFromReport` float AFTER `templatePostMinutesFromContact`",
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 80));
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log("Already exists, skipping:", sql.slice(40, 80));
    } else {
      console.error("FAILED:", err.message, "\n  SQL:", sql);
    }
  }
}

await conn.end();
console.log("Migration 0003 complete.");
