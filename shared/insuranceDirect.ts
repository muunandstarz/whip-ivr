export type InsuranceDirectMode = "lou" | "dv" | "both";

export interface DirectUtilizationSnapshot {
  repairDays: number;
  utilization: string;
  dataStatus?: "reported" | "latest_available" | "unavailable";
}

export function directDemandItems(mode: InsuranceDirectMode) {
  return { hasLou: mode !== "dv", hasDv: mode !== "lou", title: mode === "both" ? "Loss of Use and Diminished Value" : mode === "lou" ? "Loss of Use" : "Diminished Value" };
}

export function directMoney(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) / 100 : 0;
}

/** Date-only UTC arithmetic: pickup/return date is excluded from out-of-service days. */
export function directRepairDays(start: string, end: string): number {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  };
  const from = parse(start); const to = parse(end);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, Math.round((to - from) / 86_400_000)) : 0;
}

export function calculateDirectLou(input: {
  days: number;
  dailyRate: number;
  snapshots: DirectUtilizationSnapshot[];
  utilizationOverride: string;
  utilizationOverrideBasis: string;
}) {
  const gross = directMoney(input.days * input.dailyRate);
  if (input.utilizationOverride.trim()) {
    const percent = Number(input.utilizationOverride);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return { gross, amount: 0, percent: null, basis: "", error: "Enter a supported utilization percentage greater than 0 and no more than 100." };
    }
    if (!input.utilizationOverrideBasis.trim()) {
      return { gross, amount: 0, percent: null, basis: "", error: "Identify the source, dates, and basis for the handler-confirmed utilization percentage." };
    }
    return { gross, amount: directMoney(gross * percent / 100), percent, basis: `Handler-confirmed period utilization: ${input.utilizationOverrideBasis.trim()}`, error: "" };
  }
  // Latest-available data may describe an earlier month, not the repair period.
  // It can be displayed as context but cannot silently drive this demand amount.
  const complete = input.days > 0 && input.snapshots.length > 0
    && input.snapshots.every((row) => row.dataStatus === "reported" && /^\d+(?:\.\d+)?%$/.test(row.utilization) && Number(row.utilization.replace("%", "")) > 0 && Number(row.utilization.replace("%", "")) <= 100)
    && input.snapshots.reduce((total, row) => total + row.repairDays, 0) === input.days;
  if (!complete) {
    return { gross, amount: 0, percent: null, basis: "", error: "Utilization is unavailable or does not match all repair dates. Enter a verified period percentage and its source; no 100% default or older-month fallback is used." };
  }
  const percent = input.snapshots.reduce((total, row) => total + Number(row.utilization.replace("%", "")) * row.repairDays, 0) / input.days;
  return { gross, amount: directMoney(gross * percent / 100), percent, basis: "Repair-day-weighted reported monthly market occupancy, used as a period approximation—not measured daily utilization.", error: "" };
}

export interface InsuranceDirectDraft {
  mode: InsuranceDirectMode;
  letterDate: string;
  insuredName: string;
  repairCompleted: string;
  liabilityStatement: string;
  utilizationOverride: string;
  utilizationOverrideBasis: string;
  prelossValue: string;
  postlossValue: string;
  dvMethod: string;
  carfaxReported: boolean;
  stateAuthority: string;
  authorityVerified: boolean;
  handlerExtension: string;
  handlerEmail: string;
  evidenceConfirmed: boolean;
  dopConfirmed: boolean;
}

export function initialInsuranceDirectDraft(): InsuranceDirectDraft {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { mode: "lou", letterDate: date, insuredName: "", repairCompleted: "", liabilityStatement: "", utilizationOverride: "", utilizationOverrideBasis: "", prelossValue: "", postlossValue: "", dvMethod: "", carfaxReported: false, stateAuthority: "", authorityVerified: false, handlerExtension: "", handlerEmail: "claims@drivewhip.com", evidenceConfirmed: false, dopConfirmed: false };
}

