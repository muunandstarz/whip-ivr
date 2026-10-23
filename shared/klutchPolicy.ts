export const KLUTCH_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"] as const;
export type KlutchState = (typeof KLUTCH_STATES)[number];

export const KLUTCH_DOCUMENT_TYPES = [
  "declarations",
  "tnc_denial",
  "carrier_position",
  "cancellation_notice",
  "endorsement",
] as const;
export type KlutchDocumentType = (typeof KLUTCH_DOCUMENT_TYPES)[number];

export const KLUTCH_DOCUMENT_LABELS: Record<KlutchDocumentType, string> = {
  declarations: "Policy Declarations",
  tnc_denial: "TNC Coverage Denial",
  carrier_position: "Carrier Coverage Position",
  cancellation_notice: "Policy Cancellation Notice",
  endorsement: "Endorsement KIC-END-002",
};

export const KLUTCH_CREATED_NOT_SENT = "CREATED_NOT_SENT" as const;

export const DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE = 35;

type KlutchCoverageRule = {
  bi: string;
  pd: string;
  pip?: string;
  umRejectable?: boolean;
};

export const KLUTCH_COVERAGE_RULES: Record<KlutchState, KlutchCoverageRule> = {
  MD: { bi: "$30,000 / $60,000", pd: "$15,000", pip: "$2,500" },
  VA: { bi: "$25,000 / $50,000", pd: "$20,000", umRejectable: true },
  PA: { bi: "$15,000 / $30,000", pd: "$5,000", pip: "$5,000" },
  FL: { bi: "$10,000 / $20,000", pd: "$10,000", pip: "$10,000" },
  IL: { bi: "$25,000 / $50,000", pd: "$20,000", umRejectable: true },
  GA: { bi: "$25,000 / $50,000", pd: "$25,000", umRejectable: true },
  MA: { bi: "$20,000 / $40,000", pd: "$5,000", pip: "$8,000" },
  TX: { bi: "$30,000 / $60,000", pd: "$25,000", umRejectable: true },
};

export type KlutchCoverageAllocation = {
  label: string;
  limit: string;
  deductible?: string;
  premium: number;
};

export type KlutchPremiumCalculation = {
  weeklyMembershipFee: number;
  coverageWeeks: number;
  totalPremium: number;
  coverages: KlutchCoverageAllocation[];
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Uses the prior Klutch declaration's policy-period convention: whole coverage
 * weeks are the nearest number of seven-day intervals between the term dates.
 * A standard 12-month term is therefore 52 weeks (including leap-year terms).
 */
export function calculateKlutchCoverageWeeks(effectiveOn: string, expiresOn: string) {
  const start = new Date(`${effectiveOn}T00:00:00Z`).getTime();
  const end = new Date(`${expiresOn}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * Reproduces the prior declaration allocation formula: BI 30, PD 12,
 * Collision 25, Comprehensive 13, PIP 8, UM 7, and UIM 5. Weights for
 * unavailable or rejected coverages are removed and the remaining elected
 * coverages receive their proportional share of the membership-fee premium.
 */
export function calculateKlutchPremium(input: {
  state: KlutchState;
  effectiveOn: string;
  expiresOn: string;
  weeklyMembershipFee?: number;
  pipWaived?: boolean;
  umRejected?: boolean;
}): KlutchPremiumCalculation {
  const rule = KLUTCH_COVERAGE_RULES[input.state];
  const weeklyMembershipFee = Number.isFinite(input.weeklyMembershipFee)
    ? Math.max(0, Number(input.weeklyMembershipFee))
    : DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE;
  const coverageWeeks = calculateKlutchCoverageWeeks(input.effectiveOn, input.expiresOn);
  const totalPremium = roundCurrency(weeklyMembershipFee * coverageWeeks);
  const pipWaived = Boolean(input.pipWaived && input.state === "MD" && rule.pip);
  const umRejected = Boolean(input.umRejected && rule.umRejectable);
  const raw: Array<Omit<KlutchCoverageAllocation, "premium"> & { weight: number }> = [
    { label: "Bodily Injury Liability", limit: rule.bi, weight: 30 },
    { label: "Property Damage Liability", limit: rule.pd, weight: 12 },
    { label: "Personal Injury Protection", limit: rule.pip ? (pipWaived ? "Waived" : rule.pip) : "Not included", weight: rule.pip && !pipWaived ? 8 : 0 },
    { label: "Uninsured Motorist", limit: umRejected ? "Rejected" : rule.bi, weight: umRejected ? 0 : 7 },
    { label: "Underinsured Motorist", limit: umRejected ? "Rejected" : rule.bi, weight: umRejected ? 0 : 5 },
    { label: "UMPD", limit: "Not included", weight: 0 },
    { label: "Collision", limit: "Actual Cash Value", deductible: "$500", weight: 25 },
    { label: "Comprehensive", limit: "Actual Cash Value", deductible: "$500", weight: 13 },
  ];
  const activeWeight = raw.reduce((total, coverage) => total + coverage.weight, 0) || 1;
  const active = raw.filter((coverage) => coverage.weight > 0);
  let allocated = 0;
  const coverages = raw.map((coverage) => {
    let premium = 0;
    if (coverage.weight > 0) {
      premium = coverage === active[active.length - 1]
        ? roundCurrency(totalPremium - allocated)
        : roundCurrency(totalPremium * coverage.weight / activeWeight);
      allocated = roundCurrency(allocated + premium);
    }
    return { label: coverage.label, limit: coverage.limit, deductible: coverage.deductible, premium };
  });
  return { weeklyMembershipFee, coverageWeeks, totalPremium, coverages };
}

export const TNC_PERIODS = {
  "1": "Waiting for a ride request",
  "2": "Travelling to pick up a passenger",
  "3": "Transporting a passenger",
} as const;

export type KlutchPolicyTerms = {
  leaseId: string;
  memberName: string;
  memberAddress?: string;
  memberStreet?: string;
  memberCity?: string;
  memberState?: KlutchState;
  memberZip?: string;
  memberEmail?: string;
  vehicle: string;
  vin?: string;
  effectiveOn: string;
  expiresOn: string;
  state: KlutchState;
  coverages: Array<{ label: string; limit: string; deductible?: string; premium: number }>;
  totalPremium: number;
  weeklyMembershipFee?: number;
  coverageWeeks?: number;
  pipWaived?: boolean;
  umRejected?: boolean;
  tncUseNote: string;
};

export function canonicalizeSnapSheetClaim(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function formatKlutchPolicyNumber(state: KlutchState, sequence: number) {
  return `KIC-${state}-${String(sequence).padStart(6, "0")}`;
}

export function formatKlutchClaimNumber(sequence: number) {
  return `KC-${String(sequence).padStart(6, "0")}`;
}
