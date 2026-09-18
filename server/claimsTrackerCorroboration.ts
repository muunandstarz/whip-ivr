import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { lossIntakeClaims } from "../drizzle/schema";
import { getDb } from "./db";
import { refreshGmailToken } from "./mail/ingestGmail";
import type { ThreadAnalysis } from "./lossIntakeDomain";

/**
 * Read-only operational workbook. The All Reported IncidentsStatus tab is the
 * binary filed-claim record; a row on that tab means the claim exists in
 * Snapsheet, regardless of whether the optional claim-file-link column is blank.
 */
export const CLAIMS_TRACKER_SPREADSHEET_ID = "14TDBHDDGhqq_1iylBginhFicpHU_Bnt1oG5nDa_cVls";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TRACKER_SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";
const FILED_TAB = "All Reported IncidentsStatus";
const FILED_TAB_RANGE = `${FILED_TAB}!A:O`;
const MARKET_TABS = ["RCK", "GB", "ATL", "CHI", "RVA", "ORL", "PHL", "MIA", "BOS", "DAL"] as const;

type SheetRows = string[][];
export type InspectionSchedule = {
  vinLastSix: string;
  market: string;
  memberName: string | null;
  scheduledFor: Date;
  sourceTab: string;
};

export type TrackerIndex = {
  available: boolean;
  /** A VIN appears here exactly when it has a row on All Reported IncidentsStatus. */
  filedVins: Set<string>;
  /** Retained only for the existing status UI; the binary source has no unfiled subset. */
  unfiledVins: Set<string>;
  claimByVin: Map<string, string>;
  inspectionByVin: Map<string, InspectionSchedule>;
  warning?: string;
};

let cache: { expiresAt: number; value: TrackerIndex } | null = null;

export function normalizeVinFragment(value: string | null | undefined) {
  const compact = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // The workbook's claim field uses an eight-character VIN fragment (e.g. HC013679).
  // Dropping the first two characters yields the six-digit source join key. When the
  // field is malformed, taking the terminal six characters is the documented fallback.
  const firstTwoPrefixThenSix = compact.match(/^[A-Z0-9]{2}(\d{6})$/);
  if (firstTwoPrefixThenSix?.[1]) return firstTwoPrefixThenSix[1];
  const digits = compact.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-6) : "";
}

function parseSheetDate(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const easternMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i);
  if (easternMatch) {
    const month = Number(easternMatch[1]);
    const day = Number(easternMatch[2]);
    const rawYear = Number(easternMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    let hour = Number(easternMatch[4] ?? 9);
    const minute = Number(easternMatch[5] ?? 0);
    const meridiem = easternMatch[6]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    const intended = Date.UTC(year, month - 1, day, hour, minute);
    const observedParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(intended)).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    const observedLocal = Date.UTC(Number(observedParts.year), Number(observedParts.month) - 1, Number(observedParts.day), Number(observedParts.hour), Number(observedParts.minute));
    return new Date(intended + (intended - observedLocal));
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 30_000 && serial < 80_000) {
    return new Date(Date.UTC(1899, 11, 30 + serial));
  }
  return null;
}

