import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  cancelKlutchPolicy,
  correctKlutchPolicy,
  findKlutchPoliciesByVin,
  getKlutchPolicy,
  issueKlutchPolicy,
  listKlutchPolicies,
  loadKlutchDraft,
  recordKlutchDocument,
  renewKlutchPolicy,
  saveKlutchDraft,
} from "../klutchPolicies";
import { KLUTCH_DOCUMENT_TYPES, KLUTCH_STATES, type KlutchPolicyTerms } from "@shared/klutchPolicy";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.");
const shortText = z.string().trim().max(255);
const requiredText = shortText.min(1, "This field is required.");
const termsSchema = z.object({
  leaseId: requiredText.max(128),
  memberName: requiredText,
  memberNumber: requiredText.max(128),
  memberAddress: z.string().trim().max(700).optional().default(""),
  memberStreet: z.string().trim().max(255).optional().default(""),
  memberCity: z.string().trim().max(120).optional().default(""),
  memberState: z.enum(KLUTCH_STATES).optional(),
  memberZip: z.string().trim().max(20).optional().default(""),
  memberEmail: z.string().trim().max(320).optional().default(""),
  vehicle: requiredText,
  vin: requiredText.max(40),
  effectiveOn: dateSchema,
  expiresOn: dateSchema,
  state: z.enum(KLUTCH_STATES),
  termMonths: z.union([z.literal(6), z.literal(12)]),
  transactionType: z.enum(["new", "renewal", "correction"]),
  coverages: z.array(z.object({
    label: requiredText,
    limit: requiredText,
    deductible: z.string().trim().max(80).optional(),
    premium: z.number().finite().min(0).max(100000),
  })).min(1).max(20),
  totalPremium: z.number().finite().min(0).max(1000000),
  weeklyMembershipFee: z.number().finite().min(0).max(1000).optional(),
  coverageWeeks: z.number().int().min(0).max(60).optional(),
  pipWaived: z.boolean().optional(),
  umRejected: z.boolean().optional(),
  comprehensiveDeductible: z.string().trim().max(80).optional(),
  collisionDeductible: z.string().trim().max(80).optional(),
  leaseStatus: z.enum(["active", "terminated"]).optional(),
  cancellationDate: dateSchema.optional(),
  tncUseNote: z.string().trim().max(1000).default(""),
});

const actorFor = (user: { id: number; name?: string | null; email?: string | null }, handler?: { name?: string; title?: string }) => ({
  userId: user.id,
  name: user.name?.trim() || user.email?.trim() || "Whip Claims Handler",
  handlerName: handler?.name?.trim(),
  handlerTitle: handler?.title?.trim(),
});

function asTrpcError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to complete the Klutch policy action." });
}

const handlerSchema = z.object({ name: z.string().trim().max(255).optional(), title: z.string().trim().max(255).optional() }).optional();
const snapshotSchema = z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 100000, "Document inputs are too large to save.");

export const klutchPoliciesRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(100), search: z.string().trim().max(255).optional() }).optional())
    .query(async ({ input }) => {
      try { return await listKlutchPolicies(input?.limit ?? 100, input?.search ?? ""); }
      catch (error) { asTrpcError(error); }
    }),

  byVin: protectedProcedure
    .input(z.object({ vin: z.string().trim().max(40) }))
    .query(async ({ input }) => {
      try { return await findKlutchPoliciesByVin(input.vin); }
      catch (error) { asTrpcError(error); }
    }),

  get: protectedProcedure
    .input(z.object({ policyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try { return await getKlutchPolicy(input.policyId); }
      catch (error) { asTrpcError(error); }
    }),

  draft: protectedProcedure.query(async ({ ctx }) => {
    try { return await loadKlutchDraft(ctx.user.id); }
    catch (error) { asTrpcError(error); }
  }),

  saveDraft: protectedProcedure
    .input(z.object({ handlerName: z.string().trim().max(255).default(""), handlerTitle: z.string().trim().max(255).default(""), draft: snapshotSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        await saveKlutchDraft(ctx.user.id, input.handlerName, input.handlerTitle, input.draft);
        return { ok: true as const };
      } catch (error) { asTrpcError(error); }
    }),

  issue: protectedProcedure
    .input(z.object({ issueRequestKey: z.string().trim().min(12).max(96), leaseId: requiredText.max(128), state: z.enum(KLUTCH_STATES), effectiveOn: dateSchema, expiresOn: dateSchema, terms: termsSchema, newLeaseConfirmed: z.boolean().optional(), handler: handlerSchema }))
    .mutation(async ({ input, ctx }) => {
      if (input.terms.transactionType !== "new") throw new TRPCError({ code: "BAD_REQUEST", message: "Use renewal or correction for an existing policy." });
      if (input.terms.state !== input.state || input.terms.leaseId !== input.leaseId || input.terms.effectiveOn !== input.effectiveOn || input.terms.expiresOn !== input.expiresOn) throw new TRPCError({ code: "BAD_REQUEST", message: "Issued policy terms must match the policy state, lease, and term dates." });
      try { return await issueKlutchPolicy(input as Omit<typeof input, "state"> & { state: typeof input.state; terms: KlutchPolicyTerms }, actorFor(ctx.user, input.handler)); }
      catch (error) { asTrpcError(error); }
    }),

  renew: protectedProcedure
    .input(z.object({ policyId: z.number().int().positive(), effectiveOn: dateSchema, expiresOn: dateSchema, terms: termsSchema, handler: handlerSchema }))
    .mutation(async ({ input, ctx }) => {
      if (input.terms.transactionType !== "renewal") throw new TRPCError({ code: "BAD_REQUEST", message: "Select Renewal before renewing a policy." });
      try { return await renewKlutchPolicy(input.policyId, input.effectiveOn, input.expiresOn, input.terms as KlutchPolicyTerms, actorFor(ctx.user, input.handler)); }
      catch (error) { asTrpcError(error); }
    }),

  correct: protectedProcedure
    .input(z.object({ policyId: z.number().int().positive(), terms: termsSchema, handler: handlerSchema }))
    .mutation(async ({ input, ctx }) => {
      if (input.terms.transactionType !== "correction") throw new TRPCError({ code: "BAD_REQUEST", message: "Select Correction before correcting a policy." });
      try { return await correctKlutchPolicy(input.policyId, input.terms as KlutchPolicyTerms, actorFor(ctx.user, input.handler)); }
      catch (error) { asTrpcError(error); }
    }),

  recordDocument: protectedProcedure
    .input(z.object({ policyId: z.number().int().positive(), documentType: z.enum(KLUTCH_DOCUMENT_TYPES), claimNumber: z.string().trim().max(128).optional(), snapshot: snapshotSchema, handler: handlerSchema }))
    .mutation(async ({ input, ctx }) => {
      try { return await recordKlutchDocument(input, actorFor(ctx.user, input.handler)); }
      catch (error) { asTrpcError(error); }
    }),

  cancelAndRecord: protectedProcedure
    .input(z.object({ policyId: z.number().int().positive(), cancelledOn: dateSchema, claimNumber: z.string().trim().max(128).optional(), documentSnapshot: snapshotSchema, handler: handlerSchema }))
    .mutation(async ({ input, ctx }) => {
      try { return await cancelKlutchPolicy(input, actorFor(ctx.user, input.handler)); }
      catch (error) { asTrpcError(error); }
    }),
});
