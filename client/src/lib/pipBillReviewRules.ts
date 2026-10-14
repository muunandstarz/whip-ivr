/**
 * Deterministic PIP Bill Review rules.
 *
 * The rate tables and core calculation paths reconcile the owner-provided legacy
 * Whip PIP Bill Review.  The browser UI remains editable before and after review;
 * this module is deliberately side-effect free so every calculation can be tested.
 */
export type PipState = "PA" | "MD" | "FL" | "MA";
export type PipProviderType = "medical" | "chiro" | "therapy" | "imaging" | "hospital" | "other";

export type PipBillLine = {
  id: string;
  provider: string;
  providerType: PipProviderType;
  dos: string;
  pos: string;
  cpt: string;
  modifier: string;
  units: number;
  billed: number;
  dxPointer: string;
};

export type PipReviewLine = PipBillLine & {
  codeName: string | null;
  medicareRate: number | null;
  scheduleCap: number | null;
  allowed: number;
  status: "allowed" | "partial" | "denied";
  reason: string;
  appliedReductions: string[];
};

export type PipReviewFlag = {
  severity: "severe" | "warn" | "info";
  title: string;
  detail: string;
};

export type PipReviewInput = {
  state: PipState;
  locality: string;
  pipLimit: number;
  pipUsed: number;
  dateOfLoss?: string;
  emcStatus: "yes" | "no" | "unknown";
  cobStatus: "none" | "primary";
  lines: PipBillLine[];
};

export type PipReviewResult = {
  lines: PipReviewLine[];
  flags: PipReviewFlag[];
  totalBilled: number;
  totalAllowed: number;
  totalReduced: number;
  pipRemaining: number;
  providerSummaries: Array<{ provider: string; billed: number; allowed: number; lines: number }>;
};

type RateRow = { name: string; [locality: string]: string | number };
type RateTable = Record<string, RateRow>;

