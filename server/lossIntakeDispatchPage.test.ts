import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/LossIntakeDispatch.tsx"), "utf8");

describe("Loss Intake Dispatch page", () => {
  it("separates the Intake and dedicated Processors queues", () => {
    expect(page).toContain("Loss Intake Dispatch");
    expect(page).toContain("Two independent queues");
    expect(page).toContain("Processors");
    expect(page).toContain("LossIntakeProcessorQueue");
  });

  it("keeps Slack arrival evidence and scheduling-only market rules visible", () => {
    expect(page).toContain("Store Operations Slack post");
    expect(page).toContain("Market tabs are scheduling only");
    expect(page).toContain("10-minute attempt target");
  });

  it("shows the binary read-only filed source and never renders a blank SLA target", () => {
    expect(page).toContain("claimsTrackerStatus");
    expect(page).toContain("All Reported IncidentsStatus");
    expect(page).toContain("blank Claim File link does not change filed status");
    expect(page).toContain("dispatchTargetLabel(claim)");
  });
});
