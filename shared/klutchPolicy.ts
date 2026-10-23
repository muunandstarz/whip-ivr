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
