import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../_core/trpc';
import {
  addClaimsQaMessage,
  adjudicateClaimsQaResult,
  bootstrapClaimsQa,
  createClaimsQaCalibration,
  createClaimsQaDraft,
  getClaimsQaCalibrationDetail,
  getClaimsQaEvaluationDetail,
  getClaimsQaMigrationInventory,
  getClaimsQaOverview,
  getClaimsQaRubric,
  listClaimsQaDisputes,
  listClaimsQaEvaluations,
  releaseClaimsQaEvaluation,
  respondToClaimsQaResult,
  signOffClaimsQaEvaluation,
  submitClaimsQaCalibration,
  updateClaimsQaDraftResult,
  type ClaimsQaViewer,
} from '../claimsQa';

const resultValue = z.enum(['pending', 'met', 'not_met', 'not_applicable', 'not_determinable']);
const responseValue = z.enum(['agree', 'disagree']);
const outcomeValue = z.enum(['upheld', 'overturned_handling_correct', 'overturned_rubric_defect']);

function viewerFromUser(
  user: { id: number; name: string | null; email: string | null; role: 'admin' | 'user'; handlerProfileId: number | null },
  impersonatingHandler = false,
): ClaimsQaViewer {
  return {
    userId: user.id,
    name: user.name ?? user.email ?? 'Whip user',
    email: user.email,
    isLeadership: user.role === 'admin' && !impersonatingHandler,
    handlerId: user.handlerProfileId,
  };
}

function viewerFromContext(ctx: { user: Parameters<typeof viewerFromUser>[0]; req: { headers: Record<string, string | string[] | undefined> } }) {
  const impersonating = typeof ctx.req.headers['x-impersonate-handler-id'] === 'string';
  return viewerFromUser(ctx.user, impersonating);
}

function rethrow(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Claims QA operation failed.';
  const code = /access|not available|cannot|requires|not released|not open|not found/i.test(message) ? 'FORBIDDEN' : 'BAD_REQUEST';
  throw new TRPCError({ code, message });
}

export const claimsQaRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    try { return await getClaimsQaOverview(viewerFromContext(ctx)); }
    catch (error) { return rethrow(error); }
  }),

  rubric: protectedProcedure
    .input(z.object({ role: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try { return await getClaimsQaRubric(input?.role); }
      catch (error) { return rethrow(error); }
    }),

  list: protectedProcedure
    .input(z.object({ role: z.string().optional(), status: z.string().optional(), handlerId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(500).optional() }).optional())
    .query(async ({ ctx, input }) => {
      try { return await listClaimsQaEvaluations(viewerFromContext(ctx), input); }
      catch (error) { return rethrow(error); }
    }),

  detail: protectedProcedure
    .input(z.object({ evaluationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try { return await getClaimsQaEvaluationDetail(viewerFromContext(ctx), input.evaluationId); }
      catch (error) { return rethrow(error); }
    }),

  respondToLine: protectedProcedure
    .input(z.object({ evaluationId: z.number().int().positive(), resultId: z.number().int().positive(), response: responseValue, comment: z.string().max(20_000).optional() }))
    .mutation(async ({ ctx, input }) => {
      try { return await respondToClaimsQaResult({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  signOff: protectedProcedure
    .input(z.object({ evaluationId: z.number().int().positive(), overallResponse: z.string().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      try { return await signOffClaimsQaEvaluation({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  addMessage: protectedProcedure
    .input(z.object({ evaluationId: z.number().int().positive(), body: z.string().min(1).max(20_000), visibility: z.enum(['handler', 'leadership']).optional() }))
    .mutation(async ({ ctx, input }) => {
      try { return await addClaimsQaMessage({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  migrationInventory: adminProcedure.query(async () => {
    try { return await getClaimsQaMigrationInventory(); }
    catch (error) { return rethrow(error); }
  }),

  bootstrap: adminProcedure.mutation(async () => {
    try { return await bootstrapClaimsQa(); }
    catch (error) { return rethrow(error); }
  }),

  createDraft: adminProcedure
    .input(z.object({
      handlerId: z.number().int().positive(),
      handlerName: z.string().min(1).max(128),
      role: z.enum(['First Party', 'Liability - PD', 'Liability - Injury', 'Intake']),
      claimNumber: z.string().max(128).optional(),
      exposureId: z.string().max(128).optional(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      auditorSummary: z.string().max(20_000).optional(),
      areasForImprovement: z.string().max(20_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try { return await createClaimsQaDraft({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  saveLine: adminProcedure
    .input(z.object({
      evaluationId: z.number().int().positive(),
      resultId: z.number().int().positive(),
      result: resultValue,
      evidence: z.string().max(60_000).optional(),
      evidenceLocator: z.string().max(20_000).optional(),
      auditorNote: z.string().max(20_000).optional(),
      humanConfirmed: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try { return await updateClaimsQaDraftResult({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  release: adminProcedure
    .input(z.object({ evaluationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try { return await releaseClaimsQaEvaluation(viewerFromContext(ctx), input.evaluationId); }
      catch (error) { return rethrow(error); }
    }),

  disputes: adminProcedure.query(async ({ ctx }) => {
    try { return await listClaimsQaDisputes(viewerFromContext(ctx)); }
    catch (error) { return rethrow(error); }
  }),

  adjudicate: adminProcedure
    .input(z.object({ evaluationId: z.number().int().positive(), resultId: z.number().int().positive(), outcome: outcomeValue, note: z.string().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      try { return await adjudicateClaimsQaResult({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  createCalibration: adminProcedure
    .input(z.object({ evaluationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try { return await createClaimsQaCalibration(viewerFromContext(ctx), input.evaluationId); }
      catch (error) { return rethrow(error); }
    }),

  submitCalibration: adminProcedure
    .input(z.object({ calibrationId: z.number().int().positive(), scores: z.array(z.object({ evaluationResultId: z.number().int().positive(), result: z.enum(['met', 'not_met', 'not_applicable', 'not_determinable']), evidence: z.string().max(60_000).optional() })).min(1) }))
    .mutation(async ({ ctx, input }) => {
      try { return await submitClaimsQaCalibration({ viewer: viewerFromContext(ctx), ...input }); }
      catch (error) { return rethrow(error); }
    }),

  calibrationDetail: adminProcedure
    .input(z.object({ calibrationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try { return await getClaimsQaCalibrationDetail(viewerFromContext(ctx), input.calibrationId); }
      catch (error) { return rethrow(error); }
    }),
});
