/**
 * Weekly QA Auto-Post — runs every Friday at 4pm ET
 * Generates QA scores for the current week and posts them to each handler's dashboard.
 * Also sends an owner notification summarizing the results.
 */
import type { Request, Response } from "express";
import {
  generateWeeklyQAReport,
  deleteScorecardsByWeek,
  saveHandlerScorecard,
  getHandlers,
} from "../db";
import { notifyOwner } from "../_core/notification";
import { sdk } from "../_core/sdk";

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function weeklyQAPostHandler(req: Request, res: Response) {
  try {
    // Authenticate — allow cron callers and admin users
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) return res.status(403).json({ error: "Unauthorized" });
    } catch {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const weekStart = getMondayOfWeek(new Date());
    console.log(`[WeeklyQAPost] Generating QA for week of ${weekStart}`);

    // Clear any existing AI-generated scorecards for this week first
    await deleteScorecardsByWeek(weekStart);

    const results = await generateWeeklyQAReport(weekStart);

    if (results.length === 0) {
      console.log(`[WeeklyQAPost] No data found for week of ${weekStart}`);
      await notifyOwner({
        title: "Weekly QA — No Data",
        content: `No intake records found for the week of ${weekStart}. QA scores were not generated.`,
      });
      return res.json({ ok: true, generated: 0, weekStart });
    }

    // Save and push each scorecard to the handler's profile
    const handlers = await getHandlers();
    let pushed = 0;
    for (const r of results) {
      const handler = handlers.find(
        (h) =>
          h.name.toLowerCase().includes(r.handlerName.toLowerCase()) ||
          r.handlerName.toLowerCase().includes(h.name.toLowerCase())
      );
      if (handler) {
        await saveHandlerScorecard({
          handlerId: handler.id,
          handlerName: r.handlerName,
          weekOf: r.weekOf,
          greetingScore: r.greetingScore,
          holdManagementScore: r.holdManagementScore,
          resolutionScore: r.resolutionScore,
          empathyScore: r.empathyScore,
          callControlScore: r.callControlScore,
          overallScore: r.overallScore,
          strengths: r.strengths.join("\n"),
          improvements: r.improvements.join("\n"),
          submittedBy: "AI QA System (Auto)",
        });
        pushed++;
      }
    }

    // Build summary for owner notification
    const avgScore =
      results.reduce((sum, r) => sum + r.overallScore, 0) / results.length;
    const topPerformer = results.reduce((best, r) =>
      r.overallScore > best.overallScore ? r : best
    );
    const needsAttention = results.filter((r) => r.overallScore < 6);

    const summaryLines = results
      .sort((a, b) => b.overallScore - a.overallScore)
      .map(
        (r) =>
          `• ${r.handlerName}: ${r.overallScore}/10 (${r.callsAnalyzed} intakes)`
      )
      .join("\n");

    await notifyOwner({
      title: `Weekly QA Posted — Week of ${weekStart}`,
      content: `QA scores generated and posted to ${pushed} handler dashboards.\n\nTeam average: ${avgScore.toFixed(1)}/10\nTop performer: ${topPerformer.handlerName} (${topPerformer.overallScore}/10)\n${needsAttention.length > 0 ? `Needs attention (< 6/10): ${needsAttention.map((r) => r.handlerName).join(", ")}\n` : ""}\nFull breakdown:\n${summaryLines}`,
    });

    console.log(
      `[WeeklyQAPost] Posted ${pushed}/${results.length} scorecards for week of ${weekStart}`
    );
    return res.json({ ok: true, generated: results.length, pushed, weekStart, avgScore });
  } catch (err: any) {
    console.error("[WeeklyQAPost] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