const RATES_PA = {
  '98940': { '01': 32.45, '99': 30.10, name: 'Chiro manipulation, 1-2 regions' },
  '98941': { '01': 47.32, '99': 43.95, name: 'Chiro manipulation, 3-4 regions' },
  '98942': { '01': 61.20, '99': 56.80, name: 'Chiro manipulation, 5 regions' },
  '98943': { '01': 26.40, '99': 24.55, name: 'Chiro manipulation, extraspinal' },
  '97010': { '01': 0,     '99': 0,     name: 'Hot/cold packs (bundled)' },
  '97012': { '01': 16.20, '99': 15.05, name: 'Mechanical traction' },
  '97014': { '01': 14.30, '99': 13.30, name: 'Electrical stim, unattended' },
  '97016': { '01': 15.90, '99': 14.80, name: 'Vasopneumatic device' },
  '97018': { '01': 10.40, '99': 9.65,  name: 'Paraffin bath' },
  '97022': { '01': 17.60, '99': 16.35, name: 'Whirlpool' },
  '97024': { '01': 7.20,  '99': 6.70,  name: 'Diathermy' },
  '97026': { '01': 7.85,  '99': 7.30,  name: 'Infrared' },
  '97028': { '01': 9.10,  '99': 8.45,  name: 'Ultraviolet' },
  '97032': { '01': 18.90, '99': 17.55, name: 'Electrical stim, attended (15 min)' },
  '97033': { '01': 28.50, '99': 26.45, name: 'Iontophoresis (15 min)' },
  '97034': { '01': 18.20, '99': 16.90, name: 'Contrast bath (15 min)' },
  '97035': { '01': 14.80, '99': 13.75, name: 'Ultrasound therapy (15 min)' },
  '97036': { '01': 32.10, '99': 29.80, name: 'Hubbard tank (15 min)' },
  '97110': { '01': 32.20, '99': 29.90, name: 'Therapeutic exercise (15 min)' },
  '97112': { '01': 36.40, '99': 33.80, name: 'Neuromuscular reeducation (15 min)' },
  '97113': { '01': 39.85, '99': 37.00, name: 'Aquatic therapy (15 min)' },
  '97116': { '01': 30.10, '99': 27.95, name: 'Gait training (15 min)' },
  '97124': { '01': 28.40, '99': 26.35, name: 'Massage therapy (15 min)' },
  '97140': { '01': 30.50, '99': 28.30, name: 'Manual therapy (15 min)' },
  '97150': { '01': 19.20, '99': 17.85, name: 'Group therapy' },
  '97530': { '01': 39.10, '99': 36.30, name: 'Therapeutic activities (15 min)' },
  '97532': { '01': 30.20, '99': 28.05, name: 'Cognitive skills development (15 min)' },
  '97533': { '01': 33.40, '99': 31.05, name: 'Sensory integration (15 min)' },
  '97535': { '01': 35.80, '99': 33.20, name: 'Self-care/home mgmt (15 min)' },
  '97537': { '01': 35.60, '99': 33.05, name: 'Community/work reint (15 min)' },
  '97542': { '01': 28.90, '99': 26.85, name: 'Wheelchair mgmt (15 min)' },
  '97545': { '01': 78.20, '99': 72.65, name: 'Work hardening, first 2 hrs' },
  '97546': { '01': 38.10, '99': 35.40, name: 'Work hardening, each addl hr' },
  '97597': { '01': 65.40, '99': 60.75, name: 'Wound debridement' },
  '97161': { '01': 88.10, '99': 81.85, name: 'PT eval, low complexity' },
  '97162': { '01': 88.10, '99': 81.85, name: 'PT eval, moderate complexity' },
  '97163': { '01': 88.10, '99': 81.85, name: 'PT eval, high complexity' },
  '97164': { '01': 55.30, '99': 51.40, name: 'PT re-evaluation' },
  '97165': { '01': 91.60, '99': 85.10, name: 'OT eval, low complexity' },
  '97166': { '01': 91.60, '99': 85.10, name: 'OT eval, moderate complexity' },
  '97167': { '01': 91.60, '99': 85.10, name: 'OT eval, high complexity' },
  '97168': { '01': 60.70, '99': 56.40, name: 'OT re-evaluation' },
  '99202': { '01': 71.90,  '99': 66.80,  name: 'Office visit, new pt, low' },
  '99203': { '01': 109.20, '99': 101.45, name: 'Office visit, new pt, mod' },
  '99204': { '01': 162.80, '99': 151.20, name: 'Office visit, new pt, high' },
  '99205': { '01': 215.40, '99': 200.10, name: 'Office visit, new pt, complex' },
  '99211': { '01': 22.95,  '99': 21.30,  name: 'Office visit, est pt, minimal' },
  '99212': { '01': 56.40,  '99': 52.40,  name: 'Office visit, est pt, low' },
  '99213': { '01': 90.40,  '99': 84.00,  name: 'Office visit, est pt, mod' },
  '99214': { '01': 128.10, '99': 119.05, name: 'Office visit, est pt, mod-high' },
  '99215': { '01': 180.20, '99': 167.40, name: 'Office visit, est pt, high' },
  '72020': { '01': 25.10, '99': 23.30, name: 'X-ray spine, single view' },
  '72040': { '01': 38.40, '99': 35.70, name: 'X-ray cervical, 2-3 views' },
  '72050': { '01': 51.20, '99': 47.55, name: 'X-ray cervical, 4-5 views' },
  '72070': { '01': 39.20, '99': 36.40, name: 'X-ray thoracic, 2 views' },
  '72100': { '01': 41.10, '99': 38.20, name: 'X-ray lumbar, 2-3 views' },
  '72110': { '01': 56.40, '99': 52.40, name: 'X-ray lumbar, 4+ views' },
  '72141': { '01': 230.50, '99': 214.10, name: 'MRI cervical w/o contrast' },
  '72148': { '01': 225.80, '99': 209.80, name: 'MRI lumbar w/o contrast' },
  '73221': { '01': 232.10, '99': 215.55, name: 'MRI upper extremity joint w/o contrast' },
  '73721': { '01': 232.10, '99': 215.55, name: 'MRI lower extremity joint w/o contrast' }
};

