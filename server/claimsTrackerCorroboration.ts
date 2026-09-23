import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { lossIntakeClaims } from "../drizzle/schema";
import { getDb } from "./db";
import { refreshGmailToken } from "./mail/ingestGmail";
import type { ThreadAnalysis } from "./lossIntakeDomain";

/**
 * Read-only operational workbook. A row on All Reported IncidentsStatus is a
 * filed Claim only when it belongs to the same loss—not merely another rental
 * history row sharing the same vehicle's six-digit VIN fragment.
 */
export const CLAIMS_TRACKER_SPREADSHEET_ID = "14TDBHDDGhqq_1iylBginhFicpHU_Bnt1oG5nDa_cVls";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TRACKER_SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";
const FILED_TAB = "All Reported IncidentsStatus";
const FILED_TAB_RANGE = `${FILED_TAB}!A:O`;
const MARKET_TABS = ["RCK", "GB", "ATL", "CHI", "RVA", "ORL", "PHL", "MIA", "BOS", "DAL"] as const;
const FILED_DATE_TOLERANCE_DAYS = 3;

type SheetRows = string[][];
export type InspectionSchedule = {
  vinLastSix: string;
  market: string;
  memberName: string | null;
  scheduledFor: Date;
  sourceTab: string;
};

export type TrackerFilingRecord = {
  vinLastSix: string;
  memberName: string | null;
  dateOfLoss: Date | null;
  claimNumber: string | null;
};

export type TrackerIndex = {
  available: boolean;
  /** VIN fragments found in All Reported IncidentsStatus. Diagnostic only. */
  filedVins: Set<string>;
  /** Retained for the existing status UI; the source has no independent unfiled tab. */
  unfiledVins: Set<string>;
  claimByVin: Map<string, string>;
  filedRecordsByVin: Map<string, TrackerFilingRecord[]>;
  inspectionByVin: Map<string, InspectionSchedule>;
  warning?: string;
};

let cache: { expiresAt: number; value: TrackerIndex } | null = null;

export function normalizeVinFragment(value: string | null | undefined) {
  const compact = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Workbook column C normally carries two leading characters plus six digits.
  const firstTwoPrefixThenSix = compact.match(/^[A-Z0-9]{2}(\d{6})$/);
  if (firstTwoPrefixThenSix?.[1]) return firstTwoPrefixThenSix[1];
  const digits = compact.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(-6) : "";
}

/** Parses Tracker and Slack loss dates as calendar dates without timezone drift. */
export function parseOperationalDate(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return new Date(Date.UTC(year, Number(slash[1]) - 1, Number(slash[2])));
  }
  const long = raw.match(/^(?:[A-Za-z]+\s+)?(\d{1,2})[\s,/-]+(?:[A-Za-z]+\s+)?(\d{4})/);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && (long || /\d{4}/.test(raw))) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 30_000 && serial < 80_000) {
    const source = new Date(Date.UTC(1899, 11, 30 + serial));
    return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  }
  return null;
}

function parseSheetDate(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const easternMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i);
  if (easternMatch) {
    const month = Number(easternMatch[1]);
    const day = Number(easternMatch[2]);
    const year = Number(easternMatch[3]) < 100 ? 2000 + Number(easternMatch[3]) : Number(easternMatch[3]);
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
  return parseOperationalDate(raw);
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
  if (/^(?:[A-Z0-9]{2})?\d{6}$/i.test(claimCell.trim())) return normalizedClaim;
  // Column O fallback only when column C itself is malformed.
  const linkSegments = (row[14] ?? "").split(/[/-]/).filter(Boolean);
  return normalizeVinFragment(linkSegments[2] ?? "");
}

function normalizePerson(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function sameMember(left: string | null | undefined, right: string | null | undefined) {
  const l = normalizePerson(left);
  const r = normalizePerson(right);
  if (!l || !r) return true; // Name is an additional check only when both sources have it.
  return l === r || l.includes(r) || r.includes(l);
}

function calendarDistanceDays(left: Date, right: Date) {
  return Math.abs(Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate()) - Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate())) / 86_400_000;
}

