export const KLUTCH_STATES = ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"] as const;
export type KlutchState = (typeof KLUTCH_STATES)[number];

export const KLUTCH_DOCUMENT_TYPES = [
  "declarations",
  "tnc_denial",
  "carrier_position",
  "cancellation_notice",
  "endorsement",
  "direction_of_pay",
] as const;
export type KlutchDocumentType = (typeof KLUTCH_DOCUMENT_TYPES)[number];

export const KLUTCH_DOCUMENT_LABELS: Record<KlutchDocumentType, string> = {
  declarations: "Policy Declarations",
  tnc_denial: "TNC Coverage Denial",
  carrier_position: "Carrier Coverage Position",
  cancellation_notice: "Policy Cancellation Notice",
  endorsement: "Endorsement KIC-END-002",
  direction_of_pay: "Direction of Pay & Vehicle Ownership Notice",
};

export const KLUTCH_CREATED_NOT_SENT = "CREATED_NOT_SENT" as const;
export const DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE = 35;
export const KLUTCH_FIRST_POLICY_SEQUENCE = 100100;
export const KLUTCH_CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type KlutchPolicyTransactionType = "new" | "renewal" | "correction";

type KlutchCoverageRule = {
  bi: string;
  pd: string;
  pip?: { limit: string; waivable: boolean };
  umRejectable: boolean;
};

/**
 * These limits and elections intentionally match the supplied final Klutch
 * policy-document page. Do not infer or substitute a market's state rule.
 */
export const KLUTCH_COVERAGE_RULES: Record<KlutchState, KlutchCoverageRule> = {
  MD: { bi: "$30,000 / $60,000", pd: "$15,000", pip: { limit: "$2,500", waivable: true }, umRejectable: false },
  GA: { bi: "$25,000 / $50,000", pd: "$25,000", umRejectable: true },
  FL: { bi: "$10,000 / $20,000", pd: "$10,000", pip: { limit: "$10,000", waivable: false }, umRejectable: true },
  IL: { bi: "$25,000 / $50,000", pd: "$20,000", umRejectable: false },
  VA: { bi: "$50,000 / $100,000", pd: "$25,000", umRejectable: false },
  PA: { bi: "$15,000 / $30,000", pd: "$5,000", pip: { limit: "$5,000", waivable: false }, umRejectable: true },
  MA: { bi: "$20,000 / $40,000", pd: "$5,000", pip: { limit: "$8,000", waivable: false }, umRejectable: false },
  TX: { bi: "$30,000 / $60,000", pd: "$25,000", pip: { limit: "$2,500", waivable: true }, umRejectable: true },
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

export function addKlutchTermMonths(effectiveOn: string, months: 6 | 12) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveOn);
  if (!match) return "";
  const [, year, month, day] = match;
  const target = new Date(Date.UTC(Number(year), Number(month) - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(Number(day), lastDay)).padStart(2, "0")}`;
}

export type KlutchTermPlanEntry = {
  termNumber: number;
  transactionType: "new" | "renewal";
  effectiveOn: string;
  expiresOn: string;
};

/**
 * Plans consecutive calendar-date terms through the supplied as-of date. The
 * original term is always term 1; every later term is a renewal under the
 * same policy number. A term beginning on the as-of date is included because
 * coverage starts at 12:01 a.m. on that calendar date.
 */
export function planKlutchTermsThrough(effectiveOn: string, throughOn: string, termMonths: 6 | 12): KlutchTermPlanEntry[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) || !/^\d{4}-\d{2}-\d{2}$/.test(throughOn) || throughOn < effectiveOn) {
    return [];
  }

  const terms: KlutchTermPlanEntry[] = [];
  let termStart = effectiveOn;
  let termNumber = 1;
  while (termStart <= throughOn) {
    const expiresOn = addKlutchTermMonths(termStart, termMonths);
    if (!expiresOn || expiresOn <= termStart) return [];
    terms.push({
      termNumber,
      transactionType: termNumber === 1 ? "new" : "renewal",
      effectiveOn: termStart,
      expiresOn,
    });
    termStart = expiresOn;
    termNumber += 1;
  }
  return terms;
}

/** Whole nearest weeks used by the supplied final Klutch declarations page. */
export function calculateKlutchCoverageWeeks(effectiveOn: string, expiresOn: string) {
  const start = new Date(`${effectiveOn}T00:00:00Z`).getTime();
  const end = new Date(`${expiresOn}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * Server-owned reproduction of the supplied $35/week premium formula. Premium
 * allocation is in integer cents using largest remainder, so coverage rows
 * always add exactly to the policy-period premium.
 */
