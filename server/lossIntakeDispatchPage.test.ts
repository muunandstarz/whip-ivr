import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/LossIntakeDispatch.tsx"), "utf8");

describe("Loss Intake Dispatch page", () => {
  it("replaces the legacy monitor with separate dispatch, filing-verification, and QA views", () => {
    expect(page).toContain("Loss Intake Dispatch");
    expect(page).toContain("Intake follow-up");
    expect(page).toContain("Unfiled claims");
    expect(page).toContain("SLA & data quality");
  });

  it("keeps the two approved claims channels and in-office response rule visible", () => {
    expect(page).toContain("#claims-remotemarkets");
    expect(page).toContain("10-minute attempt target");
    expect(page).toContain("Remote-market reports are evaluated");
  });
});
