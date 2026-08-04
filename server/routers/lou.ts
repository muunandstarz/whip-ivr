import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { louCalcs } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { tmpdir } from "os";

// ── Inline pricing data ────────────────────────────────────────────────────
const MARKET_PRICING = [
  { code: "DC", name: "Washington DC (Rockville)", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
    { model: "Toyota Corolla", weeklyRate: 350, dailyRate: 50.00, vehicleClass: "Compact" },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 375, dailyRate: 53.57, vehicleClass: "Midsize Sedan" },
    { model: "Toyota Camry Hybrid", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Midsize Hybrid" },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 425, dailyRate: 60.71, vehicleClass: "SUV" },
    { model: "Toyota Highlander", weeklyRate: 450, dailyRate: 64.29, vehicleClass: "SUV" },
  ]},
  { code: "BWI", name: "Baltimore (Glen Burnie)", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
    { model: "Toyota Corolla", weeklyRate: 350, dailyRate: 50.00, vehicleClass: "Compact" },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 375, dailyRate: 53.57, vehicleClass: "Midsize Sedan" },
    { model: "Toyota Camry Hybrid", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Midsize Hybrid" },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 425, dailyRate: 60.71, vehicleClass: "SUV" },
    { model: "Toyota Highlander", weeklyRate: 450, dailyRate: 64.29, vehicleClass: "SUV" },
  ]},
  { code: "ATL", name: "Atlanta", taxNote: "Rates include Georgia state sales tax.", vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 430.00, dailyRate: 61.43, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 484.00, dailyRate: 69.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 592.63, dailyRate: 84.66, vehicleClass: "Electric/EV" },
    { model: "Toyota Corolla", weeklyRate: 377.13, dailyRate: 53.88, vehicleClass: "Compact" },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 404.06, dailyRate: 57.72, vehicleClass: "Midsize Sedan" },
    { model: "Toyota Camry Hybrid", weeklyRate: 429.92, dailyRate: 61.42, vehicleClass: "Midsize Hybrid" },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 457.94, dailyRate: 65.42, vehicleClass: "SUV" },
    { model: "Toyota Highlander", weeklyRate: 484.88, dailyRate: 69.27, vehicleClass: "SUV" },
  ]},
  { code: "CHI", name: "Chicago", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
    { model: "Toyota Corolla", weeklyRate: 350, dailyRate: 50.00, vehicleClass: "Compact" },
    { model: "Toyota Camry / Honda Accord (Gas)", weeklyRate: 375, dailyRate: 53.57, vehicleClass: "Midsize Sedan" },
    { model: "Toyota Camry Hybrid", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Midsize Hybrid" },
    { model: "Toyota RAV4 (Gas)", weeklyRate: 425, dailyRate: 60.71, vehicleClass: "SUV" },
    { model: "Toyota Highlander", weeklyRate: 450, dailyRate: 64.29, vehicleClass: "SUV" },
  ]},
  { code: "MIA", name: "Miami", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
  { code: "ORL", name: "Orlando", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
  { code: "PHL", name: "Philadelphia", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
  { code: "RIC", name: "Richmond", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
  ]},
  { code: "BOS", name: "Boston", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 550, dailyRate: 78.57, vehicleClass: "Electric/EV" },
  ]},
  { code: "DAL", name: "Dallas", taxNote: null, vehicles: [
    { model: "Tesla Model 3 (LR/SR)", weeklyRate: 399, dailyRate: 57.00, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2018–2025)", weeklyRate: 449, dailyRate: 64.14, vehicleClass: "Electric/EV" },
    { model: "Tesla Model Y (2026)", weeklyRate: 499, dailyRate: 71.29, vehicleClass: "Electric/EV" },
  ]},
];

const MKT_BRIDGE: Record<string, string> = {
  DC: "RCK", BWI: "GB", ATL: "ATL", CHI: "CHI",
  MIA: "MIA", ORL: "ORL", PHL: "PHL", RIC: "RVA", BOS: "BOS", DAL: "DAL",
};

