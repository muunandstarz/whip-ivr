import { describe, expect, it } from "vitest";
import {
  MARKET_PRICING,
  findLouVehicleRate,
  LOU_RATE_SOURCE,
  louRateSourceLabel,
} from "../shared/louRates";

/**
 * Independent fixture transcribed from the owner-provided
 * DriveWhip_Rate_Sheet.xlsx, Weekly Rates, cells B8:L37.
 * Verified with openpyxl against the original workbook (not the shared catalog).
 * Currency strings, including D25:D29 and D34, are numeric published rates.
 * Both blank cells and em dashes mean NOT OFFERED. Section headings, B40's
 * tax multiplier, the historical Change Log, and Fees & Deposits are excluded.
 * Keep the workbook external: these tests require no upload directory or XLSX.
 */
const WORKBOOK_MARKETS = [
  { code: "DC", column: "B", count: 26, effectiveDate: "2026-08-12" },
  { code: "BWI", column: "C", count: 26, effectiveDate: "2026-08-12" },
  { code: "ATL", column: "D", count: 23, effectiveDate: "2026-08-12" },
  { code: "CHI", column: "E", count: 14, effectiveDate: "2026-08-12" },
  { code: "MIA", column: "F", count: 11, effectiveDate: "2026-08-12" },
  { code: "ORL", column: "G", count: 8, effectiveDate: "2026-08-12" },
  { code: "TPA", column: "H", count: 3, effectiveDate: null },
  { code: "PHL", column: "I", count: 7, effectiveDate: "2026-06-15" },
  { code: "RIC", column: "J", count: 8, effectiveDate: "2026-08-12" },
  { code: "BOS", column: "K", count: 10, effectiveDate: "2026-08-12" },
  { code: "DAL", column: "L", count: 8, effectiveDate: "2026-04-01" },
] as const;

type WeeklyRates = [
  number | null, number | null, number | null, number | null,
  number | null, number | null, number | null, number | null,
  number | null, number | null, number | null,
];
type WorkbookRow = {
  row: number;
  model: string;
  make: string;
  rates: WeeklyRates;
};

