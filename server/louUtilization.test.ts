import { describe, expect, it } from "vitest";
import { formatReportedUtilization, resolveUtilizationRows } from "./louUtilization";

describe("Loss of Use utilization evidence", () => {
  const data = {
    monthly_data: {
      "2026-09-30": {
        month: "September 2026",
        markets: [
          { code: "RCK", available: 10, rented: 739, total: 749, utilization: 98.7 },
        ],
      },
    },
  };

  it("uses the source-reported Occupancy/Utilization percentage instead of deriving a rate from an incompatible field", () => {
    const rows = resolveUtilizationRows(data, {
      marketCode: "DC",
      dataCode: "RCK",
      dropOff: "2026-09-14",
      pickUp: "2026-09-16",
    });

    expect(rows).toEqual([
      expect.objectContaining({ fleet: 749, rented: 739, available: 10, utilization: 98.7, sourceMonth: "September 2026", dataStatus: "reported" }),
      expect.objectContaining({ fleet: 749, rented: 739, available: 10, utilization: 98.7, sourceMonth: "September 2026", dataStatus: "reported" }),
    ]);
    expect(formatReportedUtilization(rows[0]!.utilization)).toBe("98.7%");
    expect(formatReportedUtilization(10_000)).toBe("—");
  });

  it("labels a future repair range with the latest available report rather than presenting it as a contemporaneous daily rate", () => {
    const [row] = resolveUtilizationRows(data, {
      marketCode: "DC",
      dataCode: "RCK",
      dropOff: "2026-10-01",
      pickUp: "2026-10-02",
    });

    expect(row).toMatchObject({ available: 10, utilization: 98.7, sourceMonth: "September 2026", dataStatus: "latest_available", isLatestAvailableFallback: true });
  });

  it("does not invent a historical utilization rate where the source report has no matching month", () => {
    const [row] = resolveUtilizationRows(data, {
      marketCode: "DC",
      dataCode: "RCK",
      dropOff: "2026-08-01",
      pickUp: "2026-08-02",
    });

    expect(row).toMatchObject({ available: 0, utilization: 0, sourceMonth: null, dataStatus: "unavailable", isLatestAvailableFallback: false });
  });
});
