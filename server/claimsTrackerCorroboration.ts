import mysql from "mysql2/promise";
import { refreshGmailToken } from "./mail/ingestGmail";
import type { ThreadAnalysis } from "./lossIntakeDomain";

export const CLAIMS_TRACKER_SPREADSHEET_ID = "1kh3QUnUBYolTmffRCnO1rGYEIEkSvm8ltLrn_Y0ua8A";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TRACKER_SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";

type SheetRows = string[][];
export type TrackerIndex = {
  available: boolean;
  filedVins: Set<string>;
  unfiledVins: Set<string>;
  claimByVin: Map<string, string>;
  warning?: string;
};

let cache: { expiresAt: number; value: TrackerIndex } | null = null;

function normalizeVin(value: string | null | undefined) {
  const digits = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return digits.length >= 6 ? digits.slice(-6) : "";
}

function isFiledValue(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return Boolean(normalized) && normalized !== "false" && normalized !== "no" && normalized !== "not on snapsheet" && normalized !== "---";
}

function formattedClaimId(value: string | null | undefined) {
  const candidate = (value ?? "").trim();
  return /(?:[A-Z]{2,4}|MD|GA|IL|MA)-\d+-\d{6}-\d+/i.test(candidate) ? candidate : null;
}

export function buildClaimsTrackerIndex(input: {
  rawData?: SheetRows;
  liabilityReview?: SheetRows;
  pendingIntakes?: SheetRows;
}): TrackerIndex {
  const filedVins = new Set<string>();
  const unfiledVins = new Set<string>();
  const claimByVin = new Map<string, string>();
  const addFiled = (vinSource: string | null | undefined, claimSource?: string | null) => {
    const vin = normalizeVin(vinSource);
    if (!vin) return;
    filedVins.add(vin);
    const claim = formattedClaimId(claimSource);
    if (claim) claimByVin.set(vin, claim);
  };

  // Raw Data from SS': Claim Number (A), LAST 6 (B). Any row confirms a filed claim.
  for (const row of input.rawData?.slice(1) ?? []) addFiled(row[1], row[0]);

  // Liability Review: B=SNAPSHEET CLAIM #, C=last-six/claim field. "Not on Snapsheet" is a lagging signal.
  for (const row of input.liabilityReview?.slice(1) ?? []) {
    const vin = normalizeVin(row[2]);
    if (!vin) continue;
    if (isFiledValue(row[1])) addFiled(vin, row[1]);
    else unfiledVins.add(vin);
  }

  // Pending Intakes: D=VIN, Q=Added to Snapsheet.
  for (const row of input.pendingIntakes?.slice(1) ?? []) {
    const vin = normalizeVin(row[3]);
    if (!vin) continue;
    if (isFiledValue(row[16])) addFiled(vin);
    else unfiledVins.add(vin);
  }
  return { available: true, filedVins, unfiledVins, claimByVin };
}

export function applyClaimsTrackerCorroboration(analysis: ThreadAnalysis, index: TrackerIndex): ThreadAnalysis {
  if (!index.available) {
    return {
      ...analysis,
      filingEvidence: `${analysis.filingEvidence} Claims Tracker corroboration unavailable: ${index.warning ?? "authorization is not connected."}`,
      dataWarnings: [...analysis.dataWarnings, "Claims Tracker corroboration unavailable; Slack thread evidence remains authoritative."],
    };
  }
  const vin = normalizeVin(analysis.duplicateGroupKey?.split("|").at(-1));
  if (!vin) return analysis;
  const trackerFiled = index.filedVins.has(vin);
  const trackerUnfiled = index.unfiledVins.has(vin) && !trackerFiled;
  const trackerClaim = index.claimByVin.get(vin);
  const evidence = trackerFiled
    ? ` Claims Tracker corroborates a filed claim${trackerClaim ? ` (${trackerClaim})` : ""} for VIN ${vin}.`
    : trackerUnfiled
      ? ` Claims Tracker’s hand-maintained sources indicate no filed claim for VIN ${vin}.`
      : ` Claims Tracker has no current corroborating row for VIN ${vin}; absence is not proof of non-filing.`;

  // Slack has precedence: preserve its state and flag any tracker disagreement for human review.
  const disagreement = (analysis.filingState === "filed" && trackerUnfiled) || (analysis.filingState === "unfiled" && trackerFiled);
  return {
    ...analysis,
    claimId: analysis.claimId ?? trackerClaim ?? null,
    filingEvidence: `${analysis.filingEvidence}${evidence}`,
    dataWarnings: disagreement
      ? [...analysis.dataWarnings, "Slack filing evidence and Claims Tracker disagree; Slack remains authoritative and a processor must confirm before filing action."]
      : analysis.dataWarnings,
  };
}

async function getClaimsTrackerToken() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[row]] = await conn.execute<any[]>("SELECT value FROM mail_settings WHERE `key` = 'claims_tracker_refresh_token'");
    if (!row?.value) throw new Error("Claims Tracker is not connected. Authorize read-only Google Sheets access in Loss Intake settings.");
    return refreshGmailToken(row.value);
  } finally {
    await conn.end();
  }
}

async function readRange(token: string, range: string): Promise<SheetRows> {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(`${SHEETS_BASE}/${CLAIMS_TRACKER_SPREADSHEET_ID}/values/${encodedRange}?majorDimension=ROWS`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Claims Tracker read failed (${response.status}).`);
  const payload = await response.json() as { values?: SheetRows };
  return payload.values ?? [];
}

export async function getClaimsTrackerIndex(): Promise<TrackerIndex> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    const token = await getClaimsTrackerToken();
    const [rawData, liabilityReview, pendingIntakes] = await Promise.all([
      readRange(token, "Raw Data from SS'!A:B"),
      readRange(token, "Liability Review!A:U"),
      readRange(token, "Pending Intakes!A:Q"),
    ]);
    const value = buildClaimsTrackerIndex({ rawData, liabilityReview, pendingIntakes });
    cache = { value, expiresAt: Date.now() + 5 * 60_000 };
    return value;
  } catch (error) {
    const value: TrackerIndex = { available: false, filedVins: new Set(), unfiledVins: new Set(), claimByVin: new Map(), warning: error instanceof Error ? error.message : String(error) };
    cache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }
}

export function buildClaimsTrackerOAuthUrl(redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: TRACKER_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: "claims-tracker-readonly",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeClaimsTrackerCode(code: string, redirectUri: string): Promise<{ refresh_token?: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GMAIL_CLIENT_ID ?? "", client_secret: process.env.GMAIL_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const payload = await response.json() as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!payload.access_token) throw new Error(`Claims Tracker authorization failed: ${payload.error ?? "unknown error"} — ${payload.error_description ?? ""}`);
  return payload;
}