/** Matches one tracker row to one loss, protecting against repeat rentals on one VIN. */
export function matchTrackerFiling(input: {
  index: TrackerIndex;
  vinLastSix: string | null | undefined;
  memberName: string | null | undefined;
  dateOfLoss: string | null | undefined;
}) {
  const vin = normalizeVinFragment(input.vinLastSix);
  const lossDate = parseOperationalDate(input.dateOfLoss);
  if (!vin || !lossDate) return null;
  const matches = (input.index.filedRecordsByVin.get(vin) ?? [])
    .filter(record => record.dateOfLoss && calendarDistanceDays(record.dateOfLoss, lossDate) <= FILED_DATE_TOLERANCE_DAYS)
    .filter(record => sameMember(record.memberName, input.memberName));
  return matches.sort((left, right) => calendarDistanceDays(left.dateOfLoss!, lossDate) - calendarDistanceDays(right.dateOfLoss!, lossDate))[0] ?? null;
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
      const candidate: InspectionSchedule = { vinLastSix, market: row[marketColumn] || tab, memberName: row[memberColumn]?.trim() || null, scheduledFor, sourceTab: tab };
      const existing = inspectionByVin.get(vinLastSix);
      if (!existing || candidate.scheduledFor.getTime() < existing.scheduledFor.getTime()) inspectionByVin.set(vinLastSix, candidate);
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
  const filedRecordsByVin = new Map<string, TrackerFilingRecord[]>();
  const rows = input.allReportedIncidentsStatus ?? [];
  const headers = rows[0] ?? [];
  const claimColumn = headerIndex(headers, ["claim # (last 8 of vin)"]);
  const memberColumn = headerIndex(headers, ["member name"]);
  const dateOfLossColumn = headerIndex(headers, ["date of loss"]);

  for (const row of rows.slice(1)) {
    const vin = filedVinFromStatusRow(row, claimColumn);
    if (!vin) continue;
    const claimNumber = (row[claimColumn >= 0 ? claimColumn : 2] ?? "").trim() || null;
    const record: TrackerFilingRecord = {
      vinLastSix: vin,
      memberName: row[memberColumn]?.trim() || null,
      dateOfLoss: parseOperationalDate(row[dateOfLossColumn]),
      claimNumber,
    };
    filedVins.add(vin);
    if (claimNumber && !claimByVin.has(vin)) claimByVin.set(vin, claimNumber);
    filedRecordsByVin.set(vin, [...(filedRecordsByVin.get(vin) ?? []), record]);
  }
  return { available: true, filedVins, unfiledVins: new Set(), claimByVin, filedRecordsByVin, inspectionByVin: buildInspectionIndex(input.marketSchedules ?? {}) };
}

