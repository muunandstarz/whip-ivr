import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/LossIntakeDispatch.tsx"), "utf8");

describe("Loss Intake Dispatch page", () => {
  it("renders one shared Intake queue without any processor view", () => {
    expect(page).toContain("Loss Intake Dispatch");
    expect(page).toContain("One live queue for Ana, Bennet, and Carlito");
    expect(page).toContain("Claim item");
    expect(page).not.toContain("LossIntakeProcessorQueue");
    expect(page).not.toContain("File with the information available");
  });

  it("makes the call-plan source and order visible", () => {
    expect(page).toContain("confirmed in-office arrivals, today’s inspections, past-SLA no-statement items, then oldest");
    expect(page).toContain("Slack store-operations posts or branch photos establish an in-office arrival");
    expect(page).toContain("Market tabs only document inspection scheduling");
  });

  it("uses live queue, Tracker, and productivity procedures", () => {
    expect(page).toContain("lossIntake.workQueue.list");
    expect(page).toContain("lossIntake.claimsTrackerStatus");
    expect(page).toContain("lossIntake.workQueue.dailyMetrics");
    expect(page).toContain("refetchInterval: 30_000");
  });
});