const RATES_FL = {
  '98940': { 'MIA': 35.50, 'JAX': 32.80, 'REST': 33.20, name: 'Chiro manipulation, 1-2 regions' },
  '98941': { 'MIA': 51.80, 'JAX': 47.95, 'REST': 48.50, name: 'Chiro manipulation, 3-4 regions' },
  '98942': { 'MIA': 67.10, 'JAX': 62.05, 'REST': 62.80, name: 'Chiro manipulation, 5 regions' },
  '98943': { 'MIA': 28.90, 'JAX': 26.75, 'REST': 27.05, name: 'Chiro manipulation, extraspinal' },
  '97010': { 'MIA': 0,     'JAX': 0,     'REST': 0,     name: 'Hot/cold packs (bundled)' },
  '97012': { 'MIA': 17.70, 'JAX': 16.40, 'REST': 16.55, name: 'Mechanical traction' },
  '97014': { 'MIA': 15.65, 'JAX': 14.50, 'REST': 14.65, name: 'Electrical stim, unattended' },
  '97032': { 'MIA': 20.70, 'JAX': 19.15, 'REST': 19.35, name: 'Electrical stim, attended (15 min)' },
  '97035': { 'MIA': 16.20, 'JAX': 15.00, 'REST': 15.15, name: 'Ultrasound therapy (15 min)' },
  '97110': { 'MIA': 35.25, 'JAX': 32.65, 'REST': 33.00, name: 'Therapeutic exercise (15 min)' },
  '97112': { 'MIA': 39.85, 'JAX': 36.90, 'REST': 37.30, name: 'Neuromuscular reeducation (15 min)' },
  '97124': { 'MIA': 31.10, 'JAX': 28.80, 'REST': 29.10, name: 'Massage therapy (15 min)' },
  '97140': { 'MIA': 33.40, 'JAX': 30.95, 'REST': 31.25, name: 'Manual therapy (15 min)' },
  '97530': { 'MIA': 42.80, 'JAX': 39.65, 'REST': 40.05, name: 'Therapeutic activities (15 min)' },
  '97535': { 'MIA': 39.20, 'JAX': 36.30, 'REST': 36.70, name: 'Self-care/home mgmt (15 min)' },
  '97161': { 'MIA': 96.45, 'JAX': 89.35, 'REST': 90.30, name: 'PT eval, low complexity' },
  '97162': { 'MIA': 96.45, 'JAX': 89.35, 'REST': 90.30, name: 'PT eval, moderate complexity' },
  '97163': { 'MIA': 96.45, 'JAX': 89.35, 'REST': 90.30, name: 'PT eval, high complexity' },
  '97164': { 'MIA': 60.55, 'JAX': 56.10, 'REST': 56.70, name: 'PT re-evaluation' },
  '99202': { 'MIA': 78.70,  'JAX': 72.95,  'REST': 73.70,  name: 'Office visit, new pt, low' },
  '99203': { 'MIA': 119.55, 'JAX': 110.80, 'REST': 111.95, name: 'Office visit, new pt, mod' },
  '99204': { 'MIA': 178.30, 'JAX': 165.20, 'REST': 166.95, name: 'Office visit, new pt, high' },
  '99205': { 'MIA': 235.85, 'JAX': 218.55, 'REST': 220.85, name: 'Office visit, new pt, complex' },
  '99213': { 'MIA': 99.00,  'JAX': 91.75,  'REST': 92.70,  name: 'Office visit, est pt, mod' },
  '99214': { 'MIA': 140.30, 'JAX': 130.00, 'REST': 131.40, name: 'Office visit, est pt, mod-high' },
  '99215': { 'MIA': 197.30, 'JAX': 182.85, 'REST': 184.80, name: 'Office visit, est pt, high' },
  '72040': { 'MIA': 42.05, 'JAX': 38.95, 'REST': 39.35, name: 'X-ray cervical, 2-3 views' },
  '72100': { 'MIA': 45.00, 'JAX': 41.70, 'REST': 42.15, name: 'X-ray lumbar, 2-3 views' },
  '72141': { 'MIA': 252.40, 'JAX': 233.85, 'REST': 236.30, name: 'MRI cervical w/o contrast' },
  '72148': { 'MIA': 247.25, 'JAX': 229.10, 'REST': 231.50, name: 'MRI lumbar w/o contrast' }
};

const RATES_MD = {
  '98940': { '01': 33.10, 'REST': 31.15, name: 'Chiro manipulation, 1-2 regions' },
  '98941': { '01': 48.30, 'REST': 45.40, name: 'Chiro manipulation, 3-4 regions' },
  '98942': { '01': 62.50, 'REST': 58.75, name: 'Chiro manipulation, 5 regions' },
  '98943': { '01': 26.95, 'REST': 25.35, name: 'Chiro manipulation, extraspinal' },
  '97010': { '01': 0,     'REST': 0,     name: 'Hot/cold packs (bundled)' },
  '97014': { '01': 14.60, 'REST': 13.75, name: 'Electrical stim, unattended' },
  '97032': { '01': 19.30, 'REST': 18.15, name: 'Electrical stim, attended (15 min)' },
  '97110': { '01': 32.90, 'REST': 30.95, name: 'Therapeutic exercise (15 min)' },
  '97112': { '01': 37.20, 'REST': 35.00, name: 'Neuromuscular reeducation (15 min)' },
  '97124': { '01': 29.00, 'REST': 27.30, name: 'Massage therapy (15 min)' },
  '97140': { '01': 31.15, 'REST': 29.30, name: 'Manual therapy (15 min)' },
  '97530': { '01': 39.95, 'REST': 37.55, name: 'Therapeutic activities (15 min)' },
  '97535': { '01': 36.55, 'REST': 34.40, name: 'Self-care/home mgmt (15 min)' },
  '97161': { '01': 89.95, 'REST': 84.65, name: 'PT eval, low complexity' },
  '97162': { '01': 89.95, 'REST': 84.65, name: 'PT eval, moderate complexity' },
  '97163': { '01': 89.95, 'REST': 84.65, name: 'PT eval, high complexity' },
  '99203': { '01': 111.55, 'REST': 104.95, name: 'Office visit, new pt, mod' },
  '99204': { '01': 166.35, 'REST': 156.50, name: 'Office visit, new pt, high' },
  '99213': { '01': 92.30,  'REST': 86.85,  name: 'Office visit, est pt, mod' },
  '99214': { '01': 130.85, 'REST': 123.10, name: 'Office visit, est pt, mod-high' },
  '72040': { '01': 39.20, 'REST': 36.85, name: 'X-ray cervical, 2-3 views' },
  '72100': { '01': 41.95, 'REST': 39.45, name: 'X-ray lumbar, 2-3 views' },
  '72141': { '01': 235.40, 'REST': 221.45, name: 'MRI cervical w/o contrast' },
  '72148': { '01': 230.65, 'REST': 217.00, name: 'MRI lumbar w/o contrast' }
};

