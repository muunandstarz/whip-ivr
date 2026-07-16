import { createConnection } from "mysql2/promise";
import { config } from "dotenv";
config({ path: ".env" });

const conn = await createConnection(process.env.DATABASE_URL);

const sqls = [
  "ALTER TABLE `loss_intake_claims` ADD COLUMN IF NOT EXISTS `storeTeamTagged` tinyint(1) NOT NULL DEFAULT 0 AFTER `templatePostMinutesFromReport`",
  "ALTER TABLE `loss_intake_claims` ADD COLUMN IF NOT EXISTS `folQualityScore` float AFTER `storeTeamTagged`",
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 90));
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log("Already exists:", sql.slice(40, 80));
    } else {
      console.error("FAILED:", err.message);
    }
  }
}
await conn.end();
console.log("Done.");
