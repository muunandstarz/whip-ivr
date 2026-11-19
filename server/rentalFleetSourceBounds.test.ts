import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), refresh: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => ({ execute: mocks.execute })) }));
vi.mock("./mail/ingestGmail", () => ({ refreshGmailToken: mocks.refresh }));
import { parseFleetValues, readRentalFleetSource, RENTAL_FLEET_TAB_ID } from "./rentalFleetSource";

function fixture(rows = 175) {
  return { valueRanges: [
    { range: `FLEET!A1:G${rows}`, majorDimension: "ROWS", values: [[], [], [], ["LoanerID", "Year", "Make", "Model", "Vin", "Color", "Tag"], ["TEST", "2026", "Fictional", "Sedan", "1HGCM82633A004352", "Gray", "TEST"]] },
    { range: `FLEET!M1:M${rows}`, majorDimension: "ROWS", values: [[], [], [], ["LOCATION"], [""]] },
    { range: `FLEET!X1:X${rows}`, majorDimension: "ROWS", values: [[], [], [], ["STATUS"], ["Available"]] },
  ] };
}
const metadata = (rows: number) => ({ sheets: [{ properties: { sheetId: RENTAL_FLEET_TAB_ID, title: "FLEET", gridProperties: { rowCount: rows } } }] });
beforeEach(() => { mocks.execute.mockResolvedValue([[{ value: "TEST-REFRESH-CREDENTIAL" }]]); mocks.refresh.mockResolvedValue("TEST-ACCESS-TOKEN"); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Fleet range bounds from actual Google grid metadata", () => {
  it("reads the metadata-sized 175-row ranges instead of assuming Google echoes 5000", async () => {
    const requested: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify(requested.length === 1 ? metadata(175) : fixture(175)), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await readRentalFleetSource();
    expect(result).toMatchObject({ rows: 1, available: 1, excluded: 0 });
    expect(result.vehicles[0].location).toBe("");
    const query = new URL(requested[1]);
    expect(query.searchParams.getAll("ranges")).toEqual(["FLEET!A1:G175", "FLEET!M1:M175", "FLEET!X1:X175"]);
    expect(query.searchParams.get("fields")).toBe("valueRanges(range,majorDimension,values)");
    expect(requested[1]).not.toContain("5000");
  });
  it("accepts a complete metadata-sized grid including its last row", () => {
    const data = fixture(175);
    for (const block of data.valueRanges) while (block.values.length < 175) block.values.push([]);
    expect(parseFleetValues(data, Date.now(), 175).available).toBe(1);
  });
  it("rejects unverified bounds, changed response bounds and forbidden columns", () => {
    expect(() => parseFleetValues(fixture(), Date.now())).toThrow("Unexpected fleet range");
    for (const rows of [0, 3, 5001, 175.5]) expect(() => parseFleetValues(fixture(), Date.now(), rows)).toThrow("Invalid fleet row bounds");
    expect(() => parseFleetValues(fixture(176), Date.now(), 175)).toThrow("Unexpected fleet range");
    const forbidden = fixture(); forbidden.valueRanges[0].range = "FLEET!A1:X175";
    expect(() => parseFleetValues(forbidden, Date.now(), 175)).toThrow("Unexpected fleet range");
    const excess = fixture(); excess.valueRanges[0].values = Array.from({ length: 176 }, () => []);
    expect(() => parseFleetValues(excess, Date.now(), 175)).toThrow("Malformed or truncated");
  });
  it("fails before reading values when the actual grid exceeds the maximum", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(metadata(5001)), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readRentalFleetSource()).rejects.toThrow("safe read limit");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects a changed returned tab even when row bounds match", () => {
    const data = fixture(); data.valueRanges[1].range = "OTHER!M1:M175";
    expect(() => parseFleetValues(data, Date.now(), 175)).toThrow("Unexpected fleet range");
  });
});