const RATES_MA = {
  '98940': { 'STATE': 38.50, name: 'Chiro manipulation, 1-2 regions' },
  '98941': { 'STATE': 56.20, name: 'Chiro manipulation, 3-4 regions' },
  '98942': { 'STATE': 72.80, name: 'Chiro manipulation, 5 regions' },
  '98943': { 'STATE': 31.40, name: 'Chiro manipulation, extraspinal' },
  '97010': { 'STATE': 0,     name: 'Hot/cold packs (bundled)' },
  '97012': { 'STATE': 19.30, name: 'Mechanical traction' },
  '97014': { 'STATE': 17.00, name: 'Electrical stim, unattended' },
  '97032': { 'STATE': 22.50, name: 'Electrical stim, attended (15 min)' },
  '97035': { 'STATE': 17.60, name: 'Ultrasound therapy (15 min)' },
  '97110': { 'STATE': 38.30, name: 'Therapeutic exercise (15 min)' },
  '97112': { 'STATE': 43.30, name: 'Neuromuscular reeducation (15 min)' },
  '97124': { 'STATE': 33.80, name: 'Massage therapy (15 min)' },
  '97140': { 'STATE': 36.30, name: 'Manual therapy (15 min)' },
  '97530': { 'STATE': 46.50, name: 'Therapeutic activities (15 min)' },
  '97535': { 'STATE': 42.55, name: 'Self-care/home mgmt (15 min)' },
  '97161': { 'STATE': 104.85, name: 'PT eval, low complexity' },
  '97162': { 'STATE': 104.85, name: 'PT eval, moderate complexity' },
  '97163': { 'STATE': 104.85, name: 'PT eval, high complexity' },
  '99203': { 'STATE': 130.00, name: 'Office visit, new pt, mod' },
  '99204': { 'STATE': 193.85, name: 'Office visit, new pt, high' },
  '99213': { 'STATE': 107.55, name: 'Office visit, est pt, mod' },
  '99214': { 'STATE': 152.45, name: 'Office visit, est pt, mod-high' },
  '72040': { 'STATE': 45.65, name: 'X-ray cervical, 2-3 views' },
  '72100': { 'STATE': 48.85, name: 'X-ray lumbar, 2-3 views' },
  '72141': { 'STATE': 274.30, name: 'MRI cervical w/o contrast' },
  '72148': { 'STATE': 268.80, name: 'MRI lumbar w/o contrast' }
};

