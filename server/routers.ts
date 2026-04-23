import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getIntakeRecords,
  getIntakeRecordById,
  updateIntakeRecord,
  createIntakeRecord,
  getIntakeAnalytics,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  intake: router({
    // List intake records with filtering and pagination
    list: protectedProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.enum(["open", "closed"]).optional(),
          callerType: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        return getIntakeRecords(input);
      }),

    // Get single record by ID
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getIntakeRecordById(input.id);
      }),

    // Update status or handler
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["open", "closed"]).optional(),
          assignedHandler: z.string().optional(),
          callerName: z.string().optional(),
          organization: z.string().optional(),
          whipClaimNumber: z.string().optional(),
          callerReferenceNumber: z.string().optional(),
          callPurpose: z.string().optional(),
          message: z.string().optional(),
          callbackPhone: z.string().optional(),
          callbackEmail: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateIntakeRecord(id, data);
        return { success: true };
      }),

    // Create a manual intake record
    create: protectedProcedure
      .input(
        z.object({
          callerPhone: z.string().optional(),
          callerType: z
            .enum([
              "carrier",
              "law_office",
              "medical_provider",
              "member",
              "claimant",
              "police",
              "wrong_department",
              "unknown",
            ])
            .default("unknown"),
          callerName: z.string().optional(),
          organization: z.string().optional(),
          whipClaimNumber: z.string().optional(),
          callerReferenceNumber: z.string().optional(),
          callPurpose: z.string().optional(),
          message: z.string().optional(),
          callbackPhone: z.string().optional(),
          callbackEmail: z.string().optional(),
          assignedHandler: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = await createIntakeRecord({
          ...input,
          source: "manual",
          status: "open",
        });
        return { id };
      }),

    // Analytics data
    analytics: protectedProcedure.query(async () => {
      return getIntakeAnalytics();
    }),
  }),
});

export type AppRouter = typeof appRouter;
