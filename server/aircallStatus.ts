export type AircallOutcome = "answered" | "missed" | "voicemail" | "abandoned";

const ABANDONED_REASONS = new Set([
  "abandoned_in_classic",
  "abandoned_in_ivr",
  "short_abandoned",
]);

/**
 * Aircall reports completed calls as `done`; `missed_call_reason` identifies
 * whether the caller abandoned, no agent could answer, or voicemail was left.
 */
export function normalizeAircallOutcome(
  status?: string | null,
  missedCallReason?: string | null,
): AircallOutcome {
  const reason = missedCallReason?.trim().toLowerCase() ?? "";

  if (status === "answered") return "answered";
  if (reason === "voicemail" || status === "voicemail") return "voicemail";
  if (status === "abandoned" || ABANDONED_REASONS.has(reason)) return "abandoned";
  if (status === "done" && !reason) return "answered";
  return "missed";
}

/**
 * A caller who did not reach a person needs a visible, assigned callback task.
 * Do not create a competing placeholder when Aircall has already recorded a
 * voicemail; that event becomes the richer AI-extracted intake instead.
 */
export function shouldCreateMissedCallCallback(input: {
  direction?: string | null;
  status?: string | null;
  missedCallReason?: string | null;
  voicemail?: string | null;
  durationSeconds?: number | null;
}): boolean {
  if (input.direction === "outbound" || input.voicemail) return false;

  const outcome = normalizeAircallOutcome(input.status, input.missedCallReason);
  if (outcome === "missed") return true;

  // Ignore instantaneous misdials, but preserve a caller who waited in the
  // call flow long enough to reasonably expect an answer.
  return outcome === "abandoned" && Number(input.durationSeconds ?? 0) >= 15;
}
