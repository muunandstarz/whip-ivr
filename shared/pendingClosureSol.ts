import entries from "./pendingClosureSolReference.json";

export type PendingClosureSolReference = {
  state: string; abbr: string; bodily_injury_years: number; property_damage_years: number;
  citation: string; notes: string; status: string; letter_language: string;
};
/** Owner-supplied secondary summaries, not current-law verification or counsel approval. */
export const PENDING_CLOSURE_SOL_REFERENCE = entries as PendingClosureSolReference[];
export const PENDING_CLOSURE_SOL_SOURCE = "WhipStatuteofLimitationsLookup-50States.xlsx / sol_states.json (supplied November 6, 2026)";
export const PENDING_CLOSURE_SOL_WARNING = "These figures come from secondary summaries, not the statutes themselves. Have counsel confirm the applicable rule before using specific limitation-period language. Source status OK means secondary sources agree; it does not mean counsel-approved. This lookup does not calculate a legal deadline or satisfy a separate statutory notice requirement.";
export function pendingClosureSolReference(abbr: string): PendingClosureSolReference | undefined {
  return PENDING_CLOSURE_SOL_REFERENCE.find(row => row.abbr === abbr);
}
