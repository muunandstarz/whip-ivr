/** Owner-provided DriveWhip_Rate_Sheet.xlsx, Weekly Rates (revision 2026-08-12).
 * Blank / dash cells are unavailable, never zero-priced or inherited from another market.
 * Ancillary fees and historical Change Log values are deliberately not rental rates.
 */
export const LOU_RATE_SOURCE = {
  "filename": "DriveWhip_Rate_Sheet.xlsx",
  "worksheet": "Weekly Rates",
  "revisionDate": "2026-08-12",
  "sha256": "9889f562e5776a6d3ff41edc1347c0053c9c5022eb30b2aaac79ba8ac3fc208f",
  "weeklyRatesOnly": true
} as const;
export interface LouVehicleRate {
  model: string; make: string; weeklyRate: number; dailyRate: number; vehicleClass: string;
  taxIncluded: boolean; sourceCell: string; effectiveDate: string | null;
}
export interface LouMarketPricing {
  code: string; name: string; taxNote: string | null; effectiveDate: string | null;
  sourceName: string; sourceSheet: string; vehicles: LouVehicleRate[];
}
const MARKET_COLUMNS = [
  {
    "code": "DC",
    "name": "Washington DC (Rockville)",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "BWI",
    "name": "Baltimore (Glen Burnie)",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "ATL",
    "name": "Atlanta",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "CHI",
    "name": "Chicago",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "MIA",
    "name": "Miami",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "ORL",
    "name": "Orlando",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "TPA",
    "name": "Tampa",
    "effectiveDate": null
  },
  {
    "code": "PHL",
    "name": "Philadelphia",
    "effectiveDate": "2026-06-15"
  },
  {
    "code": "RIC",
    "name": "Richmond",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "BOS",
    "name": "Boston",
    "effectiveDate": "2026-08-12"
  },
  {
    "code": "DAL",
    "name": "Dallas",
    "effectiveDate": "2026-04-01"
  }
] as const;
const VEHICLE_ROWS: Array<{ model: string; make: string; weeklyRates: Array<number | null> }> = [
  {
    "model": "Toyota Corolla (Gas & Hybrid)",
    "make": "Toyota",
    "weeklyRates": [
      399.0,
      399.0,
      429.92,
      399.0,
      399.0,
      399.0,
      null,
      399.0,
      399.0,
      399.0,
      399.0
    ]
  },
  {
    "model": "Toyota Corolla Cross",
    "make": "Toyota",
    "weeklyRates": [
      399.0,
      399.0,
      429.92,
      399.0,
      399.0,
      399.0,
      null,
      399.0,
      399.0,
      399.0,
      399.0
    ]
  },
  {
    "model": "Toyota C-HR",
    "make": "Toyota",
    "weeklyRates": [
      350.0,
      350.0,
      377.13,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Toyota Camry (2024 & older)",
    "make": "Toyota",
    "weeklyRates": [
      399.0,
      399.0,
      429.92,
      399.0,
      399.0,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Toyota Camry (2025 & newer)",
    "make": "Toyota",
    "weeklyRates": [
      429.0,
      429.0,
      462.25,
      429.0,
      429.0,
      429.0,
      null,
      429.0,
      429.0,
      429.0,
      429.0
    ]
  },
  {
    "model": "Toyota Prius Hybrid / Crown",
    "make": "Toyota",
    "weeklyRates": [
      400.0,
      400.0,
      431.0,
      400.0,
      400.0,
      400.0,
      null,
      400.0,
      400.0,
      400.0,
      400.0
    ]
  },
  {
    "model": "Toyota RAV4",
    "make": "Toyota",
    "weeklyRates": [
      449.0,
      449.0,
      483.8,
      449.0,
      449.0,
      449.0,
      null,
      449.0,
      449.0,
      449.0,
      449.0
    ]
  },
  {
    "model": "Toyota Venza Hybrid",
    "make": "Toyota",
    "weeklyRates": [
      450.0,
      450.0,
      484.88,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Toyota Highlander",
    "make": "Toyota",
    "weeklyRates": [
      450.0,
      450.0,
      484.88,
      450.0,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Toyota Highlander Hybrid",
    "make": "Toyota",
    "weeklyRates": [
      475.0,
      475.0,
      511.81,
      475.0,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Toyota Grand Highlander",
    "make": "Toyota",
    "weeklyRates": [
      500.0,
      500.0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Toyota Sienna Hybrid",
    "make": "Toyota",
    "weeklyRates": [
      549.0,
      549.0,
      591.55,
      549.0,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Tesla Model 3",
    "make": "Tesla",
    "weeklyRates": [
      429.0,
      429.0,
      462.25,
      429.0,
      399.0,
      399.0,
      399.0,
      449.0,
      429.0,
      429.0,
      399.0
    ]
  },
  {
    "model": "Tesla Model Y (2025 & older)",
    "make": "Tesla",
    "weeklyRates": [
      449.0,
      449.0,
      483.8,
      449.0,
      449.0,
      449.0,
      449.0,
      499.0,
      449.0,
      449.0,
      449.0
    ]
  },
  {
    "model": "Tesla Model Y (2026)",
    "make": "Tesla",
    "weeklyRates": [
      550.0,
      550.0,
      592.63,
      550.0,
      499.0,
      499.0,
      499.0,
      null,
      550.0,
      550.0,
      499.0
    ]
  },
  {
    "model": "Honda Civic (2022 & older)",
    "make": "Honda",
    "weeklyRates": [
      350.0,
      350.0,
      377.13,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Honda Civic (2023 & newer)",
    "make": "Honda",
    "weeklyRates": [
      399.0,
      399.0,
      429.92,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Honda Accord (2022 & older)",
    "make": "Honda",
    "weeklyRates": [
      399.0,
      399.0,
      429.92,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Honda Accord (2023 & newer)",
    "make": "Honda",
    "weeklyRates": [
      429.0,
      429.0,
      462.25,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Honda CR-V (2022 & older)",
    "make": "Honda",
    "weeklyRates": [
      375.0,
      375.0,
      404.06,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Honda CR-V (2023 & newer)",
    "make": "Honda",
    "weeklyRates": [
      449.0,
      449.0,
      483.8,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Honda HR-V",
    "make": "Honda",
    "weeklyRates": [
      400.0,
      400.0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Honda Odyssey",
    "make": "Honda",
    "weeklyRates": [
      549.0,
      549.0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Chevrolet Malibu",
    "make": "Chevrolet",
    "weeklyRates": [
      399.0,
      399.0,
      429.92,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ]
  },
  {
    "model": "Chrysler Pacifica",
    "make": "Chrysler",
    "weeklyRates": [
      499.0,
      499.0,
      537.67,
      499.0,
      499.0,
      null,
      null,
      null,
      null,
      499.0,
      null
    ]
  },
  {
    "model": "Chrysler Voyager",
    "make": "Chrysler",
    "weeklyRates": [
      499.0,
      499.0,
      537.67,
      499.0,
      499.0,
      null,
      null,
      null,
      null,
      499.0,
      null
    ]
  }
];

export const MARKET_PRICING: LouMarketPricing[] = MARKET_COLUMNS.map((market, column) => ({
  ...market,
  taxNote: market.code === "ATL" ? "Published weekly rates already include 7.75% Georgia sales tax; do not add it again." : null,
  sourceName: LOU_RATE_SOURCE.filename, sourceSheet: LOU_RATE_SOURCE.worksheet,
  vehicles: VEHICLE_ROWS.flatMap((vehicle, index) => {
    const weeklyRate = vehicle.weeklyRates[column];
    if (weeklyRate === null) return [];
    return [{ model: vehicle.model, make: vehicle.make, vehicleClass: vehicle.model,
      weeklyRate, dailyRate: Number((weeklyRate / 7).toFixed(2)), taxIncluded: market.code === "ATL",
      sourceCell: `${String.fromCharCode(66 + column)}${[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32, 34, 36, 37][index]}`, effectiveDate: market.effectiveDate,
    }];
  }),
}));

/** Only unambiguous renamed labels migrate. Year-split/combined legacy models need a new selection. */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "Tesla Model 3 (LR/SR)": "Tesla Model 3",
  "Tesla Model Y (2018–2025)": "Tesla Model Y (2025 & older)",
  "Toyota Corolla": "Toyota Corolla (Gas & Hybrid)",
  "Toyota RAV4 (Gas)": "Toyota RAV4",
};
export function findLouVehicleRate(marketCode: string, model: string): LouVehicleRate | undefined {
  const canonical = LEGACY_MODEL_ALIASES[model] ?? model;
  return MARKET_PRICING.find(m => m.code === marketCode)?.vehicles.find(v => v.model === canonical);
}
export function louRateSourceLabel(market: Pick<LouMarketPricing, "sourceName" | "sourceSheet" | "effectiveDate" | "taxNote">): string {
  return `${market.sourceName} · ${market.sourceSheet} · ${market.effectiveDate ? `Rates effective ${market.effectiveDate}` : "Effective date not supplied"}. Daily rate = published weekly rate ÷ 7, rounded to cents.${market.taxNote ? ` ${market.taxNote}` : ""}`;
}
