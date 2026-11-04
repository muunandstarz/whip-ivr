export interface DvReportFacts {
  reportId: string; reportDate: string; appraiser: string; methodology: string;
  claimNumber: string; claimNumberRole: "our" | "unknown"; claimantName: string;
  vehicleYear: string; vehicleMake: string; vehicleModel: string; vin: string;
  dateOfLoss: string; repairFacility: string; dvAmount: string;
  adjustedVehicleValue: string; prelossValue: string; postlossValue: string;
  carfaxReported: boolean | null; dvSourcePage: string; warnings: string[];
}

/** The request-only parser uses integer cents; UI and retained reviews use USD dollar strings. */
export function dvReportToDollarFacts(input: DvReportFacts): DvReportFacts {
  const report = { ...input };
  for (const key of ["dvAmount", "adjustedVehicleValue", "prelossValue", "postlossValue"] as const) {
    const value = input[key];
    if (!value) { report[key] = ""; continue; }
    if (!/^(?:0|[1-9]\d{0,13})$/.test(value)) throw new RangeError("Invalid DV currency units.");
    const cents = BigInt(value);
    report[key] = `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
  }
  return report;
}

/** A writing aid only. No sample dollar amount, formula, liability conclusion or coverage assertion. */
export const DV_REFERENCE_STARTER = "Diminished value is supported by [appraiser / appraisal company]'s report [report ID], dated [report date], using [stated methodology]. The amount requested is the report's final diminished-value opinion in [section / page]. The appraisal report is enclosed for review.";

export function buildDvReportReference(report: DvReportFacts): string {
  return [
    report.appraiser,
    report.reportId ? `Report ${report.reportId}` : "",
    report.reportDate ? `dated ${report.reportDate}` : "",
    report.methodology,
    report.dvSourcePage ? `final diminished-value opinion: ${report.dvSourcePage}` : "",
  ].filter(Boolean).join("; ");
}
const identity = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");
export function dvReportConflicts(current: { claimNumber: string; vin: string }, report: DvReportFacts): string[] {
  const conflicts: string[] = [];
  if (current.vin.trim() && report.vin.trim() && identity(current.vin) !== identity(report.vin)) conflicts.push("The report VIN does not match this form's VIN. Do not apply another vehicle's report.");
  if (current.claimNumber.trim() && report.claimNumber.trim() && report.claimNumberRole === "our" && identity(current.claimNumber) !== identity(report.claimNumber)) conflicts.push("The report's Whip claim number does not match this form. Select the correct claim/report or clear this form before proceeding.");
  return conflicts;
}