let _utilData: any = null;
function getUtilizationData() {
  if (!_utilData) {
    try {
      const filePath = join(process.cwd(), "server/data/utilization.json");
      _utilData = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch { _utilData = { monthly_data: {}, markets: {} }; }
  }
  return _utilData;
}

const ClaimInfoSchema = z.object({
  whipClaimNo: z.string().optional(),
  adverseClaimNo: z.string().optional(),
  dol: z.string().optional(),
  adverseCarrier: z.string().optional(),
  vehicle: z.string().optional(),
  vin: z.string().optional(),
  memberDriver: z.string().optional(),
  registeredOwner: z.string().optional(),
  vehicleStatus: z.string().optional(),
  vehicleClass: z.string().optional(),
  repairFacility: z.string().optional(),
  roNumber: z.string().optional(),
  dropOff: z.string().optional(),
  pickUp: z.string().optional(),
  totalDays: z.number().optional(),
  daysClaimed: z.number().optional(),
});

const UtilLogEntrySchema = z.object({
  date: z.string(),
  location: z.string(),
  vehicleClass: z.string(),
  fleetCount: z.number(),
  rentCount: z.number(),
});

export const louRouter = router({
  /** Parse estimate PDF via AI and return structured claim info (legacy: uses fileUrl) */
  parseEstimate: protectedProcedure
    .input(z.object({ fileUrl: z.string(), fileKey: z.string() }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a claims document parser. Extract structured claim information from the provided estimate or claim document. Return ONLY valid JSON with these fields (use null for missing fields):
{
  "whipClaimNo": string|null,
  "adverseClaimNo": string|null,
  "dol": string|null,
  "adverseCarrier": string|null,
  "vehicle": string|null,
  "vin": string|null,
  "memberDriver": string|null,
  "registeredOwner": string|null,
  "vehicleStatus": string|null,
  "vehicleClass": string|null,
  "repairFacility": string|null,
  "roNumber": string|null,
  "dropOff": string|null,
  "pickUp": string|null,
  "totalDays": number|null,
  "daysClaimed": number|null
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "file_url" as const,
                file_url: { url: input.fileUrl, mime_type: "application/pdf" as const },
              },
              { type: "text" as const, text: "Extract the claim information from this document." },
            ],
          },
        ],
      });
      const rawContent = response.choices[0]?.message?.content;
      const text = typeof rawContent === "string" ? rawContent : "{}";
      try {
        const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
        return { success: true, data: parsed as z.infer<typeof ClaimInfoSchema> };
      } catch {
        return { success: false, data: {} as z.infer<typeof ClaimInfoSchema> };
      }
    }),

  /** Parse a document from base64 content and extract claim fields via AI */
  parseDocument: protectedProcedure
    .input(z.object({
      fileContent: z.string(), // base64 encoded
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = `You are a claims document parser for Whip Claims Management. Extract structured claim information from the provided document. Return ONLY valid JSON with these exact fields (use null for missing/unknown):
{
  "whip_claim": string|null,
  "adv_claim": string|null,
  "dol": string|null,
  "carrier": string|null,
  "member": string|null,
  "vehicle": string|null,
  "vin": string|null,
  "shop": string|null,
  "ro_num": string|null,
  "dropoff": string|null,
  "pickup": string|null
}
All dates must be in YYYY-MM-DD format. VIN must be 17 characters if found.`;

      let userContent: import("../_core/llm").MessageContent[];

      if (input.mimeType.startsWith("image/")) {
        userContent = [
          { type: "image_url" as const, image_url: { url: `data:${input.mimeType};base64,${input.fileContent}` } },
          { type: "text" as const, text: "Extract all claim information from this document image." },
        ];
      } else if (input.mimeType === "text/plain") {
        const decoded = Buffer.from(input.fileContent, "base64").toString("utf-8");
        userContent = [{ type: "text" as const, text: `Extract claim information from this text:\n\n${decoded.slice(0, 8000)}` }];
      } else {
        // PDF — extract text via pdftotext
        let pdfText = "";
        const tmpPdf = join(tmpdir(), `lou_parse_${Date.now()}.pdf`);
        const tmpTxt = join(tmpdir(), `lou_parse_${Date.now()}.txt`);
        try {
          writeFileSync(tmpPdf, Buffer.from(input.fileContent, "base64"));
          execSync(`pdftotext "${tmpPdf}" "${tmpTxt}"`, { timeout: 15000 });
          pdfText = readFileSync(tmpTxt, "utf-8").slice(0, 8000);
        } catch {
          pdfText = `[PDF file: ${input.fileName}. Could not extract text automatically.]`;
        } finally {
          try { unlinkSync(tmpPdf); } catch {}
          try { unlinkSync(tmpTxt); } catch {}
        }
        userContent = [{ type: "text" as const, text: `Extract claim information from this PDF document text:\n\n${pdfText}` }];
      }

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          maxTokens: 1024,
        });
        const content = result.choices[0]?.message?.content;
        if (!content) return { success: false, fields: {}, error: "AI returned an empty response." };
        let text = typeof content === "string" ? content : JSON.stringify(content);
        text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        let fields: Record<string, unknown>;
        try {
          fields = JSON.parse(text);
        } catch {
          const lastComma = text.lastIndexOf(",");
          const truncated = lastComma > 0 ? text.slice(0, lastComma) + "}" : text + "}";
          try { fields = JSON.parse(truncated); } catch { return { success: false, fields: {}, error: "AI returned malformed JSON." }; }
        }
        const nonNull: Record<string, string> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== null && v !== undefined && v !== "") nonNull[k] = String(v);
        }
        return { success: true, fields: nonNull };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, fields: {}, error: `Parsing failed: ${msg.slice(0, 200)}` };
      }
    }),

  /** Save or update a LOU calculation */
  save: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        claimInfo: ClaimInfoSchema,
        utilizationLog: z.array(UtilLogEntrySchema),
        dailyRate: z.number().optional(),
        totalLou: z.number().optional(),
        estimateFileKey: z.string().optional(),
        estimateFileUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const logJson = JSON.stringify(input.utilizationLog);
      const payload = {
        userId: ctx.user.id,
        ...input.claimInfo,
        utilizationLog: logJson,
        dailyRate: input.dailyRate,
        totalLou: input.totalLou,
        estimateFileKey: input.estimateFileKey,
        estimateFileUrl: input.estimateFileUrl,
      };
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      if (input.id) {
        await db.update(louCalcs).set(payload).where(eq(louCalcs.id, input.id));
        return { id: input.id };
      } else {
        const [result] = await db.insert(louCalcs).values(payload);
        return { id: (result as any).insertId as number };
      }
    }),

  /** List saved LOU calcs for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(louCalcs)
      .where(eq(louCalcs.userId, ctx.user.id))
      .orderBy(desc(louCalcs.updatedAt))
      .limit(50);
  }),

  /** Get a single LOU calc */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(louCalcs)
        .where(and(eq(louCalcs.id, input.id), eq(louCalcs.userId, ctx.user.id)));
      return row ?? null;
    }),

  /** Delete a LOU calc */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db.delete(louCalcs).where(and(eq(louCalcs.id, input.id), eq(louCalcs.userId, ctx.user.id)));
      return { ok: true };
    }),

  /** Upload estimate file to storage and return key + url */
  uploadEstimate: protectedProcedure
    .input(z.object({ fileName: z.string(), fileBase64: z.string(), mimeType: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const key = `lou-estimates/${ctx.user.id}/${Date.now()}-${input.fileName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { key, url };
    }),

  /** Return market pricing — pass marketCode to get a single market, omit for all */
  getMarketPricing: protectedProcedure
    .input(z.object({ marketCode: z.string().optional() }).optional())
    .query(({ input }) => {
      if (input?.marketCode) {
        return MARKET_PRICING.find(m => m.code === input.marketCode) ?? null;
      }
      return MARKET_PRICING;
    }),

  /** Return utilization rows for a given market + date range */
  getUtilRows: protectedProcedure
    .input(z.object({ marketCode: z.string(), dropOff: z.string(), pickUp: z.string() }))
    .query(({ input }) => {
      const data = getUtilizationData();
      const dataCode = MKT_BRIDGE[input.marketCode] || input.marketCode;
      const start = new Date(input.dropOff + "T00:00:00");
      const end = new Date(input.pickUp + "T00:00:00");
      const rows: Array<{ date: string; fleet: number; rented: number; utilization: number; month: string }> = [];
      const sortedMonths = Object.keys(data.monthly_data || {}).sort();
      const latestMonthKey = sortedMonths[sortedMonths.length - 1];
      const current = new Date(start);
      while (current < end) {
        const dateStr = current.toISOString().split("T")[0];
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        let matchKey = sortedMonths.find((k: string) => {
          const d = new Date(k);
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        });
        if (!matchKey) matchKey = latestMonthKey;
        const monthData = matchKey ? data.monthly_data[matchKey] : null;
        let fleet = 0, rented = 0, utilization = 0;
        if (monthData) {
          const mktArr: any[] = monthData.markets || [];
          const mktEntry = mktArr.find((m: any) => m.code === dataCode);
          if (mktEntry) {
            fleet = mktEntry.available ?? 0;
            rented = mktEntry.rented ?? 0;
            utilization = mktEntry.utilization ?? 0;
          } else {
            fleet = monthData.total_available_fleet ?? 0;
            rented = monthData.rented ?? 0;
            utilization = monthData.market_utilization ?? 0;
          }
        }
        rows.push({
          date: dateStr,
          fleet,
          rented,
          utilization,
          month: current.toLocaleString("default", { month: "long", year: "numeric" }),
        });
        current.setDate(current.getDate() + 1);
      }
      return rows;
    }),
});
