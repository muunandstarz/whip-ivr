import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFParse } from "pdf-parse";
import { invokeLLM } from "./_core/llm";

const execFileAsync = promisify(execFile);

type LlmResult = Awaited<ReturnType<typeof invokeLLM>>;

type UploadKind = "ourEstimate" | "supportingEvidence" | "carrierResponse";

type RebuttalUpload = {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  kind: UploadKind;
};

export type RebuttalEstimateAnalysis = {
  repairTotal: string;
  vehicle: string;
  vin: string;
  claimNumber: string;
  claimNumberRole: "our" | "adverse" | "unknown";
  dateOfLoss: string;
  repairFacility: string;
  repairFacilityLocation: string;
  roNumber: string;
  estimateDate: string;
  claimantName: string;
  lineItems: Array<{ description: string; amount: string; estimateLine: string }>;
};

export type RebuttalCarrierAnalysis = {
  carrierName: string;
  carrierClaimNumber: string;
  adjusterName: string;
  estimateDate: string;
  offerTotal: string;
  denialReasons: string;
  lineItems: Array<{ description: string; offer: string; reason: string; estimateLine: string }>;
};

export type RebuttalEvidenceSuggestion = {
  title: string;
  source: string;
  revisionDate: string;
  markedPage: string;
  note: string;
};

export type CarrierRebuttalAnalysisResult = {
  estimate?: RebuttalEstimateAnalysis;
  carrier?: RebuttalCarrierAnalysis;
  evidenceSuggestions: RebuttalEvidenceSuggestion[];
  warnings: string[];
};

const estimateSchema = {
  type: "object",
  properties: {
    repairTotal: { type: "string" },
    vehicle: { type: "string" },
    vin: { type: "string" },
    claimNumber: { type: "string" },
    claimNumberRole: { type: "string", enum: ["our", "adverse", "unknown"] },
    dateOfLoss: { type: "string" },
    repairFacility: { type: "string" },
    repairFacilityLocation: { type: "string" },
    roNumber: { type: "string" },
    estimateDate: { type: "string" },
    claimantName: { type: "string" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          amount: { type: "string" },
          estimateLine: { type: "string" },
        },
        required: ["description", "amount", "estimateLine"],
        additionalProperties: false,
      },
    },
  },
  required: ["repairTotal", "vehicle", "vin", "claimNumber", "claimNumberRole", "dateOfLoss", "repairFacility", "repairFacilityLocation", "roNumber", "estimateDate", "claimantName", "lineItems"],
  additionalProperties: false,
} as const;

const carrierSchema = {
  type: "object",
  properties: {
    carrierName: { type: "string" },
    carrierClaimNumber: { type: "string" },
    adjusterName: { type: "string" },
    estimateDate: { type: "string" },
    offerTotal: { type: "string" },
    denialReasons: { type: "string" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          offer: { type: "string" },
          reason: { type: "string" },
          estimateLine: { type: "string" },
        },
        required: ["description", "offer", "reason", "estimateLine"],
        additionalProperties: false,
      },
    },
  },
  required: ["carrierName", "carrierClaimNumber", "adjusterName", "estimateDate", "offerTotal", "denialReasons", "lineItems"],
  additionalProperties: false,
} as const;

const evidenceSchema = {
  type: "object",
  properties: {
    evidenceSuggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          source: { type: "string" },
          revisionDate: { type: "string" },
          markedPage: { type: "string" },
          note: { type: "string" },
        },
        required: ["title", "source", "revisionDate", "markedPage", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["evidenceSuggestions"],
  additionalProperties: false,
} as const;

function extractText(result: LlmResult): string {
  const message = result.choices?.[0]?.message as (LlmResult["choices"][number]["message"] & { parsed?: unknown }) | undefined;
  if (typeof message?.content === "string") return message.content.trim();
  if (Array.isArray(message?.content)) {
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("")
      .trim();
    if (text) return text;
  }
  return message?.parsed && typeof message.parsed === "object" ? JSON.stringify(message.parsed) : "";
}

function parseObject(result: LlmResult): Record<string, unknown> | null {
  const raw = extractText(result).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, limit: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, limit);
}

function amount(value: unknown): string {
  const normalized = cleanText(value, 80).replace(/[^0-9.-]/g, "");
  return normalized && Number.isFinite(Number(normalized)) ? Number(normalized).toFixed(2) : "";
}

