/**
 * /api/scheduled/dailyDigest
 *
 * Project-level Heartbeat (§4a) — fires Mon–Fri at 5:30 PM ET (21:30 UTC).
 * Generates a performance digest for every active handler and sends each one
 * a notification via the Manus notification system.
 *
 * Auth: cron identity only (user.isCron === true).
 */
import type { Request, Response } from "express";
import { getAllHandlerDigests } from "../db";
import { notifyOwner } from "../_core/notification";

export async function dailyDigestHandler(req: Request, res: Response) {
  try {
    const digests = await getAllHandlerDigests();

    if (!digests || digests.length === 0) {
      return res.json({ ok: true, sent: 0, skipped: "no digests" });
    }

    let sent = 0;
    const summary: string[] = [];

    for (const d of digests) {
      if (!d) continue;

      const weekAnswerRate =
        d.thisWeek.calls > 0
          ? Math.round((d.thisWeek.answered / d.thisWeek.calls) * 100)
          : 0;

      const lines = [
        `📞 Today: ${d.today.calls} calls received, ${d.today.answered} answered`,
        `📅 This week: ${d.thisWeek.calls} calls · ${weekAnswerRate}% answer rate · ${d.thisWeek.callbacksCompleted} callbacks done · ${d.thisWeek.callbacksPending} pending`,
        `📆 This month: ${d.thisMonth.calls} calls · ${d.thisMonth.callbacksCompleted} callbacks completed`,
        d.latestQaScore !== null
          ? `⭐ Latest QA score: ${d.latestQaScore}/10 (week of ${d.latestQaWeek})`
          : `⭐ No QA scores yet`,
        ``,
        `💬 Manager note:`,
        d.coachingNote || "Keep up the good work.",
      ];

      const content = lines.join("\n");
      const title = `Daily Performance Digest — ${d.handlerName}`;

      // Send as owner notification (visible in the Manus notification panel)
      await notifyOwner({ title, content });
      sent++;
      summary.push(`${d.handlerName}: ${d.today.calls} calls, ${weekAnswerRate}% answer rate`);
    }

    // Send a summary to the owner as well
    await notifyOwner({
      title: `Daily Digest Sent — ${sent} handlers`,
      content: summary.join("\n"),
    });

    return res.json({ ok: true, sent, handlers: summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return res.status(500).json({
      error: message,
      stack,
      context: { url: req.url },
      timestamp: new Date().toISOString(),
    });
  }
}
