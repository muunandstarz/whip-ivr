import type { Express } from "express";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TRPCError } from "@trpc/server";
import { sdk } from "./_core/sdk";
import { resolveRentalActor } from "./rentalHandoffSecurity";
import { RentalHandoffService, rentalHandoffService } from "./rentalHandoffService";
import { storageGetSignedUrl } from "./storage";

/** Rental-only OAuth and streaming downloads; shop auth is not global middleware. */
export function registerRentalHandoffApi(app: Express, service: RentalHandoffService = rentalHandoffService) {
  app.get("/api/rental-handoff/gmail/callback", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let user = null;
    try { user = await sdk.authenticateRequest(req); } catch { /* No anonymous OAuth binding. */ }
    // Only native rental ADMIN can finish OAuth; the shared storage owner is never
    // passed as the authenticated principal. State verifies this exact admin key.
    if (!user) { res.status(401).json({ error: "Sign in as the rental Admin who started the shared Gmail connection, then connect again." }); return; }
    const actor = await resolveRentalActor({ req, user }, service.repo, service.deps.now());
    if (!actor || actor.role !== "admin") { res.status(403).json({ error: "Rental Admin access is required to connect the shared Gmail sender." }); return; }
    const { code, state, error } = req.query;
    if (typeof code !== "string" || typeof state !== "string" || error !== undefined || !/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) {
      res.redirect(303, "/rental-handoff/admin?gmail=error"); return;
    }
    try {
      await service.finishSharedGmail(actor, code, state);
      res.redirect(303, "/rental-handoff/admin?gmail=connected");
    } catch {
      // Never return arbitrary Google error text, authorization code, or state.
      res.redirect(303, "/rental-handoff/admin?gmail=error");
    }
  });
  app.get("/api/rental-handoff/files/:type/:id", async (req, res) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 60000);
    res.once("close", () => abort.abort());
    try {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      if (!/^[1-9]\d{0,9}$/.test(req.params.id) || !["asset", "packet"].includes(req.params.type)) throw new TRPCError({ code: "NOT_FOUND", message: "Rental file not found." });
      let user = null;
      try { user = await sdk.authenticateRequest(req); } catch { /* Isolated shop sessions are resolved below. */ }
      const ctx = { req, user };
      const actor = await resolveRentalActor(ctx, service.repo, service.deps.now());
      if (!actor) throw new TRPCError({ code: "UNAUTHORIZED", message: "Rental authentication is required." });
      const file = await service.authorizeFile(actor, req.params.type as "asset" | "packet", Number(req.params.id));
      const signedUrl = await storageGetSignedUrl(file.storageKey);
      const upstream = await fetch(signedUrl, { signal: abort.signal, redirect: "error" });
      const limit = req.params.type === "asset" ? 10 * 1024 * 1024 : 30 * 1024 * 1024;
      const length = Number(upstream.headers.get("content-length") || 0);
      if (!upstream.ok || !upstream.body || length > limit) throw new TRPCError({ code: "BAD_GATEWAY", message: "Rental file storage is unavailable." });
      res.setHeader("Content-Type", file.mime);
      res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${file.filename}"`);
      if (length > 0) res.setHeader("Content-Length", length);
      let total = 0;
      const bounded = new Transform({ transform(chunk, _encoding, callback) { total += chunk.length; callback(total > limit ? new Error("Rental file exceeds limit.") : null, chunk); } });
      await pipeline(Readable.fromWeb(upstream.body as any), bounded, res);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const code = error instanceof TRPCError ? error.code : "BAD_GATEWAY";
      const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "SERVICE_UNAVAILABLE" ? 503 : 502;
      res.status(status).json({ error: status === 401 ? "Rental authentication is required." : status === 403 ? "Rental file access is restricted." : status === 404 ? "Rental file not found." : "Rental file is unavailable." });
    } finally { clearTimeout(timer); }
  });
}
