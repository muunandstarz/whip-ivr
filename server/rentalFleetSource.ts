import { sql } from "drizzle-orm";
import { getDb } from "./db";

export const RENTAL_FLEET_SHEET_ID = "1CNgds7PoVkA9IvbsUoM21q3kr2G7tfCk5dtsAxe3Xhg";
export const RENTAL_FLEET_TAB_ID = 788855635;
export const RENTAL_FLEET_MAX_ROWS = 5000;
export const RENTAL_FLEET_CACHE_MS = 60000;
// Fictional, syntactically VIN-shaped with a calculated check digit. Not a real vehicle identification.
export const RENTAL_DEMO_VIN = "1DEMV0009TA000000";
export type FleetVehicle = { row: number; vin: string; ymm: string; plate: string; location: string; locationMalformed: boolean; status: string; usable: boolean };
export type FleetSnapshot = { checkedAt: number; vehicles: FleetVehicle[]; unsafeVins: string[]; rows: number; available: number; excluded: number };
export type RentalInventorySource = { enabled: boolean; pending: boolean; updatedAt: number | null; available: number; excluded: number; error: string | null };
const statuses = new Set(["Available", "Occupied", "Coming Soon", "Maintenance", "Detail", "Remove"]);
const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;
const safeText = (v: unknown, max: number) => typeof v === "string" && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v.trim() : null;

/** Accepts only A:G, M:M and X:X. Customer, dates, prices and rental mileage never reach this parser. */
export function parseFleetValues(input: unknown, checkedAt: number): FleetSnapshot {
  if (!input || typeof input !== "object") throw new Error("Invalid fleet response");
  const ranges = (input as { valueRanges?: unknown }).valueRanges;
  if (!Array.isArray(ranges) || ranges.length !== 3) throw new Error("Invalid fleet ranges");
  const widths = [7, 1, 1];
  const expected = ["A1:G5000", "M1:M5000", "X1:X5000"];
  const blocks = ranges.map((range: any, i) => {
    if (!range || typeof range.range !== "string" || range.range.replaceAll("'", "") !== `FLEET!${expected[i]}` || (range.majorDimension && range.majorDimension !== "ROWS")) throw new Error("Unexpected fleet range");
    const values = range.values ?? [];
    if (!Array.isArray(values) || values.length >= RENTAL_FLEET_MAX_ROWS || values.some((row: unknown) => !Array.isArray(row) || row.length > widths[i] || row.some((cell: unknown) => !["string", "number", "boolean"].includes(typeof cell)))) throw new Error("Malformed or truncated fleet values");
    return values as unknown[][];
  });
  const header = blocks[0][3];
  if (!header || ["LoanerID", "Year", "Make", "Model", "Vin", "Color", "Tag"].some((name, i) => header[i] !== name) || blocks[1][3]?.[0] !== "LOCATION" || blocks[2][3]?.[0] !== "STATUS") throw new Error("Fleet header changed");
  const vehicles: FleetVehicle[] = [], unsafe = new Set<string>(), seen = new Set<string>();
  const length = Math.max(...blocks.map(rows => rows.length));
  let rows = 0, excluded = 0;
  for (let i = 4; i < length; i++) {
    const cells = blocks[0][i] ?? [], rawLocation = blocks[1][i]?.[0] ?? "", rawStatus = blocks[2][i]?.[0] ?? "";
    if (!cells.some(v => v !== "") && rawLocation === "" && rawStatus === "") continue;
    rows++;
    const vin = safeText(cells[4], 17)?.toUpperCase() ?? "";
    if (!vinPattern.test(vin)) { excluded++; continue; }
    if (seen.has(vin)) unsafe.add(vin);
    seen.add(vin);
    const year = typeof cells[1] === "number" ? String(cells[1]) : safeText(cells[1], 4);
    const make = safeText(cells[2], 50), model = safeText(cells[3], 60), plate = safeText(cells[6] ?? "", 30), location = safeText(rawLocation, 120);
    // STATUS is intentionally case-sensitive and untrimmed: only the exact value Available is usable.
    const status = typeof rawStatus === "string" && statuses.has(rawStatus) ? rawStatus : "Unknown";
    const ymm = `${year ?? ""} ${make ?? ""} ${model ?? ""}`;
    const valid = !!year && /^(19|20)\d{2}$/.test(year) && !!make && !!model && ymm.length <= 120 && plate !== null;
    if (!valid) unsafe.add(vin);
    vehicles.push({ row: i + 1, vin, ymm, plate: plate ?? "", location: location ?? "", locationMalformed: location === null, status, usable: valid && status === "Available" });
  }
  for (const v of vehicles) if (unsafe.has(v.vin)) v.usable = false;
  const available = vehicles.filter(v => v.usable).length;
  return { checkedAt, vehicles, unsafeVins: Array.from(unsafe), rows, available, excluded: excluded + vehicles.length - available };
}

export async function readRentalFleetSource(): Promise<FleetSnapshot> {
  // Only reads the pre-authorized credential. Never invokes ingestion, schedulers or settings writes.
  const db = await getDb();
  if (!db) throw new Error("Fleet credentials unavailable");
  const result: any = await db.execute(sql`SELECT value FROM mail_settings WHERE \`key\` = 'claims_tracker_refresh_token' LIMIT 1`);
  const row = result?.[0]?.[0];
  if (!row?.value) throw new Error("Fleet credential not connected");
  const { refreshGmailToken } = await import("./mail/ingestGmail");
  const token = await refreshGmailToken(row.value);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${RENTAL_FLEET_SHEET_ID}`;
  const get = async (url: string) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 4 * 1024 * 1024) throw new Error("Fleet read unavailable");
    // Bound streamed bytes even if upstream omits Content-Length. Never log the response.
    const chunks: Buffer[] = []; let bytes = 0;
    try {
      if (!response.body) throw new Error("Missing fleet response");
      for await (const chunk of response.body as any) { const b = Buffer.from(chunk); bytes += b.length; if (bytes > 4 * 1024 * 1024) throw new Error("Fleet response too large"); chunks.push(b); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { for (const chunk of chunks) chunk.fill(0); }
  };
  const metadata = await get(`${base}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`);
  const tab = metadata?.sheets?.find((s: any) => s.properties?.sheetId === RENTAL_FLEET_TAB_ID)?.properties;
  // Checking grid size makes the bounded values read fail closed rather than silently ignoring later rows.
  if (!tab || tab.title !== "FLEET" || !Number.isInteger(tab.gridProperties?.rowCount) || tab.gridProperties.rowCount > RENTAL_FLEET_MAX_ROWS) throw new Error("Fleet tab changed or exceeds safe read limit");
  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE", fields: "valueRanges(range,majorDimension,values)" });
  for (const range of ["FLEET!A1:G5000", "FLEET!M1:M5000", "FLEET!X1:X5000"]) params.append("ranges", range);
  return parseFleetValues(await get(`${base}/values:batchGet?${params}`), Date.now());
}
