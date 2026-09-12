import type { Request, Response } from "express";
import { getLossIntakeSettingsByDispatchScheduleTaskUid } from "./lossIntakeDb";
import { publishLossIntakeDispatch } from "./lossIntakeDispatch";
import { sdk } from "./_core/sdk";

function easternHour(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { weekday: parts.weekday, hour: Number(parts.hour) };
}

export async function scheduledLossIntakeDispatchHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
    const settings = await getLossIntakeSettingsByDispatchScheduleTaskUid(taskUid);
    if (!settings) return res.json({ ok: true, skipped: "orphan" });

    const now = new Date();
    const clock = easternHour(now);
    const isWeekday = !["Sat", "Sun"].includes(clock.weekday);
    if (!isWeekday || (clock.hour !== 8 && (clock.hour < 9 || clock.hour > 18))) {
      return res.json({ ok: true, skipped: "outside_dispatch_window", clock });
    }
    const result = await publishLossIntakeDispatch({
      now,
      publishProcessors: clock.hour === 8,
      publishIntake: clock.hour >= 9 && clock.hour <= 18,
    });
    return res.json({ ok: true, clock, result: { unfiled: result.unfiled.length, intake: result.intake.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: taskUid ?? null },
      timestamp: new Date().toISOString(),
    });
  }
}
