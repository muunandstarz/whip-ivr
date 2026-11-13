import { defineConfig } from "drizzle-kit";
// Generation only. The historic global journal predates many manually additive
// migrations; this isolated schema/snapshot avoids unrelated changes. No DB URL.
export default defineConfig({
  schema: "./drizzle/klutchSignoffSchema.ts",
  out: "./drizzle/klutch-signoff-generation",
  dialect: "mysql",
});
