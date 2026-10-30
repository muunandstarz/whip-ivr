import { describe, expect, it } from "vitest";
import {
  TESLA_OEM_PROCEDURE_SOURCE_SEEDS,
  describeTeslaCoverageGap,
  normalizeTeslaModel,
  sourceMatchesTeslaVehicle,
} from "./oemEvidenceLibrary";

describe("Tesla OEM evidence library", () => {
  it("contains only four official collision-procedure family indexes and no guessed topic pages", () => {
    const official = TESLA_OEM_PROCEDURE_SOURCE_SEEDS.filter((source) => source.sourceKind === "official_collision_procedure");
    expect(official).toHaveLength(4);
    expect(official.map((source) => source.sourceKey).sort()).toEqual([
      "tesla-m3-2017-2023-collision-index",
      "tesla-m3-2024-plus-collision-index",
      "tesla-my-2020-2024-collision-index",
      "tesla-my-2025-plus-collision-index",
    ]);
    expect(official.every((source) => source.sourceUrl?.endsWith("/index.html"))).toBe(true);
    expect(official.every((source) => source.topic === "Collision repair procedure family index")).toBe(true);
  });

  it("records supplied owner manuals as non-exportable reference metadata only", () => {
    const ownerReferences = TESLA_OEM_PROCEDURE_SOURCE_SEEDS.filter((source) => source.sourceKind === "owner_manual_reference");
    expect(ownerReferences).toHaveLength(4);
    expect(ownerReferences.every((source) => source.status === "reference_only")).toBe(true);
    expect(ownerReferences.every((source) => source.exportAllowed === false && source.sourceUrl === null)).toBe(true);
    expect(ownerReferences.every((source) => source.relevanceNote.includes("not retained"))).toBe(true);
  });

  it("matches only the exact confirmed Tesla year/model family", () => {
    const m3Old = TESLA_OEM_PROCEDURE_SOURCE_SEEDS.find((source) => source.sourceKey === "tesla-m3-2017-2023-collision-index")!;
    const m3New = TESLA_OEM_PROCEDURE_SOURCE_SEEDS.find((source) => source.sourceKey === "tesla-m3-2024-plus-collision-index")!;
    const myOld = TESLA_OEM_PROCEDURE_SOURCE_SEEDS.find((source) => source.sourceKey === "tesla-my-2020-2024-collision-index")!;
    const myNew = TESLA_OEM_PROCEDURE_SOURCE_SEEDS.find((source) => source.sourceKey === "tesla-my-2025-plus-collision-index")!;

    expect(sourceMatchesTeslaVehicle(m3Old, 2023, "Tesla", "Model 3")).toBe(true);
    expect(sourceMatchesTeslaVehicle(m3Old, 2024, "Tesla", "Model 3")).toBe(false);
    expect(sourceMatchesTeslaVehicle(m3New, 2024, "Tesla", "M3")).toBe(true);
    expect(sourceMatchesTeslaVehicle(myOld, 2024, "Tesla", "Model Y")).toBe(true);
    expect(sourceMatchesTeslaVehicle(myOld, 2025, "Tesla", "Model Y")).toBe(false);
    expect(sourceMatchesTeslaVehicle(myNew, 2025, "Tesla", "MY")).toBe(true);
    expect(sourceMatchesTeslaVehicle(myNew, 2025, "Tesla", "Model 3")).toBe(false);
  });

  it("forces exception review where the library cannot support an exact family", () => {
    expect(normalizeTeslaModel("Model S")).toBeNull();
    expect(describeTeslaCoverageGap(2019, "Model Y")).toContain("No Model Y");
    expect(describeTeslaCoverageGap(2025, "Model S")).toContain("limited to Model 3 and Model Y");
    expect(describeTeslaCoverageGap(2026, "Model Y")).toBeNull();
  });
});
