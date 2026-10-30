export type OemSourceKind = "official_collision_procedure" | "owner_manual_reference" | "pending";
export type OemSourceStatus = "active" | "reference_only" | "pending" | "retired";
export type TeslaModelKey = "model_3" | "model_y";

export type OemProcedureSourceSeed = {
  sourceKey: string;
  manufacturer: string;
  make: string;
  modelKey: TeslaModelKey | null;
  modelLabel: string;
  modelYearStart: number | null;
  modelYearEnd: number | null;
  sourceKind: OemSourceKind;
  title: string;
  publisher: string;
  sourceUrl: string | null;
  revisionDisplay: string;
  accessedOn: string;
  topic: string;
  relevanceNote: string;
  status: OemSourceStatus;
  exportAllowed: boolean;
  termsUrl: string | null;
  termsNote: string;
};

const TESLA_ACCESS_DATE = "2026-10-30";
const TESLA_TERMS_NOTE = "Link-out metadata only. Do not bulk-download, mirror, cache, screenshot, or reproduce Tesla source content. A handler must verify the live source and identify a case-specific marked exhibit before relying on it.";
const TESLA_SERVICE_TERMS_URL = "https://www.tesla.com/legal";

function collisionFamilySources(input: {
  keyPrefix: string;
  modelKey: TeslaModelKey;
  modelLabel: string;
  from: number;
  to: number | null;
  baseUrl: string;
}): OemProcedureSourceSeed[] {
  const range = input.to ? `${input.from}–${input.to}` : `${input.from}+`;
  return [
    {
      sourceKey: `${input.keyPrefix}-collision-index`,
      manufacturer: "Tesla",
      make: "Tesla",
      modelKey: input.modelKey,
      modelLabel: input.modelLabel,
      modelYearStart: input.from,
      modelYearEnd: input.to,
      sourceKind: "official_collision_procedure",
      title: `${range} ${input.modelLabel} Collision Repair Procedures`,
      publisher: "Tesla Service",
      sourceUrl: `${input.baseUrl}/index.html`,
      revisionDisplay: "Tesla Service page © 2026; live source verified 2026-10-30",
      accessedOn: TESLA_ACCESS_DATE,
      topic: "Collision repair procedure family index",
      relevanceNote: "Use only after the handler confirms the vehicle year/model family and identifies a case-specific marked procedure exhibit. The index itself does not establish a repair operation.",
      status: "active",
      exportAllowed: true,
      termsUrl: TESLA_SERVICE_TERMS_URL,
      termsNote: TESLA_TERMS_NOTE,
    },
  ];
}

function ownerManualReference(input: {
  key: string;
  modelKey: TeslaModelKey;
  modelLabel: string;
  from: number;
  to: number | null;
}): OemProcedureSourceSeed {
  const range = input.to ? `${input.from}–${input.to}` : `${input.from}+`;
  return {
    sourceKey: input.key,
    manufacturer: "Tesla",
    make: "Tesla",
    modelKey: input.modelKey,
    modelLabel: input.modelLabel,
    modelYearStart: input.from,
    modelYearEnd: input.to,
    sourceKind: "owner_manual_reference",
    title: `${range} ${input.modelLabel} Owner's Manual — user-provided reference, not retained`,
    publisher: "Tesla / user-provided copy",
    sourceUrl: null,
    revisionDisplay: "North America; software 2026.38.3; supplied 2026-10-30",
    accessedOn: TESLA_ACCESS_DATE,
    topic: "Owner-facing operational and safety context",
    relevanceNote: "Reference-only. This owner manual is not retained, exported, quoted, or used to state collision repair methodology. Use the live collision-procedure family plus marked case evidence for any repair-operation support.",
    status: "reference_only",
    exportAllowed: false,
    termsUrl: TESLA_SERVICE_TERMS_URL,
    termsNote: "User-provided owner-manual PDFs are not copied into this application, database, project, storage, or exports.",
  };
}

/**
 * Citation metadata only. This catalog intentionally contains no PDF bytes,
 * manual text, screenshots, storage keys, cached Tesla content, or excerpts.
 */
export const TESLA_OEM_PROCEDURE_SOURCE_SEEDS: OemProcedureSourceSeed[] = [
  ...collisionFamilySources({
    keyPrefix: "tesla-m3-2017-2023",
    modelKey: "model_3",
    modelLabel: "Model 3",
    from: 2017,
    to: 2023,
    baseUrl: "https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_3/HTML/en-us",
  }),
  ...collisionFamilySources({
    keyPrefix: "tesla-m3-2024-plus",
    modelKey: "model_3",
    modelLabel: "Model 3",
    from: 2024,
    to: null,
    baseUrl: "https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_3_2024/HTML/en-us",
  }),
  ...collisionFamilySources({
    keyPrefix: "tesla-my-2020-2024",
    modelKey: "model_y",
    modelLabel: "Model Y",
    from: 2020,
    to: 2024,
    baseUrl: "https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_Y/HTML/en-us",
  }),
  ...collisionFamilySources({
    keyPrefix: "tesla-my-2025-plus",
    modelKey: "model_y",
    modelLabel: "Model Y",
    from: 2025,
    to: null,
    baseUrl: "https://service.tesla.com/docs/BodyRepair/Body_Repair_Procedures/Model_Y_2025/en-us",
  }),
  ownerManualReference({ key: "tesla-m3-2017-2023-owner-reference", modelKey: "model_3", modelLabel: "Model 3", from: 2017, to: 2023 }),
  ownerManualReference({ key: "tesla-m3-2024-plus-owner-reference", modelKey: "model_3", modelLabel: "Model 3", from: 2024, to: null }),
  ownerManualReference({ key: "tesla-my-2020-2024-owner-reference", modelKey: "model_y", modelLabel: "Model Y", from: 2020, to: 2024 }),
  ownerManualReference({ key: "tesla-my-2025-plus-owner-reference", modelKey: "model_y", modelLabel: "Model Y", from: 2025, to: null }),
];

export function normalizeTeslaModel(value: string): TeslaModelKey | null {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "model3" || normalized === "m3") return "model_3";
  if (normalized === "modely" || normalized === "my") return "model_y";
  return null;
}

export function sourceMatchesTeslaVehicle(
  source: {
    manufacturer: string;
    modelKey: string | null;
    modelYearStart: number | null;
    modelYearEnd: number | null;
    sourceKind: string;
    status: string;
  },
  vehicleYear: number,
  vehicleMake: string,
  vehicleModel: string,
): boolean {
  const modelKey = normalizeTeslaModel(vehicleModel);
  return source.manufacturer === "Tesla"
    && source.sourceKind === "official_collision_procedure"
    && source.status === "active"
    && vehicleMake.trim().toLowerCase() === "tesla"
    && source.modelKey === modelKey
    && source.modelYearStart !== null
    && vehicleYear >= source.modelYearStart
    && (source.modelYearEnd === null || vehicleYear <= source.modelYearEnd);
}

export function describeTeslaCoverageGap(vehicleYear: number, vehicleModel: string): string | null {
  const model = normalizeTeslaModel(vehicleModel);
  if (!model) return "Tesla source coverage is currently limited to Model 3 and Model Y. Confirm the vehicle and route an unsupported model for source review.";
  if (!Number.isInteger(vehicleYear) || vehicleYear < 2017 || vehicleYear > 2100) return "Enter a confirmed four-digit vehicle year before selecting a Tesla procedure family.";
  if (model === "model_y" && vehicleYear < 2020) return "No Model Y collision-procedure family is registered for this year. Do not use the 2020–2024 or 2025+ records by assumption.";
  return null;
}
