/** Plain user-supplied facts only. This contract does not issue or verify insurance. */
export type AcordAutoScope = "any" | "owned" | "scheduled" | "hired" | "nonOwned";
export type AcordLimitBasis = "csl" | "split" | "both";

export interface AcordCertificateData {
  /** ISO YYYY-MM-DD or MM/DD/YYYY. Empty values remain blank. */
  issueDate?: string;
  producerName?: string;
  producerAddressLines?: string[];
  contactName?: string;
  phone?: string;
  fax?: string;
  email?: string;
  /** Named insured/operator and address, printed in supplied order. */
  insuredLines: string[];
  insurerName?: string;
  /** Explicit documented self-insurance; do not invent an insurer or NAIC identifier. */
  selfInsured?: boolean;
  naic?: string;
  certificateNumber?: string;
  revisionNumber?: string;
  policyNumber?: string;
  effectiveDate?: string;
  expirationDate?: string;
  limitBasis: AcordLimitBasis;
  combinedSingleLimit?: string;
  biPerson?: string;
  biAccident?: string;
  propertyDamage?: string;
  /** Mandatory only for 'both'; set solely after actual policy documentation confirms both. */
  bothLimitsConfirmed?: boolean;
  autoScopes: AcordAutoScope[];
  /** True solely when the caller has confirmed the actual policy provision. */
  additionalInsured?: boolean;
  subrogationWaived?: boolean;
  endorsementNotes?: string;
  vehicle?: string;
  vin?: string;
  description?: string;
  holderLines?: string[];
  /** Parent-supplied canonical representative text; takes precedence over name/title. Not a digital signature. */
  authorizedRepresentative?: string;
  representativeName?: string;
  representativeTitle?: string;
}

export interface AcordCertificateRenderOptions {
  /** Defaults to true. Final completeness/authority validation belongs to the calling UI. */
  draft?: boolean;
  /** Adds SAMPLE - NOT VALID FOR PROOF OF INSURANCE to every page. */
  sample?: boolean;
  /** Caller validation details included visibly on a draft continuation. */
  missingDetails?: string[];
  /** Decrypted blank template bytes avoid any network request. Encrypted inputs produce a clean error. */
  templateBytes?: Uint8Array | ArrayBuffer;
  templateUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface AcordCertificatePdfResult {
  bytes: Uint8Array;
  filename: string;
  pageCount: number;
  /** Layout messages only; no field content in warnings. */
  warnings: string[];
}
