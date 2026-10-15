export type CccValuationFields = {
  claimantName: string;
  claimNumber: string;
  dateOfLoss: string;
  vehicle: string;
  vin: string;
  market: string;
  reportReference: string;
  cccAdjuster: string;
  baseVehicleValue: string;
  priorDamage: string;
  adjustedVehicleValue: string;
  salesTax: string;
  taxRateLabel: string;
  salvageDeducted: string;
  cccTotal: string;
};

const WHIP_MARKETS = new Set(["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"]);

function asAmount(value: string | undefined): string {
  if (!value) return "";
  const normalized = value.replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function toIsoDate(value: string | undefined): string {
  if (!value) return "";
  const matched = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!matched) return "";
  return `${matched[3]}-${matched[1].padStart(2, "0")}-${matched[2].padStart(2, "0")}`;
}

function squash(value: string | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function personName(value: string): string {
  const compact = squash(value);
  const comma = compact.match(/^([^,]+),\s*(.+)$/);
  return comma ? `${comma[2]} ${comma[1]}`.trim() : compact;
}

function firstMatch(text: string, pattern: RegExp): string {
  return squash(pattern.exec(text)?.[1]);
}

/**
 * Parses visible CCC ONE Market Valuation report fields without relying on model
 * inference. The adjusted vehicle value is the settlement ACV because CCC has
 * already applied condition/prior-damage adjustments to it.
 */
export function parseCccValuationText(source: string): CccValuationFields | null {
  const text = source.replace(/\r/g, "");
  if (!/CCC\s+(?:ONE[®\s]*)?(?:Market\s+)?Valuation|Market\s+Valuation\s+Summary/i.test(text)) {
    return null;
  }

  const claimantName = personName(firstMatch(text, /\bOwner\s+([A-Za-z][A-Za-z' .-]+,\s*[A-Za-z][A-Za-z' .-]+)/i));
  const claimNumber = firstMatch(text, /\bClaim\s+Reference\s+([A-Za-z0-9-]+)/i);
  const reportReference = firstMatch(text, /\b(?:Report\s+Reference\s+Number|Report\s+Reference)\s+([A-Za-z0-9-]+)/i);
  const dateOfLoss = toIsoDate(firstMatch(text, /\bLoss\s+Incident\s+Date\s+(\d{1,2}\/\d{1,2}\/\d{4})/i));
  const vehicle = squash(firstMatch(text, /\bLoss\s+Vehicle\s+([\s\S]{1,180}?)(?=\bLoss\s+Incident\s+Date\b)/i));
  const vin = firstMatch(text, /\bVIN\s+([A-HJ-NPR-Z0-9]{17})\b/i).replace(/\s/g, "").toUpperCase();
  const cccAdjuster = firstMatch(text, /\bAdjuster\s+([A-Za-z][A-Za-z' .,-]+?)(?=\s+\bOdometer\b|\s*\n)/i);

  const baseVehicleValue = asAmount(firstMatch(text, /\bBase\s+Vehicle\s+Value\s+\$?\s*([0-9,]+\.\d{2})/i));
  const priorDamage = asAmount(firstMatch(text, /\bPrior\s+Damage\*?\s+-\s*\$?\s*([0-9,]+\.\d{2})/i));
  const adjustedVehicleValue = asAmount(firstMatch(text, /\bAdjusted\s+Vehicle\s+Value\s+\$?\s*([0-9,]+\.\d{2})/i));
  const salesTax = asAmount(firstMatch(text, /\bVehicular\s+Tax\s*(?:\([^)]*\))?\s*\+\s*\$?\s*([0-9,]+\.\d{2})/i));
  const taxRateLabel = firstMatch(text, /\bVehicular\s+Tax\s*(\([^)]*\))/i);
  const salvageDeducted = asAmount(firstMatch(text, /\bSALVAGE\s*\/\s*TMU\s*\*?\s*-\s*\$?\s*([0-9,]+\.\d{2})/i));
  const cccTotal = asAmount(firstMatch(text, /(?:^|\n)\s*Total\s+\$?\s*([0-9,]+\.\d{2})/im));

  const zipState = text.match(/\b(MD|VA|PA|FL|IL|GA|MA|TX)\s+\d{5}(?:-\d{4})?\b/i)?.[1]?.toUpperCase() ?? "";
  const market = WHIP_MARKETS.has(zipState) ? zipState : "";
  const acv = adjustedVehicleValue || baseVehicleValue;

  if (!acv && !salesTax && !salvageDeducted) return null;

  return {
    claimantName,
    claimNumber,
    dateOfLoss,
    vehicle,
    vin: /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : "",
    market,
    reportReference,
    cccAdjuster,
    baseVehicleValue,
    priorDamage,
    adjustedVehicleValue: acv,
    salesTax,
    taxRateLabel,
    salvageDeducted,
    cccTotal,
  };
}
