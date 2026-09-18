import { clearClaimsTrackerCache, getClaimsTrackerIndex, reconcileStoredClaimsTrackerFiling } from "./claimsTrackerCorroboration";
import { publishLossIntakeDispatch } from "./lossIntakeDispatch";
import { refreshLossIntakeDailyMetrics } from "./lossIntakeSharedQueue";
import { runLossIntakeSlackSync } from "./lossIntakeSlackSync";

export function easternScheduledRefreshSlot(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  const hour = Number(parts.hour);
  const weekday = parts.weekday;
  return !["Sat", "Sun"].includes(weekday) && [8, 11, 14, 17].includes(hour);
}

/**
 * One board refresh reads the three source families fresh: Slack source threads,
 * All Reported IncidentsStatus, and market inspection schedules. A Slack digest
 * is updated only after a complete source refresh and only if configured.
 */
export async function refreshLossIntakeSources(now = new Date()) {
  clearClaimsTrackerCache();
  const tracker = await getClaimsTrackerIndex();
  let slack: Awaited<ReturnType<typeof runLossIntakeSlackSync>> | null = null;
  let slackError: string | null = null;
  try {
    slack = await runLossIntakeSlackSync();
  } catch (error) {
    slackError = error instanceof Error ? error.message : String(error);
  }

  let reconciliation: Awaited<ReturnType<typeof reconcileStoredClaimsTrackerFiling>> | null = null;
  let trackerError: string | null = null;
  if (tracker.available) {
    try {
      reconciliation = await reconcileStoredClaimsTrackerFiling(tracker);
    } catch (error) {
      trackerError = error instanceof Error ? error.message : String(error);
    }
  } else {
    trackerError = tracker.warning ?? "Claims Tracker is unavailable";
  }

  const metrics = await refreshLossIntakeDailyMetrics(now);
  const digest = !slackError && !trackerError
    ? await publishLossIntakeDispatch({ now })
    : { published: {}, skipped: "source_incomplete" as const, intake: [], intakeMessage: null };

  return {
    ok: !slackError && !trackerError,
    slack,
    slackError,
    tracker: { available: tracker.available, filedVinCount: tracker.filedVins.size, scheduledVinCount: tracker.inspectionByVin.size, reconciliation, error: trackerError },
    metrics,
    digest,
  };
}