function isoDate(value: unknown): string {
  const text = cleanText(value, 30);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeEstimate(parsed: Record<string, unknown>): RebuttalEstimateAnalysis {
  const rawLines = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
  const claimNumberRole = cleanText(parsed.claimNumberRole, 20);
  return {
    repairTotal: amount(parsed.repairTotal),
    vehicle: cleanText(parsed.vehicle, 180),
    vin: cleanText(parsed.vin, 32).toUpperCase(),
    claimNumber: cleanText(parsed.claimNumber, 100),
    claimNumberRole: claimNumberRole === "our" || claimNumberRole === "adverse" ? claimNumberRole : "unknown",
    dateOfLoss: isoDate(parsed.dateOfLoss),
    repairFacility: cleanText(parsed.repairFacility, 180),
    repairFacilityLocation: cleanText(parsed.repairFacilityLocation, 200),
    roNumber: cleanText(parsed.roNumber, 100),
    estimateDate: isoDate(parsed.estimateDate),
    claimantName: cleanText(parsed.claimantName, 180),
    lineItems: rawLines.reduce<RebuttalEstimateAnalysis["lineItems"]>((rows, row) => {
      if (!row || typeof row !== "object") return rows;
      const value = row as Record<string, unknown>;
      const description = cleanText(value.description, 220);
      const itemAmount = amount(value.amount);
      const estimateLine = cleanText(value.estimateLine, 80);
      if (description || itemAmount) rows.push({ description, amount: itemAmount, estimateLine });
      return rows;
    }, []).slice(0, 24),
  };
}

function normalizeCarrier(parsed: Record<string, unknown>): RebuttalCarrierAnalysis {
  const rawLines = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
  return {
    carrierName: cleanText(parsed.carrierName, 180),
    carrierClaimNumber: cleanText(parsed.carrierClaimNumber, 100),
    adjusterName: cleanText(parsed.adjusterName, 180),
    estimateDate: isoDate(parsed.estimateDate),
    offerTotal: amount(parsed.offerTotal),
    denialReasons: cleanText(parsed.denialReasons, 2_000),
    lineItems: rawLines.reduce<RebuttalCarrierAnalysis["lineItems"]>((rows, row) => {
      if (!row || typeof row !== "object") return rows;
      const value = row as Record<string, unknown>;
      const description = cleanText(value.description, 220);
      const offer = amount(value.offer);
      const reason = cleanText(value.reason, 500);
      const estimateLine = cleanText(value.estimateLine, 80);
      if (description || offer || reason) rows.push({ description, offer, reason, estimateLine });
      return rows;
    }, []).slice(0, 24),
  };
}

function normalizeEvidence(parsed: Record<string, unknown>): RebuttalEvidenceSuggestion[] {
  const raw = Array.isArray(parsed.evidenceSuggestions) ? parsed.evidenceSuggestions : [];
  return raw.reduce<RebuttalEvidenceSuggestion[]>((rows, row) => {
    if (!row || typeof row !== "object") return rows;
    const value = row as Record<string, unknown>;
    const title = cleanText(value.title, 240);
    const source = cleanText(value.source, 160);
    const revisionDate = cleanText(value.revisionDate, 40);
    const markedPage = cleanText(value.markedPage, 80);
    const note = cleanText(value.note, 500);
    if (title || note) rows.push({ title, source, revisionDate, markedPage, note });
    return rows;
  }, []).slice(0, 12);
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: bytes });
    const result = await parser.getText({ partial: Array.from({ length: 16 }, (_, index) => index + 1) });
    return result.text?.trim().slice(0, 120_000) ?? "";
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