export function applyClaimsTrackerCorroboration(
  analysis: ThreadAnalysis,
  index: TrackerIndex,
  source: { memberName?: string | null; dateOfLoss?: string | null; vinLastSix?: string | null } = {},
): ThreadAnalysis {
  const vin = normalizeVinFragment(source.vinLastSix ?? analysis.correctedVinLastSix ?? analysis.duplicateGroupKey?.split("|").at(-1));
  const inspection = vin ? index.inspectionByVin.get(vin) ?? null : null;
  const directThreadClaim = analysis.claimId;
  if (!index.available) {
    return {
      ...analysis,
      filingEvidence: `${analysis.filingEvidence} Claims Tracker status unavailable: ${index.warning ?? "authorization is not connected."}`,
      dataWarnings: [...analysis.dataWarnings, "Claims Tracker status is unavailable; filing status cannot be corroborated until the read-only source is restored."],
      inspectionScheduledAt: inspection?.scheduledFor ?? null,
      inspectionScheduleSource: inspection?.sourceTab ?? null,
    };
  }

  const trackerMatch = matchTrackerFiling({ index, vinLastSix: vin, memberName: source.memberName, dateOfLoss: source.dateOfLoss });
  const filed = Boolean(directThreadClaim || trackerMatch);
  const evidence = directThreadClaim
    ? `Claim ID ${directThreadClaim} found in the Slack intake thread.`
    : trackerMatch
      ? `All Reported IncidentsStatus matched VIN ${vin}, date of loss within ${FILED_DATE_TOLERANCE_DAYS} days, and member ${trackerMatch.memberName ?? "(not supplied)"}; filed in Snapsheet.`
      : vin
        ? "No same-loss All Reported IncidentsStatus row matched this notice."
        : "No usable VIN fragment was extracted for Claims Tracker corroboration.";
  // The unfiled worklist is a binary same-loss VIN check. A source post that
  // lacks the six-digit key cannot qualify for either outcome and must remain
  // unverified rather than becoming a false unfiled item.
  const filingState = filed ? "filed" : vin ? "unfiled" : "unverified";
  return {
    ...analysis,
    claimId: directThreadClaim ?? trackerMatch?.claimNumber ?? null,
    filingState,
    filingEvidence: evidence,
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
  const response = await fetch(`${SHEETS_BASE}/${CLAIMS_TRACKER_SPREADSHEET_ID}/values/${encodeURIComponent(range)}?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } });
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
    cache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch (error) {
    const value: TrackerIndex = { available: false, filedVins: new Set(), unfiledVins: new Set(), claimByVin: new Map(), filedRecordsByVin: new Map(), inspectionByVin: new Map(), warning: error instanceof Error ? error.message : String(error) };
    cache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }
}

/** Explicit cache reset for source-sync and acceptance-test freshness. */
export function clearClaimsTrackerCache() { cache = null; }

/** Reconciles persisted rows to same-loss All Reported IncidentsStatus matches without reading Slack or publishing. */
export async function reconcileStoredClaimsTrackerFiling(providedIndex?: TrackerIndex) {
  const index = providedIndex ?? await getClaimsTrackerIndex();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!index.available) throw new Error(index.warning ?? "All Reported IncidentsStatus is unavailable");
  const claims = await db.select({
    id: lossIntakeClaims.id,
    vinLastSix: lossIntakeClaims.vinLastSix,
    memberName: lossIntakeClaims.memberName,
    dateOfLoss: lossIntakeClaims.dateOfLoss,
    filingState: lossIntakeClaims.filingState,
    claimId: lossIntakeClaims.claimId,
    filingEvidence: lossIntakeClaims.filingEvidence,
    inspectionScheduledAt: lossIntakeClaims.inspectionScheduledAt,
    inspectionScheduleSource: lossIntakeClaims.inspectionScheduleSource,
  }).from(lossIntakeClaims);
  let updated = 0;
  for (const claim of claims) {
    const trackerMatch = matchTrackerFiling({ index, vinLastSix: claim.vinLastSix, memberName: claim.memberName, dateOfLoss: claim.dateOfLoss });
    const directThreadClaim = claim.claimId && !/^([A-Z0-9]{2})?\d{6}$/i.test(claim.claimId) ? claim.claimId : null;
    const filed = Boolean(directThreadClaim || trackerMatch);
    const vin = normalizeVinFragment(claim.vinLastSix);
    const inspection = index.inspectionByVin.get(vin) ?? null;
    const nextEvidence = directThreadClaim
      ? `Claim ID ${directThreadClaim} found in the Slack intake thread.`
      : trackerMatch
        ? `All Reported IncidentsStatus matched VIN ${vin}, date of loss within ${FILED_DATE_TOLERANCE_DAYS} days, and member ${trackerMatch.memberName ?? "(not supplied)"}; filed in Snapsheet.`
        : vin ? "No same-loss All Reported IncidentsStatus row matched this notice." : "No usable VIN fragment was extracted for Claims Tracker corroboration.";
    const nextClaimId = directThreadClaim ?? trackerMatch?.claimNumber ?? null;
    const nextFilingState = filed ? "filed" : vin ? "unfiled" : "unverified";
    if (claim.filingState === nextFilingState && claim.claimId === nextClaimId && claim.filingEvidence === nextEvidence && (claim.inspectionScheduledAt?.getTime() ?? null) === (inspection?.scheduledFor.getTime() ?? null) && claim.inspectionScheduleSource === (inspection?.sourceTab ?? null)) continue;
    await db.update(lossIntakeClaims).set({
      filingState: nextFilingState,
      claimId: nextClaimId,
      filingEvidence: nextEvidence,
      inspectionScheduledAt: inspection?.scheduledFor ?? null,
      inspectionScheduleSource: inspection?.sourceTab ?? null,
    }).where(eq(lossIntakeClaims.id, claim.id));
    updated += 1;
  }
  return { scanned: claims.length, updated, filedVins: index.filedVins.size, scheduledVins: index.inspectionByVin.size };
}

export function buildClaimsTrackerOAuthUrl(redirectUri: string) {
  const params = new URLSearchParams({ client_id: process.env.GMAIL_CLIENT_ID ?? "", redirect_uri: redirectUri, response_type: "code", scope: TRACKER_SCOPES, access_type: "offline", prompt: "consent", state: "claims-tracker-readonly" });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeClaimsTrackerCode(code: string, redirectUri: string): Promise<{ refresh_token?: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GMAIL_CLIENT_ID ?? "", client_secret: process.env.GMAIL_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const payload = await response.json() as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!payload.access_token) throw new Error(`Claims Tracker authorization failed: ${payload.error ?? "unknown error"} — ${payload.error_description ?? ""}`);
  return payload;
}