export const PIP_STATE_CONFIG: Record<PipState, {
  name: string;
  statute: string;
  statuteShort: string;
  defaultLimit: number;
  noEmcLimit?: number;
  localities: Array<{ value: string; label: string }>;
  notice: string;
  letterClause: string;
  paymentInFullClause: string;
  paymentDays: number;
  interestRate?: number;
  chargeMethod: "cap" | "reasonable" | "fl_hybrid" | "wc_schedule";
  multiplier?: number;
  paymentMultiplier?: number;
  chiroUC?: number;
  reasonableThreshold?: number;
  cobThreshold?: number;
  rates: RateTable;
}> = {
  PA: {
    name: "Pennsylvania", statute: "75 Pa.C.S. § 1797", statuteShort: "Act 6", defaultLimit: 5000,
    localities: [{ value: "01", label: "01 — Philadelphia / Metro" }, { value: "99", label: "99 — Rest of PA (Pittsburgh, etc.)" }],
    notice: "PA pays at 110% of Medicare. Chiropractic is capped at the lesser of 110% Medicare or 80% usual and customary. 30-day payment / 12% interest. PRO required for R&N disputes.",
    letterClause: "Payment has been determined in accordance with 75 Pa.C.S. § 1797 (Pennsylvania Motor Vehicle Financial Responsibility Law) and applicable Act 6 fee schedule limitations.",
    paymentInFullClause: "Pursuant to 75 Pa.C.S. § 1797(a), payment at the Act 6 schedule rate constitutes payment in full. Your office is prohibited from balance billing the patient for any amount above the Act 6 allowed amount.",
    paymentDays: 30, interestRate: 0.12, chargeMethod: "cap", multiplier: 1.1, chiroUC: 0.8, rates: RATES_PA,
  },
  MD: {
    name: "Maryland", statute: "Md. Code Ann., Ins. § 19-505", statuteShort: "MD PIP", defaultLimit: 2500,
    localities: [{ value: "01", label: "01 — Baltimore Metro" }, { value: "REST", label: "REST — Rest of MD" }],
    notice: "MD has no fee schedule. Bills are paid at billed amount if reasonable and necessary under § 19-505. Charges over 250% of the Medicare benchmark are surfaced for review.",
    letterClause: "Payment has been determined in accordance with Md. Code Ann., Ins. § 19-505 (Maryland Personal Injury Protection statute) following review of reasonableness and medical necessity.",
    paymentInFullClause: "This payment represents the reasonable amount due for services rendered. Whip reserves all rights regarding any disputed charges.",
    paymentDays: 30, chargeMethod: "reasonable", reasonableThreshold: 2.5, rates: RATES_MD,
  },
  FL: {
    name: "Florida", statute: "Fla. Stat. § 627.736", statuteShort: "FL No-Fault", defaultLimit: 10000, noEmcLimit: 2500,
    localities: [{ value: "MIA", label: "MIA — Miami / South Florida" }, { value: "JAX", label: "JAX — North Florida (Jacksonville, etc.)" }, { value: "REST", label: "REST — Rest of Florida" }],
    notice: "FL pays 80% of the lesser of billed charges or 200% Medicare. EMC determination is required for the full $10,000 PIP limit; without EMC, use a $2,500 limit. Initial treatment must occur within 14 days.",
    letterClause: "Payment has been determined in accordance with Fla. Stat. § 627.736 (Florida Motor Vehicle No-Fault Law) and the schedule of maximum charges therein. PIP coverage pays 80% of the allowable amount.",
    paymentInFullClause: "Pursuant to Fla. Stat. § 627.736(5)(a), this payment satisfies Whip's obligation for the services billed. Any remaining balance up to 100% of allowable charges is the responsibility of the insured (20% PIP coinsurance) unless covered by other applicable insurance.",
    paymentDays: 30, interestRate: 0.1, chargeMethod: "fl_hybrid", multiplier: 2, paymentMultiplier: 0.8, rates: RATES_FL,
  },
  MA: {
    name: "Massachusetts", statute: "M.G.L. c. 90 § 34M", statuteShort: "MA PIP", defaultLimit: 8000,
    localities: [{ value: "STATE", label: "STATE — Massachusetts (statewide WC rate)" }],
    notice: "MA PIP uses the Workers' Compensation Fee Schedule (114.3 CMR 40.00). The first $2,000 is paid without health-insurance coordination; where health insurance is primary, PIP is secondary above that threshold.",
    letterClause: "Payment has been determined in accordance with M.G.L. c. 90 § 34M (Massachusetts Personal Injury Protection statute) and the Workers' Compensation Fee Schedule at 114.3 CMR 40.00.",
    paymentInFullClause: "This payment satisfies Whip's obligation under PIP coverage. Per M.G.L. c. 152 § 13, providers may not bill the patient for amounts in excess of the fee schedule rates.",
    paymentDays: 30, chargeMethod: "wc_schedule", multiplier: 1, cobThreshold: 2000, rates: RATES_MA,
  },
};

const NCCI_BUNDLES = [
  { primary: "97140", bundled: "98940", modifier: "59", note: "Manual therapy bundled with chiro manipulation; modifier 59 is required for separate payment" },
  { primary: "97140", bundled: "98941", modifier: "59", note: "Manual therapy bundled with chiro manipulation; modifier 59 is required for separate payment" },
  { primary: "97140", bundled: "98942", modifier: "59", note: "Manual therapy bundled with chiro manipulation; modifier 59 is required for separate payment" },
  { primary: "97530", bundled: "97110", modifier: "59", note: "Therapeutic activities bundled with therapeutic exercise; modifier 59 is required for separate payment" },
  { primary: "97140", bundled: "97124", modifier: "59", note: "Manual therapy and massage cannot be billed together on the same day without support for separate payment" },
] as const;

const MUE_LIMITS: Record<string, number> = {
  "97110": 4, "97112": 4, "97140": 4, "97530": 4, "97535": 4,
  "97014": 1, "97032": 4, "97035": 4, "98940": 1, "98941": 1, "98942": 1,
};

