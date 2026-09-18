import type { Request, Response } from "express";
import { getLossIntakeSettingsByDispatchScheduleTaskUid } from "./lossIntakeDb";
import { publishLossIntakeDispatch } from "./lossIntakeDispatch";
import { sdk } from "./_core/sdk";

/** Legacy endpoint retained only for an existing task UID; it publishes the single Intake digest, never processor work. */
export async function scheduledLossIntakeDispatchHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
    const settings = await getLossIntakeSettingsByDispatchScheduleTaskUid(taskUid);
    if (!settings) return res.json({ ok: true, skipped: "orphan" });
    const result = await publishLossIntakeDispatch({ now: new Date() });
    return res.json({ ok: true, result: { intake: result.intake.length, skipped: result.skipped } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, stack: error instanceof Error ? error.stack : undefined, context: { url: req.originalUrl, taskUid: taskUid ?? null }, timestamp: new Date().toISOString() });
  }
}