export function validateInsuranceDirectDemand(input: {
  draft: InsuranceDirectDraft;
  claimNumber: string;
  carrierClaimNumber: string;
  carrier: string;
  adjuster: string;
  dateOfLoss: string;
  vehicle: string;
  vin: string;
  driver: string;
  repairFacility: string;
  repairStart: string;
  repairEnd: string;
  handlerName: string;
  handlerTitle: string;
  dailyRate: number;
  louError: string;
  louAmount: number;
}) {
  const errors: string[] = [];
  const required = { "letter date": input.draft.letterDate, "Whip claim number": input.claimNumber, "carrier claim number": input.carrierClaimNumber, "carrier name": input.carrier, "carrier adjuster": input.adjuster, "date of loss": input.dateOfLoss, "carrier's insured": input.draft.insuredName, "driver": input.driver, "vehicle year/make/model": input.vehicle, "repair facility": input.repairFacility, "repair completed date": input.draft.repairCompleted || input.repairEnd, "verified liability statement": input.draft.liabilityStatement, "handler": input.handlerName, "handler title": input.handlerTitle };
  for (const [label, value] of Object.entries(required)) if (!value.trim()) errors.push(`Enter the ${label}.`);
  for (const [label, value] of [["letter date", input.draft.letterDate], ["date of loss", input.dateOfLoss], ["repair completed date", input.draft.repairCompleted || input.repairEnd]]) {
    const time = Date.parse(`${value}T00:00:00Z`);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value)) errors.push(`Enter a valid ${label}.`);
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(input.vin)) errors.push("Enter a valid 17-character VIN.");
  const completed = input.draft.repairCompleted || input.repairEnd;
  if (completed && input.dateOfLoss && completed < input.dateOfLoss) errors.push("Repair completion cannot precede the date of loss.");
  if (completed && input.draft.letterDate && completed > input.draft.letterDate) errors.push("Repair completion cannot follow the letter date; this form is for completed repairs.");
  const { hasLou, hasDv } = directDemandItems(input.draft.mode);
  if (hasLou) {
    if (directRepairDays(input.repairStart, input.repairEnd) <= 0) errors.push("Enter a valid completed out-of-service period; return date must follow drop-off.");
    if (input.dailyRate <= 0 || !Number.isFinite(input.dailyRate)) errors.push("Enter a positive daily rate.");
    if (input.louError) errors.push(input.louError);
    if (input.louAmount <= 0) errors.push("The supported loss-of-use amount must be greater than zero.");
    if (input.repairStart && input.dateOfLoss && input.repairStart < input.dateOfLoss) errors.push("Out-of-service start cannot precede the date of loss.");
  }
  if (hasDv) {
    const pre = directMoney(input.draft.prelossValue); const post = directMoney(input.draft.postlossValue);
    const rawPre = Number(input.draft.prelossValue.replace(/[$,\s]/g, "")); const rawPost = Number(input.draft.postlossValue.replace(/[$,\s]/g, ""));
    if (!input.draft.prelossValue.trim() || !input.draft.postlossValue.trim() || !Number.isFinite(rawPre) || !Number.isFinite(rawPost) || rawPre < 0 || rawPost < 0 || pre <= post) errors.push("Enter appraised pre-loss and post-repair values; the documented pre-loss value must exceed the post-repair value.");
    if (!input.draft.dvMethod.trim()) errors.push("Enter the diminished-value appraisal method and source reference.");
  }
  if (input.draft.stateAuthority.trim() && !input.draft.authorityVerified) errors.push("Confirm that any optional state authority is verified for the loss state, or leave it blank.");
  if (!input.draft.evidenceConfirmed) errors.push("Confirm repairs are complete and all selected damage items have the listed supporting exhibits.");
  if (!input.draft.dopConfirmed) errors.push("Confirm the Direction of Pay and Vehicle Ownership Notice will be enclosed.");
  if (input.draft.handlerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.draft.handlerEmail)) errors.push("Enter a valid handler email address.");
  return errors;
}