function normalizedHeader(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function headerIndex(headers: string[], candidates: string[]) {
  return headers.findIndex(header => candidates.includes(normalizedHeader(header)));
}

function filedVinFromStatusRow(row: string[], claimColumn: number) {
  const claimCell = row[claimColumn >= 0 ? claimColumn : 2] ?? "";
  const normalizedClaim = normalizeVinFragment(claimCell);
  // Standard source format is two leading letters followed by the six-digit
  // fragment. A bare six-digit fragment is also accepted from legacy rows.
  if (/^(?:[A-Z0-9]{2})?\d{6}$/i.test(claimCell.trim())) return normalizedClaim;

  // When column C is malformed, use the third slash-delimited segment in the
  // Claim File link (column O). This is the documented workbook fallback.
  const linkSegments = (row[14] ?? "").split(/[\/-]/).filter(Boolean);
  return normalizeVinFragment(linkSegments[2] ?? "");
}

function buildInspectionIndex(rowsByTab: Partial<Record<(typeof MARKET_TABS)[number], SheetRows>>) {
  const inspectionByVin = new Map<string, InspectionSchedule>();
  for (const tab of MARKET_TABS) {
    const rows = rowsByTab[tab] ?? [];
    const headers = rows[0] ?? [];
    const claimColumn = headerIndex(headers, ["claim # - last 8", "claim # (last 8 of vin)"]);
    const memberColumn = headerIndex(headers, ["member name"]);
    const marketColumn = headerIndex(headers, ["market"]);
    const scheduleColumn = headerIndex(headers, ["inspection date", "scheduled return date", "scheduled inspection date"]);
    if (claimColumn < 0 || scheduleColumn < 0) continue;
    for (const row of rows.slice(1)) {
      const vinLastSix = normalizeVinFragment(row[claimColumn]);
      const scheduledFor = parseSheetDate(row[scheduleColumn]);
      if (!vinLastSix || !scheduledFor) continue;
      const candidate: InspectionSchedule = {
        vinLastSix,
        market: row[marketColumn] || tab,
        memberName: row[memberColumn]?.trim() || null,
        scheduledFor,
        sourceTab: tab,
      };
      const existing = inspectionByVin.get(vinLastSix);
      if (!existing || candidate.scheduledFor.getTime() < existing.scheduledFor.getTime()) {
        inspectionByVin.set(vinLastSix, candidate);
      }
    }
  }
  return inspectionByVin;
}

export function buildClaimsTrackerIndex(input: {
  allReportedIncidentsStatus?: SheetRows;
  marketSchedules?: Partial<Record<(typeof MARKET_TABS)[number], SheetRows>>;
}): TrackerIndex {
  const filedVins = new Set<string>();
  const claimByVin = new Map<string, string>();
  const rows = input.allReportedIncidentsStatus ?? [];
  const headers = rows[0] ?? [];
  const claimColumn = headerIndex(headers, ["claim # (last 8 of vin)"]);
  const memberColumn = headerIndex(headers, ["member name"]);

  for (const row of rows.slice(1)) {
    const vin = filedVinFromStatusRow(row, claimColumn);
    if (!vin) continue;
    // Presence on the status tab is the filed test. Never inspect or rely on column O.
    filedVins.add(vin);
    const claim = (row[claimColumn >= 0 ? claimColumn : 2] ?? "").trim();
    if (claim) claimByVin.set(vin, claim);
    void memberColumn;
  }

  return {
    available: true,
    filedVins,
    unfiledVins: new Set(),
    claimByVin,
    inspectionByVin: buildInspectionIndex(input.marketSchedules ?? {}),
  };
}

export function applyClaimsTrackerCorroboration(analysis: ThreadAnalysis, index: TrackerIndex): ThreadAnalysis {
  if (!index.available) {
    return {
      ...analysis,
      filingEvidence: `${analysis.filingEvidence} Claims Tracker status unavailable: ${index.warning ?? "authorization is not connected."}`,
      dataWarnings: [...analysis.dataWarnings, "Claims Tracker status is unavailable; filing queue cannot be verified until the read-only source is restored."],
    };
  }

  const vin = normalizeVinFragment(analysis.duplicateGroupKey?.split("|").at(-1));
  if (!vin) return analysis;
  const trackerFiled = index.filedVins.has(vin);
  const trackerClaim = index.claimByVin.get(vin);
  const inspection = index.inspectionByVin.get(vin) ?? null;
  const evidence = trackerFiled
    ? ` All Reported IncidentsStatus contains VIN ${vin}${trackerClaim ? ` (${trackerClaim})` : ""}; filed in Snapsheet.`
    : ` All Reported IncidentsStatus has no row for VIN ${vin}; retain in the processor filing queue unless a processor has excluded it.`;

  // The status tab owns the binary filed determination. A Slack template/URL is useful
  // source context but never removes a notice from the processor queue by itself.
  return {
    ...analysis,
    claimId: trackerFiled ? (trackerClaim ?? analysis.claimId ?? null) : analysis.claimId,
    filingState: trackerFiled ? "filed" : "unfiled",
    filingEvidence: `${analysis.filingEvidence}${evidence}`,
    // Market tabs document a scheduled inspection only. Arrival is still
    // determined exclusively from the Slack source-thread poster/evidence.
    inspectionScheduledAt: inspection?.scheduledFor ?? null,
    inspectionScheduleSource: inspection?.sourceTab ?? null,
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
    const [allReportedIncidentsStatus, ...scheduleRows] = await Promise.all([
      readRange(token, FILED_TAB_RANGE),
      ...MARKET_TABS.map(tab => readRange(token, `${tab}!A:M`)),
    ]);
    const marketSchedules = Object.fromEntries(MARKET_TABS.map((tab, index) => [tab, scheduleRows[index]])) as Partial<Record<(typeof MARKET_TABS)[number], SheetRows>>;
    const value = buildClaimsTrackerIndex({ allReportedIncidentsStatus, marketSchedules });
    // The Processor board polls; a short read-only cache lets a newly filed
    // source row leave the queue on the next practical refresh without
    // repeatedly reading Sheets for every viewer render.
    cache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch (error) {
    const value: TrackerIndex = {
      available: false,
      filedVins: new Set(),
      unfiledVins: new Set(),
      claimByVin: new Map(),
      inspectionByVin: new Map(),
      warning: error instanceof Error ? error.message : String(error),
    };
    cache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }
}

/** Explicit cache reset for source-sync and acceptance-test freshness. */
export function clearClaimsTrackerCache() {
  cache = null;
}

/**
 * Reconciles persisted board rows to the binary filed source without reading
 * Slack or publishing anything. This is useful when the source rule changes:
 * every valid VIN is set from All Reported IncidentsStatus, never from column O.
 */
export async function reconcileStoredClaimsTrackerFiling(providedIndex?: TrackerIndex) {
  const index = providedIndex ?? await getClaimsTrackerIndex();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!index.available) throw new Error(index.warning ?? "All Reported IncidentsStatus is unavailable");
  const claims = await db.select({
    id: lossIntakeClaims.id,
    vinLastSix: lossIntakeClaims.vinLastSix,
    filingState: lossIntakeClaims.filingState,
    claimId: lossIntakeClaims.claimId,
    filingEvidence: lossIntakeClaims.filingEvidence,
    inspectionScheduledAt: lossIntakeClaims.inspectionScheduledAt,
    inspectionScheduleSource: lossIntakeClaims.inspectionScheduleSource,
  }).from(lossIntakeClaims);
  let updated = 0;
  for (const claim of claims) {
    const vin = normalizeVinFragment(claim.vinLastSix);
    if (!vin) continue;
    const filed = index.filedVins.has(vin);
    const trackerClaim = index.claimByVin.get(vin) ?? null;
    const inspection = index.inspectionByVin.get(vin) ?? null;
    const nextEvidence = filed
      ? `All Reported IncidentsStatus contains VIN ${vin}${trackerClaim ? ` (${trackerClaim})` : ""}; filed in Snapsheet.`
      : `All Reported IncidentsStatus has no row for VIN ${vin}; eligible for the Processor queue unless excluded.`;
    const changed = claim.filingState !== (filed ? "filed" : "unfiled") ||
      claim.claimId !== (filed ? (trackerClaim ?? claim.claimId) : claim.claimId) ||
      claim.filingEvidence !== nextEvidence ||
      (claim.inspectionScheduledAt?.getTime() ?? null) !== (inspection?.scheduledFor.getTime() ?? null) ||
      claim.inspectionScheduleSource !== (inspection?.sourceTab ?? null);
    if (!changed) continue;
    await db.update(lossIntakeClaims).set({
      filingState: filed ? "filed" : "unfiled",
      claimId: filed ? (trackerClaim ?? claim.claimId) : claim.claimId,
      filingEvidence: nextEvidence,
      inspectionScheduledAt: inspection?.scheduledFor ?? null,
      inspectionScheduleSource: inspection?.sourceTab ?? null,
    }).where(eq(lossIntakeClaims.id, claim.id));
    updated += 1;
  }
  return { scanned: claims.length, updated, filedVins: index.filedVins.size, scheduledVins: index.inspectionByVin.size };
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