// Column order: DC, BWI, ATL, CHI, MIA, ORL, TPA, PHL, RIC, BOS, DAL.
const WORKBOOK_ROWS: WorkbookRow[] = [
  { row: 8, model: "Toyota Corolla (Gas & Hybrid)", make: "Toyota",
    rates: [399, 399, 429.92, 399, 399, 399, null, 399, 399, 399, 399] },
  { row: 9, model: "Toyota Corolla Cross", make: "Toyota",
    rates: [399, 399, 429.92, 399, 399, 399, null, 399, 399, 399, 399] },
  { row: 10, model: "Toyota C-HR", make: "Toyota",
    rates: [350, 350, 377.13, null, null, null, null, null, null, null, null] },
  { row: 11, model: "Toyota Camry (2024 & older)", make: "Toyota",
    rates: [399, 399, 429.92, 399, 399, null, null, null, null, null, null] },
  { row: 12, model: "Toyota Camry (2025 & newer)", make: "Toyota",
    rates: [429, 429, 462.25, 429, 429, 429, null, 429, 429, 429, 429] },
  { row: 13, model: "Toyota Prius Hybrid / Crown", make: "Toyota",
    rates: [400, 400, 431, 400, 400, 400, null, 400, 400, 400, 400] },
  { row: 14, model: "Toyota RAV4", make: "Toyota",
    rates: [449, 449, 483.8, 449, 449, 449, null, 449, 449, 449, 449] },
  { row: 15, model: "Toyota Venza Hybrid", make: "Toyota",
    rates: [450, 450, 484.88, null, null, null, null, null, null, null, null] },
  { row: 16, model: "Toyota Highlander", make: "Toyota",
    rates: [450, 450, 484.88, 450, null, null, null, null, null, null, null] },
  { row: 17, model: "Toyota Highlander Hybrid", make: "Toyota",
    rates: [475, 475, 511.81, 475, null, null, null, null, null, null, null] },
  { row: 18, model: "Toyota Grand Highlander", make: "Toyota",
    rates: [500, 500, null, null, null, null, null, null, null, null, null] },
  { row: 19, model: "Toyota Sienna Hybrid", make: "Toyota",
    rates: [549, 549, 591.55, 549, null, null, null, null, null, null, null] },
  { row: 21, model: "Tesla Model 3", make: "Tesla",
    rates: [429, 429, 462.25, 429, 399, 399, 399, 449, 429, 429, 399] },
  { row: 22, model: "Tesla Model Y (2025 & older)", make: "Tesla",
    rates: [449, 449, 483.8, 449, 449, 449, 449, 499, 449, 449, 449] },
  { row: 23, model: "Tesla Model Y (2026)", make: "Tesla",
    rates: [550, 550, 592.63, 550, 499, 499, 499, null, 550, 550, 499] },
  { row: 25, model: "Honda Civic (2022 & older)", make: "Honda",
    rates: [350, 350, 377.13, null, null, null, null, null, null, null, null] },
  { row: 26, model: "Honda Civic (2023 & newer)", make: "Honda",
    rates: [399, 399, 429.92, null, null, null, null, null, null, null, null] },
  { row: 27, model: "Honda Accord (2022 & older)", make: "Honda",
    rates: [399, 399, 429.92, null, null, null, null, null, null, null, null] },
  { row: 28, model: "Honda Accord (2023 & newer)", make: "Honda",
    rates: [429, 429, 462.25, null, null, null, null, null, null, null, null] },
  { row: 29, model: "Honda CR-V (2022 & older)", make: "Honda",
    rates: [375, 375, 404.06, null, null, null, null, null, null, null, null] },
  { row: 30, model: "Honda CR-V (2023 & newer)", make: "Honda",
    rates: [449, 449, 483.8, null, null, null, null, null, null, null, null] },
  { row: 31, model: "Honda HR-V", make: "Honda",
    rates: [400, 400, null, null, null, null, null, null, null, null, null] },
  { row: 32, model: "Honda Odyssey", make: "Honda",
    rates: [549, 549, null, null, null, null, null, null, null, null, null] },
  { row: 34, model: "Chevrolet Malibu", make: "Chevrolet",
    rates: [399, 399, 429.92, null, null, null, null, null, null, null, null] },
  { row: 36, model: "Chrysler Pacifica", make: "Chrysler",
    rates: [499, 499, 537.67, 499, 499, null, null, null, null, 499, null] },
  { row: 37, model: "Chrysler Voyager", make: "Chrysler",
    rates: [499, 499, 537.67, 499, 499, null, null, null, null, 499, null] },
];

const WORKBOOK_CELLS = WORKBOOK_MARKETS.flatMap((market, column) =>
  WORKBOOK_ROWS.map(vehicle => ({
    marketCode: market.code,
    sourceCell: `${market.column}${vehicle.row}`,
    effectiveDate: market.effectiveDate,
    model: vehicle.model,
    make: vehicle.make,
    weeklyRate: vehicle.rates[column],
  })),
);
const PUBLISHED_CELLS = WORKBOOK_CELLS.filter(cell => cell.weeklyRate !== null);
const UNAVAILABLE_CELLS = WORKBOOK_CELLS.filter(cell => cell.weeklyRate === null);
const ATL_TAX_NOTE = "Published weekly rates already include 7.75% Georgia sales tax; do not add it again.";

// Integer-cent oracle independent of the production toFixed implementation.
function expectedDailyRate(weeklyRate: number): number {
  return Math.round(Math.round(weeklyRate * 100) / 7) / 100;
}

function marketFor(code: string) {
  const market = MARKET_PRICING.find(candidate => candidate.code === code);
  expect(market, `Missing market ${code}`).toBeDefined();
  return market!;
}

