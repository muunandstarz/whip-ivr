import type { Request, Response } from "express";
import { getLossIntakeSettingsByScheduleTaskUid } from "./lossIntakeDb";
import { easternScheduledRefreshSlot, refreshLossIntakeSources } from "./lossIntakeRefresh";
import { sdk } from "./_core/sdk";

/** Heartbeat runs hourly on weekdays; only the 8 AM, 11 AM, 2 PM, and 5 PM ET slots read sources. */
export async function scheduledLossIntakeSyncHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
    const settings = await getLossIntakeSettingsByScheduleTaskUid(taskUid);
    if (!settings) return res.json({ ok: true, skipped: "orphan" });
    const now = new Date();
    if (!easternScheduledRefreshSlot(now)) return res.json({ ok: true, skipped: "outside_refresh_slot" });
    const result = await refreshLossIntakeSources(now);
    return res.status(result.ok ? 200 : 503).json({ ok: result.ok, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, stack: error instanceof Error ? error.stack : undefined, context: { url: req.originalUrl, taskUid: taskUid ?? null }, timestamp: new Date().toISOString() });
  }
}
