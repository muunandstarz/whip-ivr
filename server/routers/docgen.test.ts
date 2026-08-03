import { describe, it, expect } from "vitest";
import { docgenRouter } from "./docgen";

describe("docgenRouter", () => {
  it("exposes all four AI procedures", () => {
    const procedures = Object.keys(docgenRouter._def.procedures);
    expect(procedures).toContain("improveWithAI");
    expect(procedures).toContain("generateRebuttal");
    expect(procedures).toContain("polishRebuttal");
    expect(procedures).toContain("generateSettlementEmail");
  });

  it("improveWithAI input schema rejects short body", async () => {
    const schema = (docgenRouter._def.procedures.improveWithAI as any)._def.inputs[0];
    const result = schema.safeParse({ body: "hi" });
    expect(result.success).toBe(false);
  });

  it("generateRebuttal input schema accepts valid input", async () => {
    const schema = (docgenRouter._def.procedures.generateRebuttal as any)._def.inputs[0];
    const result = schema.safeParse({
      claimNumber: "PF123456",
      vehicle: "2024 Toyota Camry",
      dateOfLoss: "2024-01-15",
      carrier: "GEICO",
      adjuster: "Jane Smith",
      lineItems: [{ item: "Labor", ours: 500, theirs: 300, reason: "Betterment" }],
    });
    expect(result.success).toBe(true);
  });

  it("generateSettlementEmail input schema accepts bi type", async () => {
    const schema = (docgenRouter._def.procedures.generateSettlementEmail as any)._def.inputs[0];
    const result = schema.safeParse({
      type: "bi",
      claimantName: "John Doe",
      claimNumber: "PF123456",
      dateOfLoss: "2024-01-15",
      settlementAmount: "5000",
      adjusterName: "Jane Smith",
    });
    expect(result.success).toBe(true);
  });
});
