import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { RentalHandoffService, rentalHandoffService, rentalSettingsSchema, rentalCreateDraftSchema, rentalManualVehicleSchema, RENTAL_SUPPORT_KINDS, RENTAL_SUPPORT_MAX_BYTES } from "../rentalHandoffService";
import { ASSET_KINDS, RENTAL_STATUS, rentalDraftSchema, rentalReturnSchema } from "../../shared/rentalHandoff";
import { resolveRentalActor, requireSameOrigin, rateLimitRental, requestAudit, issueShopSession, cookieToken, tokenHash, RENTAL_COOKIE, rentalCookieOptions } from "../rentalHandoffSecurity";

const id = z.number().int().positive();
const revision = z.number().int().positive();
const recordInput = z.object({ id, revision }).strict();
const requestId = z.string().min(8).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Use a unique random request ID.");
/** Factory supports isolated service tests; no shop credentials enter native/Manus auth. */
export function createRentalHandoffRouter(service: RentalHandoffService) {
  const resolve = publicProcedure.use(async ({ ctx, next, type }) => {
    const actor = await resolveRentalActor(ctx, service.repo, service.deps.now());
    if (actor?.role === "shop" && type === "mutation") requireSameOrigin(ctx.req);
    return next({ ctx: { ...ctx, rentalActor: actor } });
  });
  const authenticated = resolve.use(({ ctx, next }) => {
    if (!ctx.rentalActor) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to access rental handoff." });
    return next({ ctx: { ...ctx, rentalActor: ctx.rentalActor } });
  });
  return router({
    session: resolve.query(({ ctx }) => service.session(ctx.rentalActor)),
    connectSender: authenticated.mutation(async ({ ctx }): Promise<{ url: string }> => {
      requireSameOrigin(ctx.req);
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Rental packets use the shared Mailgun sender. An administrator must configure its credentials and verified sending domain in server secret settings; individual Gmail connections are not used." });
    }),
    disconnectSender: authenticated.mutation(async ({ ctx }): Promise<{ success: boolean }> => {
      requireSameOrigin(ctx.req);
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The shared Mailgun sender cannot be disconnected by an individual rental user. An administrator manages it through server secret settings." });
    }),
    saveSharedSender: authenticated.input(z.object({ domain: z.string().min(1).max(253), fromEmail: z.string().min(1).max(254), apiKey: z.string().min(1).max(512), region: z.enum(["US", "EU"]), replyToEmail: z.string().min(1).max(254).optional() }).strict()).mutation(({ ctx, input }) => {
      requireSameOrigin(ctx.req);
      return service.saveSharedSender(ctx.rentalActor, input);
    }),
    list: authenticated.input(z.object({ search: z.string().max(180).optional(), status: z.enum(RENTAL_STATUS).optional() }).strict().optional()).query(({ ctx, input }) => service.list(ctx.rentalActor, input)),
    get: authenticated.input(z.object({ id }).strict()).query(({ ctx, input }) => service.get(ctx.rentalActor, input.id)),
    create: authenticated.input(z.object({ draft: rentalCreateDraftSchema, vehicle: rentalManualVehicleSchema.optional() }).strict()).mutation(({ ctx, input }) => service.create(ctx.rentalActor, input.draft, input.vehicle)),
    decodeVin: authenticated.input(z.object({ vin: rentalManualVehicleSchema.shape.vin }).strict()).mutation(({ ctx, input }) => service.decodeVin(ctx.rentalActor, input.vin)),
    save: authenticated.input(recordInput.extend({ draft: rentalDraftSchema }).strict()).mutation(({ ctx, input }) => service.save(ctx.rentalActor, input.id, input.revision, input.draft)),
    upload: authenticated.input(z.object({ id, kind: z.enum(ASSET_KINDS), base64: z.string().max(6990600), signerName: z.string().trim().min(1).max(120).optional() }).strict()).mutation(({ ctx, input }) => service.upload(ctx.rentalActor, input, requestAudit(ctx.req))),
    uploadSupport: authenticated.input(z.object({ id, kind: z.enum(RENTAL_SUPPORT_KINDS), base64: z.string().max(Math.ceil(RENTAL_SUPPORT_MAX_BYTES / 3) * 4 + 64), fileName: z.string().max(255).optional() }).strict()).mutation(({ ctx, input }) => service.uploadSupport(ctx.rentalActor, input, requestAudit(ctx.req))),
    complete: authenticated.input(recordInput.extend({ requestId }).strict()).mutation(({ ctx, input }) => service.complete(ctx.rentalActor, input)),
    saveReturn: authenticated.input(recordInput.extend({ data: rentalReturnSchema }).strict()).mutation(({ ctx, input }) => service.saveReturn(ctx.rentalActor, input)),
    returnComplete: authenticated.input(recordInput.extend({ requestId, data: rentalReturnSchema }).strict()).mutation(({ ctx, input }) => service.returnComplete(ctx.rentalActor, input)),
    confirmSettlement: authenticated.input(recordInput.extend({ confirmed: z.literal(true) }).strict()).mutation(({ ctx, input }) => service.confirmSettlement(ctx.rentalActor, input)),
    close: authenticated.input(recordInput).mutation(({ ctx, input }) => service.close(ctx.rentalActor, input.id, input.revision)),
    newVersion: authenticated.input(recordInput.extend({ reason: z.string().trim().min(1).max(1000) }).strict()).mutation(({ ctx, input }) => service.newVersion(ctx.rentalActor, input.id, input.revision, input.reason)),
    resend: authenticated.input(z.object({ packetId: id, requestId }).strict()).mutation(({ ctx, input }) => service.resend(ctx.rentalActor, input)),
    saveLocation: authenticated.input(z.object({ id: id.optional(), name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(1000), phone: z.string().trim().min(1).max(40), timezone: z.string().min(1).max(60), active: z.boolean() }).strict()).mutation(({ ctx, input }) => service.saveLocation(ctx.rentalActor, input)),
    saveVehicle: authenticated.input(z.object({ id: id.optional(), locationId: id, ymm: z.string().trim().min(1).max(120), vin: z.string().length(17).regex(/^[A-HJ-NPR-Z0-9]{17}$/i).transform(v => v.toUpperCase()), plate: z.string().trim().min(1).max(30), lastOdometer: z.number().int().nonnegative().max(2000000) }).strict()).mutation(({ ctx, input }) => service.saveVehicle(ctx.rentalActor, input)),
    saveSettings: authenticated.input(z.object({ settings: rentalSettingsSchema }).strict()).mutation(({ ctx, input }) => service.saveSettings(ctx.rentalActor, input.settings)),
    inviteShop: authenticated.input(z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254), locationIds: z.array(id).min(1).max(100) }).strict()).mutation(({ ctx, input }) => service.inviteShop(ctx.rentalActor, input)),
    deactivateShop: authenticated.input(z.object({ id }).strict()).mutation(({ ctx, input }) => service.deactivateShop(ctx.rentalActor, input.id)),
    listShop: authenticated.query(({ ctx }) => service.listShop(ctx.rentalActor)),
    signIn: publicProcedure.input(z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict()).mutation(async ({ ctx, input }) => {
      requireSameOrigin(ctx.req); rateLimitRental(ctx.req, "signIn", service.deps.now());
      const user = await service.signIn(input.email, input.password);
      await issueShopSession(service.repo, user.shopUserId, ctx.res, service.deps.now());
      return { success: true };
    }),
    activate: publicProcedure.input(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(12).max(128) }).strict()).mutation(async ({ ctx, input }) => {
      requireSameOrigin(ctx.req); rateLimitRental(ctx.req, "activate", service.deps.now());
      const user = await service.activate(input.token, input.password);
      await issueShopSession(service.repo, user.shopUserId, ctx.res, service.deps.now());
      return { success: true };
    }),
    signOut: publicProcedure.mutation(async ({ ctx }) => {
      requireSameOrigin(ctx.req);
      const token = cookieToken(ctx.req); if (token) await service.repo.remove("sessions", { eq: { tokenHash: tokenHash(token) } });
      ctx.res.clearCookie(RENTAL_COOKIE, rentalCookieOptions);
      return { success: true };
    }),
    exportDrafts: authenticated.query(async ({ ctx }) => {
      if (ctx.rentalActor.role === "shop") throw new TRPCError({ code: "FORBIDDEN", message: "Claims or Admin access is required." });
      return service.list(ctx.rentalActor);
    }),
  });
}
export const rentalHandoffRouter = createRentalHandoffRouter(rentalHandoffService);
