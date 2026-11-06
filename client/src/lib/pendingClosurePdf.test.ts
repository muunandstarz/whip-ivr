import { describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from "pdf-lib";
import {
  createPendingClosurePdf,
  PENDING_CLOSURE_PDF_LAYOUT,
} from "./pendingClosurePdf";
import {
  buildPendingClosureText,
  emptyPendingClosureFields,
  pendingClosureContent,
  PENDING_CLOSURE_FOOTER,
  PENDING_CLOSURE_HEADER,
  PENDING_CLOSURE_RIGHTS,
  type PendingClosureFields,
} from "@shared/pendingClosure";

const record = (): PendingClosureFields => ({
  ...emptyPendingClosureFields(),
  letter_date: "2026-11-06",
  claimant_name: "Jordan Example",
  claimant_address: "123 Example Avenue\nUnit 4\nRockville, MD 20850",
  claim_number: "SYNTHETIC-PC-001",
  date_of_loss: "10/15/2026",
  last_contact_date: "2026-10-29",
  additional_info_needed: "Please provide the requested photographs.",
  response_days: "30",
  handler_name: "Morgan Sample",
  handler_title: "Claims Representative",
});
// Tiny synthetic orange image: no source asset or source PDF is copied into the repository.
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEklEQVR4nGO8l23CAANMDEgAACSwAYETNb1oAAAAAElFTkSuQmCC";
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const strings = (stream: string): string[] =>
  Array.from(stream.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g), match =>
    match[1]
      .replace(/\\([0-7]{1,3})/g, (_, octal: string) =>
        String.fromCharCode(parseInt(octal, 8))
      )
      .replace(/\\([()\\])/g, "$1")
      .replace(/\x97/g, "—")
      .replace(/\x96/g, "–")
      .replace(/\x93/g, "“")
      .replace(/\x94/g, "”")
  );
const allText = (pages: string[]) =>
  normalize(pages.map(page => strings(page).join(" ")).join(" "));

/** Inspect the actual serialized, compressed PDF, not a mock or only jsPDF's in-memory API. */
async function inspect(doc: jsPDF) {
  const bytes = doc.output("arraybuffer");
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  const loaded = await PDFDocument.load(bytes);
  const pages = loaded.getPages().map(page => {
    const contents = loaded.context.lookup(
      page.node.get(PDFName.of("Contents"))!
    );
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map(ref => loaded.context.lookup(ref))
        : [contents];
    return streams
      .map(stream => {
        expect(stream).toBeInstanceOf(PDFRawStream);
        const raw = stream as PDFRawStream;
        expect(raw.dict.get(PDFName.of("Filter"))?.toString()).toContain(
          "FlateDecode"
        );
        return Buffer.from(decodePDFRawStream(raw).decode()).toString("latin1");
      })
      .join("\n");
  });
  return { bytes, loaded, pages };
}

function assertSafe(doc: jsPDF, pages: string[]) {
  const layout = PENDING_CLOSURE_PDF_LAYOUT;
  const scale = doc.internal.scaleFactor;
  pages.forEach((stream, pageIndex) => {
    expect(
      strings(stream).filter(text => text === PENDING_CLOSURE_FOOTER)
    ).toHaveLength(1);
    if (pageIndex > 0) {
      expect(strings(stream)).not.toContain(PENDING_CLOSURE_HEADER[1]);
      expect(strings(stream)).not.toContain(PENDING_CLOSURE_HEADER[2]);
      expect(stream).not.toMatch(/\/I\d+ Do/);
    }
    for (const [, block] of stream.matchAll(/BT\n([\s\S]*?)\nET/g)) {
      const text = strings(block).join(" ");
      const position = /(-?[\d.]+) (-?[\d.]+) Td/.exec(block)!;
      const size = Number(/\/F\d+ ([\d.]+) Tf/.exec(block)![1]);
      const x = Number(position[1]) / scale;
      const y = doc.internal.pageSize.getHeight() - Number(position[2]) / scale;
      const footer = text === PENDING_CLOSURE_FOOTER;
      const header = pageIndex === 0 && y < layout.bodyStart - 0.01;
      doc.setFont("helvetica", /\/F2 /.test(block) ? "bold" : "normal");
      doc.setFontSize(size);
      const width =
        (doc.getStringUnitWidth(text, { doKerning: false }) * size) / scale;
      expect(x, text).toBeGreaterThanOrEqual(layout.left - 0.1);
      expect(x + width, text).toBeLessThanOrEqual(
        header ? 188.7 : layout.right + 0.4
      );
      if (footer) {
        expect(y).toBeCloseTo(layout.footerText, 2);
        expect(block).toContain("/F1 ");
      } else if (!header) {
        expect(y, text).toBeGreaterThanOrEqual(
          (pageIndex === 0 ? layout.bodyStart : layout.continuationStart) - 0.01
        );
        expect(y + layout.descenderReserve, text).toBeLessThanOrEqual(
          layout.bodyBottom + 0.01
        );
        expect(block, `Body must be normal-weight: ${text}`).toContain("/F1 ");
      }
    }
  });
}

