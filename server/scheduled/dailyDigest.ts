/**
 * /api/scheduled/dailyDigest
 *
 * Project-level Heartbeat (§4a) — fires weekly (Fridays at 5:30 PM ET).
 * Generates a performance digest for every active handler and sends the owner
 * ONE consolidated weekly summary notification. Individual per-handler
 * notifications are NOT sent — handlers see their own stats on their dashboard.
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

    const summary: string[] = [];

    for (const d of digests) {
      if (!d) continue;

      const weekAnswerRate =
        d.thisWeek.calls > 0
          ? Math.round((d.thisWeek.answered / d.thisWeek.calls) * 100)
          : 0;

      summary.push(
        `• ${d.handlerName}: ${d.thisWeek.calls} calls, ${weekAnswerRate}% answer rate, ${d.thisWeek.callbacksCompleted} callbacks done` +
        (d.latestQaScore !== null ? `, QA ${d.latestQaScore}/10` : "")
      );
    }

    // Send ONE consolidated weekly summary to the owner only
    const sent = summary.length;
    await notifyOwner({
      title: `Weekly Performance Digest — ${sent} handlers`,
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