export function calculateKlutchPremium(input: {
  state: KlutchState;
  effectiveOn: string;
  expiresOn: string;
  pipWaived?: boolean;
  umRejected?: boolean;
  comprehensiveDeductible?: string;
  collisionDeductible?: string;
}): KlutchPremiumCalculation {
  const rule = KLUTCH_COVERAGE_RULES[input.state];
  const coverageWeeks = calculateKlutchCoverageWeeks(input.effectiveOn, input.expiresOn);
  const totalCents = Math.round(DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE * coverageWeeks * 100);
  const pipWaived = Boolean(input.pipWaived && rule.pip?.waivable);
  const umRejected = Boolean(input.umRejected && rule.umRejectable);
  const raw: Array<Omit<KlutchCoverageAllocation, "premium"> & { weight: number; order: number }> = [
    { label: "Bodily Injury Liability", limit: rule.bi, weight: 30, order: 0 },
    { label: "Property Damage Liability", limit: rule.pd, weight: 12, order: 1 },
    ...(rule.pip ? [{ label: "Personal Injury Protection", limit: pipWaived ? "Waived" : rule.pip.limit, weight: pipWaived ? 0 : 8, order: 2 }] : []),
    { label: "Uninsured Motorist", limit: umRejected ? "Rejected" : rule.bi, weight: umRejected ? 0 : 7, order: 3 },
    { label: "Underinsured Motorist", limit: umRejected ? "Rejected" : rule.bi, weight: umRejected ? 0 : 5, order: 4 },
    { label: "UMPD", limit: "Not included", weight: 0, order: 5 },
    { label: "Comprehensive", limit: "Actual Cash Value", deductible: input.comprehensiveDeductible || "$500", weight: 13, order: 6 },
    { label: "Collision", limit: "Actual Cash Value", deductible: input.collisionDeductible || "$500", weight: 25, order: 7 },
  ];
  const active = raw.filter((coverage) => coverage.weight > 0);
  const activeWeight = active.reduce((sum, coverage) => sum + coverage.weight, 0) || 1;
  const bases = active.map((coverage) => {
    const exact = totalCents * coverage.weight / activeWeight;
    return { coverage, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = totalCents - bases.reduce((sum, row) => sum + row.cents, 0);
  [...bases]
    .sort((a, b) => b.remainder - a.remainder || a.coverage.order - b.coverage.order)
    .forEach((row) => {
      if (remaining > 0) {
        row.cents += 1;
        remaining -= 1;
      }
    });
  const allocated = new Map(bases.map((row) => [row.coverage.label, row.cents / 100]));
  return {
    weeklyMembershipFee: DEFAULT_KLUTCH_WEEKLY_MEMBERSHIP_FEE,
    coverageWeeks,
    totalPremium: totalCents / 100,
    coverages: raw.map(({ weight: _weight, order: _order, ...coverage }) => ({ ...coverage, premium: allocated.get(coverage.label) ?? 0 })),
  };
}

export const TNC_PERIODS = {
  "1": "Waiting for a ride request",
  "2": "Travelling to pick up a passenger",
  "3": "Transporting a passenger",
} as const;

export type KlutchPolicyTerms = {
  leaseId: string;
  memberName: string;
  memberNumber: string;
  memberAddress?: string;
  memberStreet?: string;
  memberCity?: string;
  memberState?: KlutchState;
  memberZip?: string;
  memberEmail?: string;
  vehicle: string;
  vin: string;
  effectiveOn: string;
  expiresOn: string;
  state: KlutchState;
  termMonths: 6 | 12;
  transactionType: KlutchPolicyTransactionType;
  coverages: Array<{ label: string; limit: string; deductible?: string; premium: number }>;
  totalPremium: number;
  weeklyMembershipFee?: number;
  coverageWeeks?: number;
  pipWaived?: boolean;
  umRejected?: boolean;
  comprehensiveDeductible?: string;
  collisionDeductible?: string;
  leaseStatus?: "active" | "terminated";
  cancellationDate?: string;
  tncUseNote: string;
};

export function canonicalizeSnapSheetClaim(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeKlutchVin(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatKlutchPolicyNumber(state: KlutchState, sequence: number) {
  return `KIC-${state}-${String(sequence).padStart(6, "0")}`;
}

export function formatKlutchClaimNumber(suffix: string) {
  return `KC-${suffix}`;
}
