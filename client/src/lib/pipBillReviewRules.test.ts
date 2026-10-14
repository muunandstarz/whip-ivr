import { describe, expect, it } from "vitest";
import { reviewPipBills, type PipBillLine, type PipReviewInput } from "./pipBillReviewRules";

const line = (patch: Partial<PipBillLine> = {}): PipBillLine => ({
  id: "line-1", provider: "Test Provider", providerType: "therapy", dos: "2026-07-01", pos: "11", cpt: "97110", modifier: "", units: 1, billed: 100, dxPointer: "1", ...patch,
});
const review = (input: Partial<PipReviewInput>) => reviewPipBills({
  state: "PA", locality: "01", pipLimit: 5000, pipUsed: 0, emcStatus: "yes", cobStatus: "none", lines: [line()], ...input,
});

describe("PIP bill review rules", () => {
  it("applies Pennsylvania Act 6 at 110% of Medicare", () => {
    const result = review({ state: "PA", locality: "01" });
    expect(result.lines[0]?.allowed).toBe(35.42);
    expect(result.lines[0]?.reason).toContain("Act 6");
  });

  it("applies Maryland's reasonableness benchmark instead of a fee schedule", () => {
    const result = review({ state: "MD", locality: "01", lines: [line({ billed: 100 })] });
    expect(result.lines[0]?.allowed).toBe(82.25);
    expect(result.flags.some((flag) => flag.title.includes("MD reasonableness"))).toBe(true);
  });

  it("applies Florida's 80% of 200% Medicare calculation and surfaces the 14-day rule", () => {
    const result = review({ state: "FL", locality: "MIA", dateOfLoss: "2026-06-01", emcStatus: "no", pipLimit: 2500, lines: [line({ dos: "2026-06-20" })] });
    expect(result.lines[0]?.allowed).toBe(56.4);
    expect(result.flags.some((flag) => flag.title.includes("14-day"))).toBe(true);
    expect(result.flags.some((flag) => flag.title.includes("no EMC"))).toBe(true);
  });

  it("applies Massachusetts WC schedule and documents health-insurance coordination", () => {
    const result = review({ state: "MA", locality: "STATE", cobStatus: "primary" });
    expect(result.lines[0]?.allowed).toBe(38.3);
    expect(result.flags.some((flag) => flag.title.includes("MA coordination"))).toBe(true);
  });

  it("applies the remaining PIP balance and keeps the line-level reason", () => {
    const result = review({ pipLimit: 20, lines: [line({ billed: 100 })] });
    expect(result.lines[0]?.allowed).toBe(20);
    expect(result.lines[0]?.reason).toContain("PIP partial");
    expect(result.pipRemaining).toBe(0);
  });
});