describe("LOU catalog — authoritative Weekly Rates workbook", () => {
  it("has exactly 26 types, 11 unique markets, and 144 published rates", () => {
    expect(WORKBOOK_ROWS).toHaveLength(26);
    expect(WORKBOOK_CELLS).toHaveLength(286);
    expect(PUBLISHED_CELLS).toHaveLength(144);
    expect(UNAVAILABLE_CELLS).toHaveLength(142);
    expect(MARKET_PRICING).toHaveLength(11);
    expect(new Set(MARKET_PRICING.map(market => market.code)).size).toBe(11);
    expect(MARKET_PRICING.map(market => market.code).sort())
      .toEqual(WORKBOOK_MARKETS.map(market => market.code).sort());
    const models = [...new Set(MARKET_PRICING.flatMap(market => market.vehicles.map(vehicle => vehicle.model)))];
    expect(models.sort()).toEqual(WORKBOOK_ROWS.map(vehicle => vehicle.model).sort());
    expect(MARKET_PRICING.reduce((count, market) => count + market.vehicles.length, 0)).toBe(144);
  });

  it.each(WORKBOOK_MARKETS)("$code has $count available types and its own effective date", expected => {
    const market = marketFor(expected.code);
    const column = WORKBOOK_MARKETS.findIndex(candidate => candidate.code === expected.code);
    expect(market.vehicles).toHaveLength(expected.count);
    expect(new Set(market.vehicles.map(vehicle => vehicle.model)).size).toBe(expected.count);
    expect(market.vehicles.map(vehicle => vehicle.model).sort()).toEqual(
      WORKBOOK_ROWS.filter(vehicle => vehicle.rates[column] !== null).map(vehicle => vehicle.model).sort(),
    );
    expect(market.effectiveDate).toBe(expected.effectiveDate);
    expect(market.sourceName).toBe("DriveWhip_Rate_Sheet.xlsx");
    expect(market.sourceSheet).toBe("Weekly Rates");
    expect(market.taxNote).toBe(expected.code === "ATL" ? ATL_TAX_NOTE : null);
  });

  it.each(PUBLISHED_CELLS)("$marketCode $model matches published $sourceCell ($weeklyRate/week)", cell => {
    const weeklyRate = cell.weeklyRate!;
    const expected = {
      model: cell.model,
      make: cell.make,
      vehicleClass: cell.model,
      weeklyRate,
      dailyRate: expectedDailyRate(weeklyRate),
      taxIncluded: cell.marketCode === "ATL",
      sourceCell: cell.sourceCell,
      effectiveDate: cell.effectiveDate,
    };
    const vehicle = marketFor(cell.marketCode).vehicles.find(candidate => candidate.model === cell.model);
    expect(vehicle).toEqual(expected);
    expect(findLouVehicleRate(cell.marketCode, cell.model)).toEqual(expected);
    expect(findLouVehicleRate(cell.marketCode, cell.model)).toBe(vehicle);
    expect(vehicle!.weeklyRate).toBeGreaterThan(0);
    expect(vehicle!.dailyRate).toBeGreaterThan(0);
  });

  it.each(UNAVAILABLE_CELLS)("$marketCode $model ($sourceCell blank/dash) never gets a zero, default, or another market's rate", cell => {
    expect(marketFor(cell.marketCode).vehicles.some(vehicle => vehicle.model === cell.model)).toBe(false);
    expect(findLouVehicleRate(cell.marketCode, cell.model)).toBeUndefined();
    // The same model exists in DC: availability must not fall back to it.
    expect(findLouVehicleRate("DC", cell.model)).toBeDefined();
  });

  it.each([
    [399, 57], [429, 61.29], [429.92, 61.42], [377.13, 53.88],
    [462.25, 66.04], [483.8, 69.11], [484.88, 69.27], [511.81, 73.12],
    [591.55, 84.51], [592.63, 84.66], [404.06, 57.72], [537.67, 76.81],
  ])("rounds published weekly $%s / 7 to daily $%s", (weeklyRate, dailyRate) => {
    const matching = MARKET_PRICING.flatMap(market => market.vehicles)
      .filter(vehicle => vehicle.weeklyRate === weeklyRate);
    expect(matching.length).toBeGreaterThan(0);
    for (const vehicle of matching) expect(vehicle.dailyRate).toBe(dailyRate);
  });

  it("does not tax Atlanta's already-tax-inclusive published rates a second time", () => {
    const atlanta = marketFor("ATL");
    expect(atlanta.taxNote).toBe(ATL_TAX_NOTE);
    expect(findLouVehicleRate("ATL", "Toyota Corolla (Gas & Hybrid)"))
      .toMatchObject({ weeklyRate: 429.92, dailyRate: 61.42, taxIncluded: true, sourceCell: "D8" });
    for (const market of MARKET_PRICING) {
      for (const vehicle of market.vehicles) {
        expect(vehicle.taxIncluded).toBe(market.code === "ATL");
      }
    }
  });

  it("uses Weekly Rates Accord year splits and prices, not conflicting Change Log values", () => {
    // Change Log A19 says $375 for the older Accord; A11 incorrectly uses 2024 & newer.
    // Authoritative Weekly Rates A27:A28/B27:C28 say 2022 & older=$399, 2023 & newer=$429.
    for (const code of ["DC", "BWI"]) {
      expect(findLouVehicleRate(code, "Honda Accord (2022 & older)")?.weeklyRate).toBe(399);
      expect(findLouVehicleRate(code, "Honda Accord (2023 & newer)")?.weeklyRate).toBe(429);
      expect(findLouVehicleRate(code, "Honda Accord (2024 & newer)")).toBeUndefined();
    }
    expect(findLouVehicleRate("ATL", "Honda Accord (2022 & older)")?.weeklyRate).toBe(429.92);
    expect(findLouVehicleRate("ATL", "Honda Accord (2023 & newer)")?.weeklyRate).toBe(462.25);
  });

  it.each([
    ["Toyota Camry", ["Toyota Camry (2024 & older)", "Toyota Camry (2025 & newer)"]],
    ["Tesla Model Y", ["Tesla Model Y (2025 & older)", "Tesla Model Y (2026)"]],
    ["Honda Civic", ["Honda Civic (2022 & older)", "Honda Civic (2023 & newer)"]],
    ["Honda Accord", ["Honda Accord (2022 & older)", "Honda Accord (2023 & newer)"]],
    ["Honda CR-V", ["Honda CR-V (2022 & older)", "Honda CR-V (2023 & newer)"]],
  ] as const)("preserves precise, inclusive %s model-year labels", (prefix, labels) => {
    expect(marketFor("DC").vehicles.filter(vehicle => vehicle.model.startsWith(prefix)).map(vehicle => vehicle.model))
      .toEqual(labels);
    for (const label of labels) expect(findLouVehicleRate("DC", label)).toBeDefined();
    expect(findLouVehicleRate("DC", prefix)).toBeUndefined();
  });

  it("preserves Philadelphia Tesla pricing and does not offer Model Y 2026", () => {
    expect(findLouVehicleRate("PHL", "Tesla Model 3"))
      .toMatchObject({ weeklyRate: 449, sourceCell: "I21", effectiveDate: "2026-06-15" });
    expect(findLouVehicleRate("PHL", "Tesla Model Y (2025 & older)"))
      .toMatchObject({ weeklyRate: 499, sourceCell: "I22", effectiveDate: "2026-06-15" });
    expect(findLouVehicleRate("PHL", "Tesla Model Y (2026)")).toBeUndefined();
  });

  it.each(["Toyota Grand Highlander", "Honda HR-V", "Honda Odyssey"])("offers %s only in DC/BWI", model => {
    expect(MARKET_PRICING.filter(market => market.vehicles.some(vehicle => vehicle.model === model))
      .map(market => market.code).sort()).toEqual(["BWI", "DC"]);
    for (const market of WORKBOOK_MARKETS) {
      if (market.code !== "DC" && market.code !== "BWI") {
        expect(findLouVehicleRate(market.code, model)).toBeUndefined();
      }
    }
  });

  it("does not import headings, the tax multiplier, damage, deposits, or ancillary fees", () => {
    const excludedModels = [
      "TOYOTA", "TESLA", "HONDA", "CHEVROLET", "CHRYSLER",
      "Gas vehicles", "Tesla, MY2018–2025", "Tesla, MY2026",
      "Sedan tire — Corolla, Camry, Prius, Model 3",
      "SUV tire — Model Y, midsize SUV, full-size SUV",
      "Rim replacement", "Tire plug", "Base fee", "Per-mile charge", "Hybrid vehicles",
      "Atlanta tax multiplier (applied to base rate):",
    ];
    for (const market of MARKET_PRICING) {
      for (const label of excludedModels) expect(findLouVehicleRate(market.code, label)).toBeUndefined();
      for (const vehicle of market.vehicles) {
        expect(WORKBOOK_ROWS.some(row => `${WORKBOOK_MARKETS.find(item => item.code === market.code)!.column}${row.row}` === vehicle.sourceCell))
          .toBe(true);
        expect(vehicle.weeklyRate).not.toBe(1.0775);
        expect(vehicle).not.toHaveProperty("deposit");
        expect(vehicle).not.toHaveProperty("fees");
      }
    }
    // $500 is a legitimate Grand Highlander rental rate, not grounds for excluding all $500 values.
    expect(findLouVehicleRate("DC", "Toyota Grand Highlander")?.weeklyRate).toBe(500);
  });
});

