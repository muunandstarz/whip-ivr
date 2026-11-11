import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { sdk } from "./_core/sdk";
import { rentalReminderService, type RentalReminderService } from "./rentalReminders";

export function registerRentalRemindersApi(app: Express, service: RentalReminderService = rentalReminderService) {
  app.post("/api/scheduled/rentalAppointmentReminders", async (req: Request, res: Response) => {
    let user;
    try { user = await sdk.authenticateRequest(req); }
    catch { res.status(401).json({ error: "unauthenticated" }); return; }
    if (!user.isCron || !user.taskUid) { res.status(403).json({ error: "cron-only" }); return; }
    try {
      const result = await service.sweep(user.taskUid);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(500).json({ error: "rental_reminder_schedule_failed", errorType: error instanceof Error ? error.name : "UnknownError", context: { path: "/api/scheduled/rentalAppointmentReminders", taskUid: user.taskUid }, timestamp: Date.now() });
    }
  });
  // Textline's New Webhook UI allows a custom target URL. Configure both events
  // to this secret-bearing HTTPS path; never publish the secret URL in status.
  app.post("/api/rental-handoff/sms/textline/webhook/:secret", async (req: Request, res: Response) => {
    try {
      if (Number(req.headers["content-length"] || 0) > 100_000 || Buffer.byteLength(JSON.stringify(req.body || {})) > 100_000) { res.status(413).json({ error: "webhook_too_large" }); return; }
      const eventType = req.headers["x-tgp-event-type"];
      const signature = req.headers["x-tgp-event-signature"], time = req.headers["x-tgp-event-time"];
      const result = await service.processProviderEvent(req.body, typeof req.params.secret === "string" ? req.params.secret : undefined, typeof eventType === "string" && eventType.length <= 80 ? eventType : undefined, {
        signature: typeof signature === "string" ? signature : undefined,
        time: typeof time === "string" ? time : undefined,
        type: typeof eventType === "string" ? eventType : undefined,
      });
      res.json({ ok: true, ...result });
    } catch (e) { res.status(e instanceof TRPCError && e.code === "UNAUTHORIZED" ? 401 : 500).json({ error: "rental_sms_webhook_rejected" }); }
  });
}
