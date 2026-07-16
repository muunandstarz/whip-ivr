import type { Request, Response } from "express";
import { getLossIntakeSettingsByScheduleTaskUid } from "./lossIntakeDb";
import { runLossIntakeSlackSync } from "./lossIntakeSlackSync";
import { sdk } from "./_core/sdk";

export async function scheduledLossIntakeSyncHandler(
  req: Request,
  res: Response,
) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid;
    if (!user.isCron || !taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const settings = await getLossIntakeSettingsByScheduleTaskUid(taskUid);
    if (!settings) {
      return res.json({ ok: true, skipped: "orphan" });
    }

    const result = await runLossIntakeSlackSync();
    return res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return res.status(500).json({
      error: message,
      stack,
      context: { url: req.originalUrl, taskUid: taskUid ?? null },
      timestamp: new Date().toISOString(),
    });
  }
}