describe("findLouVehicleRate — safe legacy migration and strict availability", () => {
  const aliases = [
    { alias: "Tesla Model 3 (LR/SR)", canonical: "Tesla Model 3" },
    { alias: "Tesla Model Y (2018–2025)", canonical: "Tesla Model Y (2025 & older)" },
    { alias: "Toyota Corolla", canonical: "Toyota Corolla (Gas & Hybrid)" },
    { alias: "Toyota RAV4 (Gas)", canonical: "Toyota RAV4" },
  ];

  it.each(WORKBOOK_MARKETS.flatMap(market => aliases.map(alias => ({ ...alias, code: market.code }))))(
    "$code migrates only unambiguous legacy $alias to $canonical, respecting local availability", entry => {
      const expected = marketFor(entry.code).vehicles.find(vehicle => vehicle.model === entry.canonical);
      expect(findLouVehicleRate(entry.code, entry.alias)).toBe(expected);
    },
  );

  it.each([
    "Toyota Camry / Honda Accord", "Toyota Camry/Honda Accord", "Toyota Camry",
    "Honda Accord", "Toyota Camry Hybrid", "Honda Civic", "Honda CR-V", "Tesla Model Y",
  ])("does not guess a model year for ambiguous legacy '%s'", label => {
    for (const market of WORKBOOK_MARKETS) expect(findLouVehicleRate(market.code, label)).toBeUndefined();
  });

  it.each(["UNKNOWN", "", "dc", "Washington DC", "__proto__"])("never falls back from unknown market '%s'", code => {
    expect(findLouVehicleRate(code, "Toyota Corolla (Gas & Hybrid)")).toBeUndefined();
    expect(findLouVehicleRate(code, "Toyota Corolla")).toBeUndefined();
  });

  it.each(["Unknown Vehicle", "", "Toyota", "Model 3", "Toyota Camry (2026)", "__proto__"])(
    "never substitutes a default vehicle for unknown model '%s'", model => {
      for (const market of WORKBOOK_MARKETS) expect(findLouVehicleRate(market.code, model)).toBeUndefined();
    },
  );
});