const cents = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
export const money = (value: number) => `$${cents(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const parsePipMoney = (value: string | number | null | undefined) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;

export function defaultPipLimit(state: PipState, emcStatus: PipReviewInput["emcStatus"] = "yes") {
  const config = PIP_STATE_CONFIG[state];
  return state === "FL" && emcStatus === "no" ? config.noEmcLimit ?? config.defaultLimit : config.defaultLimit;
}

function reviewOne(line: PipBillLine, input: PipReviewInput): PipReviewLine {
  const config = PIP_STATE_CONFIG[input.state];
  const cpt = line.cpt.trim().toUpperCase();
  const rateRow = config.rates[cpt];
  const candidateRate = rateRow?.[input.locality];
  const medicareRate = typeof candidateRate === "number" ? candidateRate : null;
  const codeName = rateRow?.name ?? null;
  const billed = cents(Math.max(0, line.billed));
  const units = Math.max(1, Math.floor(line.units || 1));
  const base: PipReviewLine = {
    ...line, cpt, units, billed, codeName, medicareRate, scheduleCap: null,
    allowed: 0, status: "denied", reason: "", appliedReductions: [],
  };

  if (medicareRate === null && config.chargeMethod !== "reasonable") {
    return { ...base, reason: `CPT ${cpt || "[blank]"} is not in the ${config.name} reference schedule. Manual review is required.` };
  }
  if (medicareRate === 0) {
    return { ...base, scheduleCap: 0, reason: `CPT ${cpt} (${codeName ?? ""}) is bundled and not separately payable.`, appliedReductions: ["Bundled service"] };
  }
  if (config.chargeMethod === "cap") {
    const medicareCap = (medicareRate ?? 0) * (config.multiplier ?? 1) * units;
    const chiroCap = line.providerType === "chiro" ? (billed / units) * (config.chiroUC ?? 1) * units : medicareCap;
    const cap = cents(Math.min(medicareCap, chiroCap));
    const allowed = cents(Math.min(billed, cap));
    return { ...base, scheduleCap: cap, allowed, status: allowed === billed ? "allowed" : "partial",
      reason: allowed === billed
        ? `Within ${config.statuteShort} cap (${((config.multiplier ?? 1) * 100).toFixed(0)}% Medicare × ${units} unit${units === 1 ? "" : "s"}).`
        : `Reduced to ${config.statuteShort} cap (${((config.multiplier ?? 1) * 100).toFixed(0)}% × Medicare ${money(medicareRate ?? 0)}/unit × ${units} unit${units === 1 ? "" : "s"}).`,
      appliedReductions: allowed === billed ? [] : ["Fee schedule cap"],
    };
  }
  if (config.chargeMethod === "fl_hybrid") {
    const schedule = (medicareRate ?? 0) * (config.multiplier ?? 1) * units;
    const allowed = cents(Math.min(billed, schedule) * (config.paymentMultiplier ?? 1));
    return { ...base, scheduleCap: cents(schedule), allowed, status: "partial",
      reason: billed <= schedule
        ? `FL PIP pays 80% of billed charges within the 200% Medicare schedule; 20% coinsurance applies.`
        : `FL PIP pays 80% of the 200% Medicare schedule (${money(schedule)}); 20% coinsurance applies.`,
      appliedReductions: ["Florida 80% PIP payment"],
    };
  }
  if (config.chargeMethod === "wc_schedule") {
    const cap = cents((medicareRate ?? 0) * units);
    const allowed = cents(Math.min(billed, cap));
    return { ...base, scheduleCap: cap, allowed, status: allowed === billed ? "allowed" : "partial",
      reason: allowed === billed
        ? `Within MA Workers' Compensation Fee Schedule (114.3 CMR 40.00) × ${units} unit${units === 1 ? "" : "s"}.`
        : `Reduced to MA Workers' Compensation Fee Schedule (${money(medicareRate ?? 0)}/unit × ${units} unit${units === 1 ? "" : "s"}).`,
      appliedReductions: allowed === billed ? [] : ["MA WC fee schedule"],
    };
  }
  const threshold = (medicareRate ?? 0) * (config.reasonableThreshold ?? 1) * units;
  if (medicareRate !== null && billed > threshold) {
    const allowed = cents(threshold);
    return { ...base, scheduleCap: allowed, allowed, status: "partial",
      reason: `Reduced as potentially unreasonable: billed ${money(billed)} exceeds ${((config.reasonableThreshold ?? 1) * 100).toFixed(0)}% of Medicare benchmark (${money(threshold)}). Subject to manual review under § 19-505.`,
      appliedReductions: ["MD reasonableness benchmark"],
    };
  }
  return { ...base, scheduleCap: billed, allowed: billed, status: "allowed",
    reason: medicareRate !== null
      ? `Paid as billed within the ${(config.reasonableThreshold ?? 1) * 100}% Medicare reasonableness benchmark. MD has no fee schedule.`
      : "Paid as billed. MD has no fee schedule; payment remains subject to reasonableness review.",
    appliedReductions: [],
  };
}

