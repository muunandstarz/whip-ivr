export type UtilizationMarket = {
  code: string;
  name?: string;
  available?: number;
  rented?: number;
  total?: number;
  utilization?: number;
};

type UtilizationMonth = {
  month?: string;
  markets?: UtilizationMarket[];
};

export type UtilizationDataset = {
  monthly_data?: Record<string, UtilizationMonth>;
};

export type ResolvedUtilizationRow = {
  date: string;
  fleet: number;
  rented: number;
  utilization: number;
  sourceMonth: string | null;
  isLatestAvailableFallback: boolean;
  dataStatus: "reported" | "latest_available" | "unavailable";
};

function calendarDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function monthKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function reportedPercent(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return percent >= 0 && percent <= 100 ? Number(percent.toFixed(1)) : 0;
}

/**
 * Resolves each calendar repair day to a reported monthly market snapshot.
 *
 * The workbook's Occupancy/Utilization field is canonical.  We intentionally
 * do not compute a percentage from the `available` (unrented vehicle) column:
 * its denominator differs from the source's Available Fleet denominator and
 * was the cause of impossible 10,000% document values.
 */
export function resolveUtilizationRows(
  data: UtilizationDataset,
  input: { marketCode: string; dataCode: string; dropOff: string; pickUp: string },
): ResolvedUtilizationRow[] {
  const monthlyData = data.monthly_data ?? {};
  const sortedKeys = Object.keys(monthlyData).sort();
  if (!sortedKeys.length) return [];

  const start = calendarDate(input.dropOff);
  const end = calendarDate(input.pickUp);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return [];

  const latestKey = sortedKeys[sortedKeys.length - 1]!;
  const latestDate = calendarDate(latestKey);
  const rows: ResolvedUtilizationRow[] = [];
  const current = new Date(start);

  while (current < end) {
    const date = current.toISOString().slice(0, 10);
    const exactKey = sortedKeys.find((key) => key.startsWith(monthKeyFor(current)));
    // The app may be used after the last published utilization report. Use the
    // most recent available reported month only for future dates, and label it
    // as such in the UI/PDF. Historical gaps remain unavailable rather than
    // being represented as current data.
    const selectedKey = exactKey ?? (current > latestDate ? latestKey : undefined);
    const monthData = selectedKey ? monthlyData[selectedKey] : undefined;
    const market = monthData?.markets?.find((entry) => entry.code === input.dataCode);

    if (selectedKey && market) {
      rows.push({
        date,
        fleet: Number(market.total) || 0,
        rented: Number(market.rented) || 0,
        utilization: reportedPercent(market.utilization),
        sourceMonth: monthData?.month ?? selectedKey,
        isLatestAvailableFallback: !exactKey,
        dataStatus: exactKey ? "reported" : "latest_available",
      });
    } else {
      rows.push({
        date,
        fleet: 0,
        rented: 0,
        utilization: 0,
        sourceMonth: null,
        isLatestAvailableFallback: false,
        dataStatus: "unavailable",
      });
    }
    current.setDate(current.getDate() + 1);
  }
  return rows;
}

export function formatReportedUtilization(value: number): string {
  return value > 0 && value <= 100 ? `${value.toFixed(1)}%` : "—";
}