describe("LOU source provenance and user-facing source labels", () => {
  it("identifies the original workbook and Weekly Rates revision without substituting Change Log or Fees", () => {
    expect(LOU_RATE_SOURCE).toEqual({
      filename: "DriveWhip_Rate_Sheet.xlsx",
      worksheet: "Weekly Rates",
      revisionDate: "2026-08-12",
      sha256: "9889f562e5776a6d3ff41edc1347c0053c9c5022eb30b2aaac79ba8ac3fc208f",
      weeklyRatesOnly: true,
    });
  });

  it.each(WORKBOOK_MARKETS)("labels $code with its own source, date, daily conversion, and tax warning", expected => {
    const date = expected.effectiveDate
      ? `Rates effective ${expected.effectiveDate}`
      : "Effective date not supplied";
    expect(louRateSourceLabel(marketFor(expected.code))).toBe(
      `DriveWhip_Rate_Sheet.xlsx · Weekly Rates · ${date}. Daily rate = published weekly rate ÷ 7, rounded to cents.`
      + (expected.code === "ATL" ? ` ${ATL_TAX_NOTE}` : ""),
    );
  });

  it("does not infer Tampa's missing effective date from the overall revision", () => {
    const tampa = marketFor("TPA");
    expect(tampa.effectiveDate).toBeNull();
    expect(tampa.vehicles).toHaveLength(3);
    for (const vehicle of tampa.vehicles) expect(vehicle.effectiveDate).toBeNull();
    expect(louRateSourceLabel(tampa)).toContain("Effective date not supplied");
    expect(louRateSourceLabel(tampa)).not.toContain("2026-08-12");
  });
});
