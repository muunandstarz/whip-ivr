import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  approveKlutchEndorsement,
  cancelKlutchPolicy,
  getKlutchPolicy,
  issueKlutchPolicy,
  listKlutchPolicies,
  recordKlutchDocument,
  renewKlutchPolicy,
} from "../klutchPolicies";
import { KLUTCH_DOCUMENT_TYPES, KLUTCH_STATES, type KlutchPolicyTerms } from "@shared/klutchPolicy";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.");
const shortText = z.string().trim().max(255);
const requiredText = shortText.min(1, "This field is required.");
const termsSchema = z.object({
  leaseId: requiredText.max(128),
  memberName: requiredText,
  memberAddress: z.string().trim().max(700).optional().default(""),
  memberStreet: z.string().trim().max(255).optional().default(""),
  memberCity: z.string().trim().max(120).optional().default(""),
  memberState: z.enum(KLUTCH_STATES).optional(),
  memberZip: z.string().trim().max(20).optional().default(""),
  memberEmail: z.string().trim().max(320).optional().default(""),
  vehicle: requiredText,
  vin: z.string().trim().max(40).optional().default(""),
  effectiveOn: dateSchema,
  expiresOn: dateSchema,
  state: z.enum(KLUTCH_STATES),
  coverages: z.array(z.object({
    label: requiredText,
    limit: requiredText,
    deductible: z.string().trim().max(80).optional(),
    premium: z.number().finite().min(0).max(100000),
  })).min(1).max(20),
  totalPremium: z.number().finite().min(0).max(1000000),
  tncUseNote: z.string().trim().max(1000),
});

const actorFor = (user: { id: number; name?: string | null; email?: string | null }) => ({
  userId: user.id,
  name: user.name?.trim() || user.email?.trim() || "Whip Claims Handler",
});

function requireValue(value: unknown, label: string) {
  if (!String(value ?? "").trim()) throw new TRPCError({ code: "BAD_REQUEST", message: `${label} is required.` });
}

function asTrpcError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to complete the Klutch policy action." });
}

export const klutchPoliciesRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ input }) => {
      try {
        return await listKlutchPolicies(input?.limit ?? 50);
      } catch (error) {
        asTrpcError(error);
      }
    }),

  get: protectedProcedure
    .input(z.object({ policyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        return await getKlutchPolicy(input.policyId);
      } catch (error) {
        asTrpcError(error);
      }
    }),

  issue: protectedProcedure
    .input(z.object({
      issueRequestKey: z.string().trim().min(12).max(96),
      leaseId: requiredText.max(128),
      state: z.enum(KLUTCH_STATES),
      effectiveOn: dateSchema,
      expiresOn: dateSchema,
      terms: termsSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.terms.state !== input.state || input.terms.leaseId !== input.leaseId || input.terms.effectiveOn !== input.effectiveOn || input.terms.expiresOn !== input.expiresOn) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Issued policy terms must match the policy state, lease, and term dates." });
      }
      try {
        return await issueKlutchPolicy(input as { issueRequestKey: string; leaseId: string; state: typeof input.state; effectiveOn: string; expiresOn: string; terms: KlutchPolicyTerms }, actorFor(ctx.user));
      } catch (error) {
        asTrpcError(error);
      }
    }),

  renew: protectedProcedure
    .input(z.object({ policyId: z.number().int().positive(), effectiveOn: dateSchema, expiresOn: dateSchema, terms: termsSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await renewKlutchPolicy(input.policyId, input.effectiveOn, input.expiresOn, input.terms, actorFor(ctx.user));
      } catch (error) {
        asTrpcError(error);
      }
    }),

  recordDocument: protectedProcedure
    .input(z.object({
      policyId: z.number().int().positive(),
      documentType: z.enum(KLUTCH_DOCUMENT_TYPES),
      claimNumber: z.string().trim().max(128).optional(),
      snapshot: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 100000, "Document inputs are too large to save."),
    }))
    .mutation(async ({ input, ctx }) => {
      const snapshot = input.snapshot;
      if (input.documentType === "tnc_denial") {
        requireValue(snapshot.dateOfLoss, "Date of loss");
        requireValue(snapshot.tncName, "TNC name");
        requireValue(snapshot.supportingRecords, "Supporting-record reference");
        const period = String(snapshot.tncPeriod ?? "");
        if (!['1', '2', '3'].includes(period)) throw new TRPCError({ code: "BAD_REQUEST", message: "A TNC denial may be created only for Period 1, 2, or 3. Period 0 personal use cannot be denied by this workflow." });
      }
      if (input.documentType === "carrier_position") {
        for (const [key, label] of Object.entries({ carrierName: "Carrier name", carrierAddress: "Carrier address", adjusterName: "Adjuster", carrierClaimNumber: "Carrier claim number", dateOfLoss: "Date of loss", tncName: "TNC name", tncPeriod: "TNC period", supportingRecords: "Supporting-record reference" })) requireValue(snapshot[key], label);
        if (!['1', '2', '3'].includes(String(snapshot.tncPeriod))) throw new TRPCError({ code: "BAD_REQUEST", message: "Carrier position letters require a TNC Period 1, 2, or 3." });
      }
      try {
        return await recordKlutchDocument(input, actorFor(ctx.user));
      } catch (error) {
        asTrpcError(error);
      }
    }),

  cancelAndRecord: protectedProcedure
    .input(z.object({
      policyId: z.number().int().positive(),
      cancelledOn: dateSchema,
      claimNumber: z.string().trim().max(128).optional(),
      documentSnapshot: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 100000),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await cancelKlutchPolicy(input, actorFor(ctx.user));
      } catch (error) {
        asTrpcError(error);
      }
    }),

  approveEndorsement: adminProcedure
    .input(z.object({ policyId: z.number().int().positive(), claimNumber: z.string().trim().max(128).optional(), carrierRequestEvidence: z.string().trim().min(10).max(12000) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await approveKlutchEndorsement(input.policyId, input.claimNumber, input.carrierRequestEvidence, actorFor(ctx.user));
      } catch (error) {
        asTrpcError(error);
      }
    }),
});