describe("Pending Closure Letter real PDF output", () => {
  it("validates final PDFs by default while draft and requireComplete:false permit placeholders", async () => {
    const fields = emptyPendingClosureFields();
    expect(() => createPendingClosurePdf(fields)).toThrow(
      "Letter Date is required."
    );
    for (const options of [{ draft: true }, { requireComplete: false }]) {
      const doc = createPendingClosurePdf(fields, options);
      const { pages } = await inspect(doc);
      expect(allText(pages)).toContain("{{response_days}}");
      expect(allText(pages)).not.toMatch(
        /\{\{(?:#if|\/if|additional_info_needed)/
      );
      assertSafe(doc, pages);
    }
    expect(() =>
      createPendingClosurePdf(fields, { draft: true, requireComplete: true })
    ).toThrow("Letter Date is required.");
  });

  it("fits a normal populated letter on one compact A4 page, using regular body type and compressed output", async () => {
    const fields = record();
    const before = structuredClone(fields);
    const spy = vi.spyOn(jsPDF.API, "addImage");
    try {
      const doc = createPendingClosurePdf(fields, { logoBase64: logo });
      const { bytes, loaded, pages } = await inspect(doc);
      expect(loaded.getPageCount()).toBe(1);
      expect(loaded.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
      expect(loaded.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(logo);
      expect(pages[0]).toMatch(/\/I\d+ Do/);
      expect(bytes.byteLength).toBeLessThan(30_000);
      expect(loaded.getTitle()).toBe("Request for response — claim status");
      expect(loaded.getAuthor()).toBe("Whip Claims Management");
      const text = allText(pages);
      expect(text).toBe(
        normalize(buildPendingClosureText(fields, { requireComplete: true }))
      );
      expect(text.match(/Jordan Example/g)).toHaveLength(3);
      expect(text).not.toMatch(/\{\{|undefined|NaN|Invalid/);
      expect(fields).toEqual(before);
      assertSafe(doc, pages);
      const blocks = [...pages[0].matchAll(/BT\n([\s\S]*?)\nET/g)];
      const signatureBlock = blocks.find(([, block]) =>
        strings(block).includes("Respectfully,")
      )![1];
      const baseline = Number(
        /(-?[\d.]+) (-?[\d.]+) Td/.exec(signatureBlock)![2]
      );
      expect(297 - baseline / doc.internal.scaleFactor).toBeLessThan(225);
    } finally {
      spy.mockRestore();
    }
  });

  it("shares every letter paragraph with the preview and omits only the absent optional text", async () => {
    for (const additional_info_needed of [
      "",
      "Please provide photographs.\nPlease include the estimate.",
    ]) {
      const fields = { ...record(), additional_info_needed };
      const doc = createPendingClosurePdf(fields);
      const { pages } = await inspect(doc);
      const text = allText(pages);
      expect(text).toBe(normalize(buildPendingClosureText(fields)));
      for (const paragraph of pendingClosureContent(fields).paragraphs)
        expect(text).toContain(normalize(paragraph.text));
      expect(text).not.toMatch(/\{\{(?:#if|\/if|additional_info_needed)/);
      assertSafe(doc, pages);
    }
  });

  it("draws the logo and source contact header only on page one, with clean continuations and repeated safe footers", async () => {
    const fields = {
      ...record(),
      additional_info_needed:
        Array(160)
          .fill(
            "Long synthetic additional information that requires safe line wrapping."
          )
          .join(" ") + " END-OF-ADDITIONAL",
    };
    const spy = vi.spyOn(jsPDF.API, "addImage");
    try {
      const doc = createPendingClosurePdf(fields, { logoBase64: logo });
      const { pages } = await inspect(doc);
      expect(pages.length).toBeGreaterThan(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(pages[0]).toMatch(/\/I\d+ Do/);
      expect(strings(pages[0])).toContain(PENDING_CLOSURE_HEADER[1]);
      expect(strings(pages[0])).toContain(PENDING_CLOSURE_HEADER[2]);
      expect(allText(pages)).toContain("END-OF-ADDITIONAL");
      expect(allText(pages)).toContain(PENDING_CLOSURE_RIGHTS);
      expect(allText(pages)).toContain("Respectfully,");
      for (const page of pages.slice(1)) {
        expect(strings(page)).not.toContain("Subject");
        expect(strings(page)).not.toContain("Our claim no.");
      }
      assertSafe(doc, pages);
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    "claimant_name",
    "claimant_address",
    "claim_number",
    "additional_info_needed",
    "sol_language",
    "handler_name",
    "handler_title",
  ] as const)(
    "paginates long %s without losing its ending or overlapping footer/edges",
    async key => {
      const fields = {
        ...record(),
        [key]:
          Array(100)
            .fill(
              "Long synthetic input content for measured footer-safe wrapping"
            )
            .join(key === "claimant_address" ? "\n" : " ") + " END-OF-FIELD",
      };
      const doc = createPendingClosurePdf(fields);
      const { pages } = await inspect(doc);
      expect(pages.length).toBeGreaterThan(1);
      expect(allText(pages)).toContain("END-OF-FIELD");
      expect(allText(pages)).toContain("Respectfully,");
      expect(allText(pages)).toContain(PENDING_CLOSURE_RIGHTS);
      const flowingText = normalize(
        pages
          .flatMap(page =>
            strings(page).filter(text => text !== PENDING_CLOSURE_FOOTER)
          )
          .join(" ")
      );
      expect(flowingText).toContain(normalize(fields[key]));
      assertSafe(doc, pages);
    }
  );

  it("wraps long unbroken identifiers horizontally without clipping or dropping characters", async () => {
    const fields = {
      ...record(),
      claim_number: "SYN" + "ABCDEFGHIJ".repeat(100) + "END",
    };
    const doc = createPendingClosurePdf(fields);
    const { pages } = await inspect(doc);
    expect(allText(pages).replace(/\s/g, "")).toContain(fields.claim_number);
    assertSafe(doc, pages);
  });

  it("never leaks conditional instructions from pasted optional text into PDFs", async () => {
    const fields = {
      ...record(),
      additional_info_needed:
        "{{#if additional_info_needed}}Please provide photographs.{{/if}}",
    };
    const doc = createPendingClosurePdf(fields);
    const { pages } = await inspect(doc);
    expect(allText(pages)).toContain("since. Please provide photographs.");
    expect(allText(pages)).not.toMatch(/\{\{(?:#if|\/if)/);
    assertSafe(doc, pages);
  });

  it("omits a missing/invalid logo without inventing a substitute, and supports data-URL/dimension aliases", async () => {
    const doc = createPendingClosurePdf(record(), {
      logoBase64: "not-an-image",
    });
    const { pages } = await inspect(doc);
    expect(pages[0]).not.toMatch(/\/I\d+ Do/);
    assertSafe(doc, pages);
    const valid = createPendingClosurePdf(record(), {
      logoDataUrl: logo,
      logoWidth: 4,
      logoHeight: 2,
    });
    expect((await inspect(valid)).pages[0]).toMatch(/\/I\d+ Do/);
  });

  it("keeps normal closing together even when content ends close to a page boundary", async () => {
    const fields = {
      ...record(),
      additional_info_needed: Array(26)
        .fill(
          "Synthetic paragraph content with measured lines and careful spacing."
        )
        .join("\n"),
    };
    const doc = createPendingClosurePdf(fields);
    const { pages } = await inspect(doc);
    expect(pages.length).toBeGreaterThan(1);
    const closingPages = pages.filter(page =>
      strings(page).includes("Respectfully,")
    );
    expect(closingPages).toHaveLength(1);
    expect(strings(closingPages[0])).toContain(fields.handler_name);
    expect(strings(closingPages[0])).toContain(fields.handler_title);
    assertSafe(doc, pages);
  });
});
