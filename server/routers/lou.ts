import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { louCalcs } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

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
  /** Parse estimate PDF via AI and return structured claim info */
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
});