function applyNcciEdits(lines: PipReviewLine[]) {
  const byProviderAndDate = new Map<string, PipReviewLine[]>();
  lines.forEach((line) => {
    const key = `${line.provider.trim().toLowerCase()}|${line.dos}`;
    byProviderAndDate.set(key, [...(byProviderAndDate.get(key) ?? []), line]);
  });
  for (const sameDay of Array.from(byProviderAndDate.values())) {
    const codes = new Set(sameDay.map((line) => line.cpt));
    for (const edit of NCCI_BUNDLES) {
      if (!codes.has(edit.primary) || !codes.has(edit.bundled)) continue;
      for (const line of sameDay.filter((candidate) => candidate.cpt === edit.bundled)) {
        if (line.modifier.toUpperCase().includes(edit.modifier)) continue;
        line.allowed = 0;
        line.status = "denied";
        line.reason = edit.note;
        line.appliedReductions.push("NCCI edit");
      }
    }
  }
}

function applyMueEdits(lines: PipReviewLine[]) {
  const grouped = new Map<string, PipReviewLine[]>();
  lines.forEach((line) => {
    const key = `${line.provider.trim().toLowerCase()}|${line.dos}|${line.cpt}`;
    grouped.set(key, [...(grouped.get(key) ?? []), line]);
  });
  for (const sameCode of Array.from(grouped.values())) {
    const limit = MUE_LIMITS[sameCode[0]?.cpt ?? ""];
    const totalUnits = sameCode.reduce((total, line) => total + line.units, 0);
    if (!limit || totalUnits <= limit) continue;
    const allowedRatio = limit / totalUnits;
    sameCode.forEach((line) => {
      if (line.status === "denied") return;
      line.allowed = cents(line.allowed * allowedRatio);
      line.status = "partial";
      line.reason = `${line.reason} MUE: ${line.cpt} max ${limit} units/day; reduced for excess units billed.`.trim();
      line.appliedReductions.push(`MUE max ${limit} units/day`);
    });
  }
}

function applyPipLimitAndCoordination(lines: PipReviewLine[], input: PipReviewInput) {
  const config = PIP_STATE_CONFIG[input.state];
  let remaining = Math.max(0, cents(input.pipLimit - input.pipUsed));
  let maPrimaryRemaining = input.state === "MA" && input.cobStatus === "primary"
    ? Math.max(0, cents((config.cobThreshold ?? 2000) - input.pipUsed))
    : Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.status === "denied" || line.allowed <= 0) continue;
    const payableLimit = Math.min(remaining, maPrimaryRemaining);
    if (payableLimit <= 0) {
      line.allowed = 0;
      line.status = "denied";
      const coordination = input.state === "MA" && input.cobStatus === "primary"
        ? "MA coordination: health insurance is primary above the first $2,000 PIP layer."
        : `PIP limit exhausted (${money(input.pipLimit)} cap reached).`;
      line.reason = `${line.reason} ${coordination}`.trim();
      line.appliedReductions.push(input.state === "MA" && input.cobStatus === "primary" ? "MA health-insurance coordination" : "PIP exhausted");
      continue;
    }
    if (line.allowed > payableLimit) {
      const priorAllowed = line.allowed;
      line.allowed = cents(payableLimit);
      line.status = "partial";
      const coordination = input.state === "MA" && input.cobStatus === "primary" && maPrimaryRemaining < remaining
        ? `MA coordination: only ${money(line.allowed)} remains in the primary PIP layer before health insurance becomes primary.`
        : `PIP partial: only ${money(line.allowed)} remains of the ${money(input.pipLimit)} limit (would otherwise allow ${money(priorAllowed)}).`;
      line.reason = `${line.reason} ${coordination}`.trim();
      line.appliedReductions.push(input.state === "MA" && input.cobStatus === "primary" ? "MA health-insurance coordination" : "PIP partial");
    }
    remaining = cents(remaining - line.allowed);
    if (Number.isFinite(maPrimaryRemaining)) maPrimaryRemaining = cents(maPrimaryRemaining - line.allowed);
  }
  return remaining;
}