async function renderPdfPages(bytes: Buffer, pageCount = 6): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "whip-carrier-rebuttal-"));
  const input = join(dir, "source.pdf");
  const prefix = join(dir, "page");
  try {
    await writeFile(input, bytes);
    await execFileAsync("pdftoppm", ["-f", "1", "-l", String(pageCount), "-jpeg", "-jpegopt", "quality=82", "-r", "130", input, prefix], {
      timeout: 90_000,
      maxBuffer: 3 * 1024 * 1024,
    });
    const pageNames = (await readdir(dir))
      .filter((name) => /^page-\d+\.jpg$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .slice(0, pageCount);
    const results: string[] = [];
    for (const pageName of pageNames) {
      const image = await readFile(join(dir, pageName));
      if (image.length > 0 && image.length <= 6 * 1024 * 1024) {
        results.push(`data:image/jpeg;base64,${image.toString("base64")}`);
      }
    }
    return results;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function promptFor(kind: UploadKind): string {
  if (kind === "ourEstimate") {
    return `Read this automobile repair estimate and extract only visible facts. Return the structured response exactly. For claimNumberRole, return "our" only when the number is explicitly Whip, Metrocars, member, repair-facility, or insured claim/file; return "adverse" when explicitly the other carrier's number; otherwise "unknown". Extract up to 24 material estimate lines and their printed estimate line references. Do not infer operations, facilities, claim ownership, OEM requirements, or dates.`;
  }
  if (kind === "carrierResponse") {
    return `Read this adverse carrier estimate, response, denial, or valuation and extract only visible facts. Return the structured response exactly. Extract up to 24 material operations, allowed/denied amounts, carrier reasons, and printed carrier estimate line references. Do not infer authority, liability, policy terms, or OEM requirements.`;
  }
  return `Review this repair support document only to propose possible exhibit descriptors for a later human review. Do not state that any procedure is applicable or mandatory. Return only visible title/source/revision/page indicators and a short note about what the document appears to contain. A handler must still enter and verify every exhibit and marked page before a rebuttal can be generated.`;
}

async function analyzeWithText(kind: UploadKind, text: string): Promise<Record<string, unknown> | null> {
  const schema = kind === "ourEstimate" ? estimateSchema : kind === "carrierResponse" ? carrierSchema : evidenceSchema;
  const name = kind === "ourEstimate" ? "carrier_rebuttal_estimate" : kind === "carrierResponse" ? "carrier_rebuttal_carrier_response" : "carrier_rebuttal_evidence";
  const result = await invokeLLM({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: `${promptFor(kind)}\n\nSERVER-EXTRACTED SOURCE TEXT (use only this evidence):\n${text}` }],
    outputSchema: { name, strict: true, schema },
  });
  return parseObject(result);
}

async function analyzeWithImages(kind: UploadKind, images: string[]): Promise<Record<string, unknown> | null> {
  if (!images.length) return null;
  const schema = kind === "ourEstimate" ? estimateSchema : kind === "carrierResponse" ? carrierSchema : evidenceSchema;
  const name = kind === "ourEstimate" ? "carrier_rebuttal_estimate" : kind === "carrierResponse" ? "carrier_rebuttal_carrier_response" : "carrier_rebuttal_evidence";
  const result = await invokeLLM({
    model: "gemini-3-flash-preview",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `${promptFor(kind)}\n\nRead only visible information from these source pages. Do not infer missing facts.` },
        ...images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
      ],
    }],
    outputSchema: { name, strict: true, schema },
  });
  return parseObject(result);
}

export async function analyzeCarrierRebuttalUpload(upload: RebuttalUpload): Promise<{
  estimate?: RebuttalEstimateAnalysis;
  carrier?: RebuttalCarrierAnalysis;
  evidenceSuggestions: RebuttalEvidenceSuggestion[];
  warning?: string;
}> {
  const isPdf = upload.mimeType === "application/pdf" || /\.pdf$/i.test(upload.fileName);
  const isImage = /^image\/(png|jpe?g|webp)$/i.test(upload.mimeType) || /\.(png|jpe?g|webp)$/i.test(upload.fileName);
  try {
    if (!isPdf && !isImage) {
      return { evidenceSuggestions: [], warning: "Use a PDF, PNG, JPG, or WEBP source document. Word documents are not retained or converted by this analyzer." };
    }
    let parsed: Record<string, unknown> | null = null;
    if (isPdf) {
      const text = await extractPdfText(upload.bytes);
      if (text) parsed = await analyzeWithText(upload.kind, text);
      if (!parsed) parsed = await analyzeWithImages(upload.kind, await renderPdfPages(upload.bytes));
    } else {
      const mime = upload.mimeType || "image/jpeg";
      parsed = await analyzeWithImages(upload.kind, [`data:${mime};base64,${upload.bytes.toString("base64")}`]);
    }

    if (!parsed) {
      return { evidenceSuggestions: [], warning: "The source could not be read automatically. Enter the document facts and marked exhibit details manually." };
    }
    if (upload.kind === "ourEstimate") return { estimate: normalizeEstimate(parsed), evidenceSuggestions: [] };
    if (upload.kind === "carrierResponse") return { carrier: normalizeCarrier(parsed), evidenceSuggestions: [] };
    return { evidenceSuggestions: normalizeEvidence(parsed) };
  } catch (error) {
    console.warn(`[CarrierRebuttal] transient ${upload.kind} analysis failed`, error instanceof Error ? error.message : "unknown error");
    return { evidenceSuggestions: [], warning: "The source could not be read automatically. Enter the document facts and marked exhibit details manually." };
  } finally {
    upload.bytes.fill(0);
  }
}
