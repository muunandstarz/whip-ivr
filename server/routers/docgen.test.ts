import { describe, it, expect } from "vitest";
import { docgenRouter, parseJsonObject } from "./docgen";

describe("docgenRouter", () => {
  it("exposes all Document Generator AI procedures", () => {
    const procedures = Object.keys(docgenRouter._def.procedures);
    expect(procedures).toContain("improveWithAI");
    expect(procedures).toContain("generateRebuttal");
    expect(procedures).toContain("polishRebuttal");
    expect(procedures).toContain("generateSettlementEmail");
    expect(procedures).toContain("parseEstimate");
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

  it("parseEstimate input schema accepts a securely hosted estimate and rejects malformed URLs", () => {
    const schema = (docgenRouter._def.procedures.parseEstimate as any)._def.inputs[0];
    expect(schema.safeParse({
      fileUrl: "https://files.example.com/estimates/repair.pdf",
      fileName: "repair-estimate.pdf",
    }).success).toBe(true);
    expect(schema.safeParse({ fileUrl: "not-a-url" }).success).toBe(false);
  });

  it("extracts model JSON whether it is bare, fenced, or surrounded by explanatory text", () => {
    expect(parseJsonObject('{"repairTotal":"1234.56","lineItems":[]}')).toMatchObject({ repairTotal: "1234.56" });
    expect(parseJsonObject('```json\n{"repairTotal":"1234.56","lineItems":[]}\n```')).toMatchObject({ repairTotal: "1234.56" });
    expect(parseJsonObject('Structured estimate follows: {"repairTotal":"1234.56","lineItems":[]}')).toMatchObject({ repairTotal: "1234.56" });
  });

  it("requests a strict repair-estimate output schema instead of relying on freeform model prose", () => {
    const source = require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), "server/routers/docgen.ts"), "utf8");
    expect(source).toContain('name: "repair_estimate"');
    expect(source).toContain('strict: true');
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
