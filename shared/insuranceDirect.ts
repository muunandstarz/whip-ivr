export type InsuranceDirectMode = "lou" | "dv" | "both";

/** Editable starting points only: every placeholder must be replaced with verified facts. */
export const LIABILITY_STATEMENT_EXAMPLES: Array<{ id: string; label: string; text: string; note: string }> = [
  {
    id: "written-acceptance",
    label: "Documented written acceptance",
    text: "[carrier] documented written acceptance of liability on [date] in [source/exhibit]; the stated scope of that acceptance is [facts].",
    note: "Use only when the written carrier response supports the stated acceptance and its scope. Identify and enclose that response; do not expand it to full acceptance.",
  },
  {
    id: "verbal-acceptance",
    label: "Documented verbal acceptance",
    text: "[carrier]'s representative verbally accepted liability on [date], as recorded in [source/exhibit]; the documented scope of that acceptance is [facts].",
    note: "Identify the representative and the contemporaneous call note or other record in the facts. Do not describe a verbal statement as written carrier acceptance.",
  },
  {
    id: "whip-evidence-position",
    label: "Whip evidence-supported position — not carrier acceptance",
    text: "Whip's liability position is supported by [facts], documented in [source/exhibit] dated [date]. This is Whip's evidence-supported position submitted to [carrier], not a statement that [carrier] has accepted liability.",
    note: "Use when the evidence supports Whip's position but the carrier has not accepted liability. Describe the actual evidence without inventing a fault percentage.",
  },
  {
    id: "partial-or-disputed",
    label: "Partial acceptance / disputed damages",
    text: "[carrier]'s response dated [date] in [source/exhibit] documents partial acceptance or disputed damages as follows: [facts]. This demand preserves Whip's position on the unresolved items.",
    note: "Edit to distinguish exactly what was accepted, what remains disputed, and the supporting record. Do not imply agreement on all liability or damages.",
  },
];

export function directDemandItems(mode: InsuranceDirectMode) {
  return { hasLou: mode !== "dv", hasDv: mode !== "lou", title: mode === "both" ? "Loss of Use and Diminished Value" : mode === "lou" ? "Loss of Use" : "Diminished Value" };
}

export function directMoney(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value.replace(/[$,\s]/g, ""));
  const rounded = Math.round(numeric * 100) / 100;
  return Number.isFinite(numeric) && Number.isFinite(rounded) && numeric >= 0 ? rounded : 0;
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

/** The existing LOU calculation: days × effective daily rate. Occupancy is context only. */
export function calculateDirectLou(input: { days: number; dailyRate: number }): { amount: number; gross: number; error: string } {
  if (!Number.isFinite(input.days) || input.days <= 0) {
    return { amount: 0, gross: 0, error: "Enter a positive, finite out-of-service day count." };
  }
  if (!Number.isFinite(input.dailyRate) || input.dailyRate <= 0) {
    return { amount: 0, gross: 0, error: "Enter a positive, finite effective daily rate." };
  }
  const gross = directMoney(input.days * input.dailyRate);
  if (gross <= 0) {
    return { amount: 0, gross: 0, error: "The loss-of-use calculation must produce a positive, finite amount." };
  }
  return { amount: gross, gross, error: "" };
}

export interface InsuranceDirectDraft {
  mode: InsuranceDirectMode;
  letterDate: string;
  insuredName: string;
  repairCompleted: string;
  liabilityStatement: string;
  dvAmount: string;
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
  return { mode: "lou", letterDate: date, insuredName: "", repairCompleted: "", liabilityStatement: "", dvAmount: "", prelossValue: "", postlossValue: "", dvMethod: "", carfaxReported: false, stateAuthority: "", authorityVerified: false, handlerExtension: "", handlerEmail: "claims@drivewhip.com", evidenceConfirmed: false, dopConfirmed: false };
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
  if (/[\[\]{}]/.test(input.draft.liabilityStatement)) errors.push("Replace every square-bracket or brace placeholder in the liability statement with verified claim facts and source/exhibit references, or remove unused placeholders before generating the letter.");
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
    const days = directRepairDays(input.repairStart, input.repairEnd);
    if (days <= 0) errors.push("Enter a valid completed out-of-service period; return date must follow drop-off.");
    if (input.dailyRate <= 0 || !Number.isFinite(input.dailyRate)) errors.push("Enter a positive daily rate.");
    if (input.louError) errors.push(input.louError);
    if (!Number.isFinite(input.louAmount) || input.louAmount <= 0) errors.push("The loss-of-use amount must be positive and finite.");
    else if (days > 0 && input.dailyRate > 0 && Number.isFinite(input.dailyRate) && directMoney(input.louAmount) !== directMoney(days * input.dailyRate)) errors.push("The loss-of-use amount must equal out-of-service days multiplied by the effective daily rate; occupancy is supporting context only.");
    if (input.repairStart && input.dateOfLoss && input.repairStart < input.dateOfLoss) errors.push("Out-of-service start cannot precede the date of loss.");
  }
  if (hasDv) {
    const rawAmount = Number(input.draft.dvAmount.replace(/[$,\s]/g, ""));
    const amount = directMoney(input.draft.dvAmount);
    if (!input.draft.dvAmount.trim() || !Number.isFinite(rawAmount) || rawAmount <= 0 || amount <= 0) errors.push("Enter a positive, finite diminished-value amount manually; no amount is calculated from vehicle values.");
    const preValue = input.draft.prelossValue ?? ""; const postValue = input.draft.postlossValue ?? "";
    if (preValue.trim() || postValue.trim()) {
      const rawPre = Number(preValue.replace(/[$,\s]/g, "")); const rawPost = Number(postValue.replace(/[$,\s]/g, ""));
      const pre = directMoney(preValue); const post = directMoney(postValue);
      if (!preValue.trim() || !postValue.trim() || !Number.isFinite(rawPre) || !Number.isFinite(rawPost) || rawPre < 0 || rawPost < 0 || pre <= post) errors.push("If supplying optional pre-loss or post-repair values, enter both valid values; pre-loss must exceed post-repair.");
      else if (amount > 0 && directMoney(pre - post) !== amount) errors.push("The optional pre-loss minus post-repair values must reconcile to the manually entered diminished-value amount; verify the amount and supporting values.");
    }
    if (!input.draft.dvMethod.trim()) errors.push("Enter the diminished-value method and source reference supporting the manual amount.");
    if (/[\[\]{}]/.test(input.draft.dvMethod)) errors.push("Replace the source-wording placeholders with this appraisal report’s ID/date, method and final-opinion section/page.");
  }
  if (input.draft.stateAuthority.trim() && !input.draft.authorityVerified) errors.push("Confirm that any optional state authority is verified for the loss state, or leave it blank.");
  if (!input.draft.evidenceConfirmed) errors.push("Confirm repairs are complete and all selected damage items have the listed supporting exhibits.");
  if (!input.draft.dopConfirmed) errors.push("Confirm the Direction of Pay and Vehicle Ownership Notice will be enclosed.");
  if (input.draft.handlerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.draft.handlerEmail)) errors.push("Enter a valid handler email address.");
  return errors;
}
