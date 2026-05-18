/**
 * Manually trigger the weekly QA report generation for the current week.
 * Run this after backfilling agentName to generate scorecards that were missed.
 */
import { generateWeeklyQAReport, getHandlers, saveHandlerScorecard } from "../server/db";
import { notifyOwner } from "../server/_core/notification";

async function main() {
  // Get Monday of current week
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  const weekStart = monday.toISOString().slice(0, 10);

  console.log(`Generating weekly QA report for week of ${weekStart}...`);

  const results = await generateWeeklyQAReport(weekStart);
  console.log(`Got ${results.length} handler results from LLM`);

  const handlers = await getHandlers();
  let saved = 0;

  for (const r of results) {
    console.log(`\nHandler: ${r.handlerName}, overall: ${r.overallScore}/10, calls: ${r.callsAnalyzed}`);
    const handler = handlers.find((h) =>
      h.name.toLowerCase().includes(r.handlerName.toLowerCase()) ||
      r.handlerName.toLowerCase().includes(h.name.toLowerCase())
    );

    if (!handler) {
      console.log(`  WARNING: No matching handler found for "${r.handlerName}" — skipping save`);
      continue;
    }

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
      managerComments: r.coachingNote,
      submittedBy: "Auto-QA (manual trigger)",
    });
    console.log(`  Saved scorecard for ${r.handlerName} (handler id ${handler.id})`);
    saved++;
  }

  const avgScore = results.length > 0
    ? (results.reduce((s, r) => s + r.overallScore, 0) / results.length).toFixed(1)
    : "N/A";

  await notifyOwner({
    title: `✅ Weekly QA Report Generated — ${weekStart}`,
    content: `Auto-generated QA scorecards for ${saved} handler${saved !== 1 ? "s" : ""} (week of ${weekStart}). Team avg score: ${avgScore}/10. View the full report in Weekly QA.`,
  });

  console.log(`\nDone. Saved ${saved} scorecards. Team avg: ${avgScore}/10`);
}

main().catch(console.error).finally(() => process.exit(0));
