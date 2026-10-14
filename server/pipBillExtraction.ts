import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFParse } from "pdf-parse";
import { invokeLLM } from "./_core/llm";

export type PipBillExtractionLine = {
  provider: string;
  dos: string;
  pos: string;
  cpt: string;
  modifier: string;
  units: number;
  billed: number;
};

type PipState = "PA" | "MD" | "FL" | "MA";

const PIP_BILL_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          provider: { type: "string" },
          dos: { type: "string" },
          pos: { type: "string" },
          cpt: { type: "string" },
          modifier: { type: "string" },
          units: { type: "number" },
          billed: { type: "number" },
        },
        required: ["provider", "dos", "pos", "cpt", "modifier", "units", "billed"],
        additionalProperties: false,
      },
    },
  },
  required: ["lines"],
  additionalProperties: false,
} as const;

const execFileAsync = promisify(execFile);

function promptFor(state: PipState, fileName: string) {
  return `You are a medical-billing extraction specialist reviewing ${fileName} for a ${state} Personal Injury Protection claim. Extract only submitted bill lines. The upload may be a scanned HCFA-1500/UB-04, EOB, itemized statement, or a medical-record packet containing one or more bill forms.

Rules:
1. Read every visible billed line from bill forms; do not create lines from narrative treatment notes or prescriptions without a billed charge.
2. For HCFA-1500 forms, treat each Box 24 row as a separate line: DOS from 24A, POS from 24B, CPT/HCPCS and modifier from 24D, units from 24G, and charge from 24F.
3. Preserve separate dates and separate CPT rows even if they have the same provider or code.
4. Use the rendering provider from Box 33 (or a clearly printed billing provider). Use YYYY-MM-DD for DOS when the printed date is legible; otherwise use an empty string.
5. If there are no bill lines, return an empty lines array. Do not infer charges from records, prescriptions, or treatment narratives.
Return only the required structured response.`;
}

function extractResponseText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const message = result.choices?.[0]?.message as (Awaited<ReturnType<typeof invokeLLM>>["choices"][number]["message"] & { parsed?: unknown }) | undefined;
  if (typeof message?.content === "string") return message.content.trim();
  if (Array.isArray(message?.content)) {
    const text = message.content.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("").trim();
    if (text) return text;
  }
  return message?.parsed && typeof message.parsed === "object" ? JSON.stringify(message.parsed) : "";
}

function readLines(result: Awaited<ReturnType<typeof invokeLLM>>): PipBillExtractionLine[] {
  const raw = extractResponseText(result).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  if (!raw) return [];
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) return [];
    return parsed.lines.reduce<PipBillExtractionLine[]>((lines, candidate) => {
      if (!candidate || typeof candidate !== "object") return lines;
      const row = candidate as Record<string, unknown>;
      const billed = Number(row.billed);
      const units = Number(row.units);
      if (!Number.isFinite(billed) || billed <= 0) return lines;
      lines.push({
        provider: String(row.provider ?? "").trim(),
        dos: String(row.dos ?? "").trim(),
        pos: String(row.pos ?? "").trim(),
        cpt: String(row.cpt ?? "").trim(),
        modifier: String(row.modifier ?? "").trim(),
        units: Number.isFinite(units) && units > 0 ? units : 1,
        billed,
      });
      return lines;
    }, []);
  } catch {
    return [];
  }
}

async function extractEmbeddedText(bytes: Buffer): Promise<string> {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: bytes });
    const parsed = await parser.getText({ partial: Array.from({ length: 12 }, (_, index) => index + 1) });
    return parsed.text?.trim().slice(0, 100_000) ?? "";
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

async function renderPdfPages(bytes: Buffer, pageCount = 8): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "whip-pip-bills-"));
  const input = join(dir, "upload.pdf");
  const prefix = join(dir, "page");
  try {
    await writeFile(input, bytes);
    await execFileAsync("pdftoppm", ["-f", "1", "-l", String(pageCount), "-jpeg", "-jpegopt", "quality=82", "-r", "130", input, prefix], {
      timeout: 90_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const names = (await readdir(dir))
      .filter((name) => /^page-\d+\.jpg$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .slice(0, pageCount);
    const rendered: string[] = [];
    for (const name of names) {
      const image = await readFile(join(dir, name));
      if (image.length > 0 && image.length <= 6 * 1024 * 1024) rendered.push(`data:image/jpeg;base64,${image.toString("base64")}`);
    }
    return rendered;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function invokeStructured(content: unknown) {
  const result = await invokeLLM({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: content as any }],
    outputSchema: { name: "pip_bill_lines", strict: true, schema: PIP_BILL_OUTPUT_SCHEMA },
  });
  return readLines(result);
}

export async function extractPipBillLinesFromUpload(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  state: PipState;
}): Promise<{ lines: PipBillExtractionLine[]; warning: string }> {
  const prompt = promptFor(input.state, input.fileName);
  const isPdf = input.mimeType === "application/pdf" || /\.pdf$/i.test(input.fileName);
  try {
    if (!isPdf) {
      const lines = await invokeStructured([
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${input.mimeType || "image/jpeg"};base64,${input.bytes.toString("base64")}`, detail: "high" } },
      ]);
      return { lines, warning: lines.length ? "" : "No billed service lines were found. Add or correct bill lines below." };
    }

    const embeddedText = await extractEmbeddedText(input.bytes);
    if (embeddedText) {
      const lines = await invokeStructured(`${prompt}\n\nSERVER-EXTRACTED PDF TEXT (use only this evidence):\n${embeddedText}`);
      if (lines.length) return { lines, warning: "" };
    }

    const pageImages = await renderPdfPages(input.bytes);
    if (!pageImages.length) return { lines: [], warning: "The PDF could not be rendered for extraction. Add bill lines manually below." };
    const lines = await invokeStructured([
      { type: "text", text: `${prompt}\nThese are the first rendered pages of the packet. Extract bill lines that are visibly present; do not use treatment narratives as billing evidence.` },
      ...pageImages.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
    ]);
    return {
      lines,
      warning: lines.length ? "" : "No billed service lines were found in the readable first pages. Add or correct bill lines below.",
    };
  } catch (error) {
    console.warn("[PIP bill extraction]", error);
    return { lines: [], warning: "The upload could not be read automatically. Check the document, then add or correct bill lines below." };
  }
}
