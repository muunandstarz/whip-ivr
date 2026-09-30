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
