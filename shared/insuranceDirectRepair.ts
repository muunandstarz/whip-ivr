import { z } from "zod";

const fact = z.string().max(180);
/** Suggestions from one repair document, not verified claim or coverage facts. */
export const insuranceDirectRepairFactsSchema = z.object({
  documentKind: z.enum(["repair_invoice", "repair_estimate", "dv_appraisal", "unknown"]),
  claimNumber: fact,
  claimNumberRole: z.enum(["our", "unknown"]),
  vin: fact,
  vehicle: fact,
  dateOfLoss: fact,
  repairFacility: fact,
  roNumber: fact,
  invoiceNumber: fact,
  invoiceDate: fact,
  repairStart: fact,
  returnedToService: fact,
  repairCompleted: fact,
  repairTotal: fact,
  sourcePages: z.record(z.string(), z.string().max(3)),
  warnings: z.array(z.string().max(240)).max(15),
}).strict();
export type InsuranceDirectRepairFacts = z.infer<typeof insuranceDirectRepairFactsSchema>;

export function repairDocumentConflicts(current: { claimNumber: string; vin: string }, facts: InsuranceDirectRepairFacts): string[] {
  const normalize = (value: string) => value.trim().toUpperCase();
  const conflicts: string[] = [];
  if (current.vin.trim() && facts.vin && normalize(current.vin) !== normalize(facts.vin)) conflicts.push("This repair document's VIN does not match this vehicle. Do not apply it to this claim.");
  if (current.claimNumber.trim() && facts.claimNumber && facts.claimNumberRole === "our" && normalize(current.claimNumber) !== normalize(facts.claimNumber)) conflicts.push("This repair document's Whip claim number does not match this claim. Do not apply it.");
  return conflicts;
}

export const REPAIR_PREFILL_FIELDS = [
  ["claimNumber", "Whip claim number"], ["vin", "VIN"], ["vehicle", "Year / make / model"],
  ["dateOfLoss", "Date of loss"], ["repairFacility", "Repair facility"], ["roNumber", "RO number"],
  ["repairStart", "Drop-off date"], ["returnedToService", "Returned to service"], ["repairCompleted", "Repair completed date"],
] as const;
export type RepairPrefillField = typeof REPAIR_PREFILL_FIELDS[number][0];
export type RepairPrefillPatch = Partial<Record<RepairPrefillField, string>>;

/** Apply only the handler's explicit field selection; amounts and invoice dates never become demand or repair dates. */
export function reviewedRepairPatch(facts: InsuranceDirectRepairFacts, selected: RepairPrefillField[]): RepairPrefillPatch {
  const patch: RepairPrefillPatch = {};
  for (const [key] of REPAIR_PREFILL_FIELDS) {
    if (!selected.includes(key) || !facts[key]) continue;
    if (key === "claimNumber" && facts.claimNumberRole !== "our") continue;
    patch[key] = facts[key];
  }
  return patch;
}