function makeFlags(lines: PipReviewLine[], input: PipReviewInput, remaining: number): PipReviewFlag[] {
  const config = PIP_STATE_CONFIG[input.state];
  const flags: PipReviewFlag[] = [];
  const validDates = lines.map((line) => line.dos).filter(Boolean).sort();
  if (input.dateOfLoss && validDates[0]) {
    const firstTreatment = new Date(`${validDates[0]}T00:00:00`);
    const loss = new Date(`${input.dateOfLoss}T00:00:00`);
    const gapDays = Math.round((firstTreatment.getTime() - loss.getTime()) / 86_400_000);
    if (input.state === "FL" && gapDays > 14) flags.push({ severity: "severe", title: `FL 14-day rule: ${gapDays} days from DOL to first treatment`, detail: `DOL ${input.dateOfLoss}; first DOS ${validDates[0]}. Initial treatment must be received within 14 days under Fla. Stat. § 627.736(1)(a). Verify eligibility before payment.` });
    else if (gapDays > 30) flags.push({ severity: gapDays > 60 ? "severe" : "warn", title: `Treatment gap: ${gapDays} days from DOL to first treatment`, detail: `DOL ${input.dateOfLoss}; first DOS ${validDates[0]}. Evaluate causation and medical necessity under ${config.statute}.` });
  }
  if (input.state === "FL" && input.emcStatus !== "yes") flags.push({ severity: "warn", title: input.emcStatus === "no" ? "FL: no EMC — PIP limited to $2,500" : "FL: EMC determination pending", detail: input.emcStatus === "no" ? "Without a qualifying EMC determination, Florida PIP is limited to $2,500. Verify EMC documentation before exceeding that amount." : "Pending EMC determination, reserve to the $2,500 limit and request supporting documentation." });
  if (input.state === "MA" && input.cobStatus === "primary") flags.push({ severity: "warn", title: "MA coordination: health insurance primary above $2,000", detail: "The review applies the first $2,000 PIP layer. Tender any balance above that layer to health insurance first, subject to the claim facts and policy terms." });
  if (input.state === "MD") {
    const unreasonable = lines.filter((line) => line.appliedReductions.includes("MD reasonableness benchmark")).length;
    if (unreasonable) flags.push({ severity: "warn", title: `MD reasonableness: ${unreasonable} line${unreasonable === 1 ? "" : "s"} flagged`, detail: "Charges exceeded the 250% Medicare benchmark. Maryland has no fixed fee schedule; document the reasonableness basis for any reduction." });
  }
  const unitsByDate = new Map<string, number>();
  lines.forEach((line) => unitsByDate.set(line.dos, (unitsByDate.get(line.dos) ?? 0) + line.units));
  unitsByDate.forEach((units, dos) => { if (units >= 12) flags.push({ severity: "warn", title: `High unit volume on ${dos}: ${units} units`, detail: `Reasonableness and necessity should be reviewed under ${config.statute}.` }); });
  const billed = lines.reduce((total, line) => total + line.billed, 0);
  const allowed = lines.reduce((total, line) => total + line.allowed, 0);
  if (billed && (billed - allowed) / billed > 0.5) flags.push({ severity: "info", title: `Significant reduction: ${(((billed - allowed) / billed) * 100).toFixed(0)}% off billed`, detail: `Document the review rationale. State-specific balance-billing and coordination rules continue to apply.` });
  if (remaining <= 0 && allowed < billed) flags.unshift({ severity: "severe", title: "PIP limit exhausted or fully allocated", detail: `The current review uses the remaining available PIP. Confirm all prior payments and coverage before issuing payment or an exhaustion notice.` });
  return flags;
}

export function reviewPipBills(input: PipReviewInput): PipReviewResult {
  const cleanLines = input.lines.filter((line) => line.cpt.trim() || line.billed > 0);
  const lines = cleanLines.map((line) => reviewOne(line, input));
  applyNcciEdits(lines);
  applyMueEdits(lines);
  const pipRemaining = applyPipLimitAndCoordination(lines, input);
  const totalBilled = cents(lines.reduce((total, line) => total + line.billed, 0));
  const totalAllowed = cents(lines.reduce((total, line) => total + line.allowed, 0));
  const byProvider = new Map<string, { provider: string; billed: number; allowed: number; lines: number }>();
  lines.forEach((line) => {
    const provider = line.provider.trim() || "Unknown Provider";
    const summary = byProvider.get(provider) ?? { provider, billed: 0, allowed: 0, lines: 0 };
    summary.billed = cents(summary.billed + line.billed);
    summary.allowed = cents(summary.allowed + line.allowed);
    summary.lines += 1;
    byProvider.set(provider, summary);
  });
  return { lines, flags: makeFlags(lines, input, pipRemaining), totalBilled, totalAllowed, totalReduced: cents(totalBilled - totalAllowed), pipRemaining, providerSummaries: Array.from(byProvider.values()) };
}
