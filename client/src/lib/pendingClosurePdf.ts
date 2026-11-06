import { jsPDF } from "jspdf";
import {
  PENDING_CLOSURE_FOOTER,
  PENDING_CLOSURE_HEADER,
  PENDING_CLOSURE_SUBJECT,
  pendingClosureContent,
  type PendingClosureFields,
} from "@shared/pendingClosure";

/** Baselines and margins follow the supplied A4 letter, using regular-weight body text. */
export const PENDING_CLOSURE_PDF_LAYOUT = {
  left: 25.4,
  right: 184.4,
  bodyStart: 43.1,
  continuationStart: 25.4,
  bodyBottom: 273,
  fontSize: 10,
  lineHeight: 6.085,
  descenderReserve: 1.2,
  footerLine: 279.5,
  footerText: 283.8,
} as const;

export type PendingClosurePdfOptions = {
  /** Existing transparent Whip logo, injected by the caller; never stored here. */
  logoBase64?: string;
  /** Alias for callers using a data-URL convention. */
  logoDataUrl?: string;
  /** Optional source pixel dimensions; the image is always fitted within 22 x 15 mm. */
  logoWidth?: number;
  logoHeight?: number;
  /** Like the UAD renderer: final validation by default; draft permits placeholders. */
  draft?: boolean;
  /** Explicit final/partial selection, when preferred over draft. */
  requireComplete?: boolean;
};

/** Synchronous generation only: no source-template storage, network, legal inference or sending. */
export function createPendingClosurePdf(
  fields: PendingClosureFields,
  options: PendingClosurePdfOptions = {}
): jsPDF {
  const content = pendingClosureContent(fields, {
    requireComplete: options.requireComplete ?? !options.draft,
  });
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const layout = PENDING_CLOSURE_PDF_LAYOUT;
  const width = layout.right - layout.left;
  let y: number = layout.bodyStart;
  const font = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(layout.fontSize);
    doc.setTextColor(25, 25, 25);
  };
  const firstPageHeader = () => {
    const logo = options.logoBase64 ?? options.logoDataUrl;
    if (logo) {
      try {
        const image = doc.getImageProperties(logo);
        const sourceWidth =
          Number.isFinite(options.logoWidth) && options.logoWidth! > 0
            ? options.logoWidth!
            : image.width;
        const sourceHeight =
          Number.isFinite(options.logoHeight) && options.logoHeight! > 0
            ? options.logoHeight!
            : image.height;
        const scale = Math.min(22 / sourceWidth, 15 / sourceHeight);
        doc.addImage(
          logo,
          image.fileType,
          layout.left,
          16,
          sourceWidth * scale,
          sourceHeight * scale,
          undefined,
          "FAST"
        );
      } catch {
        /* Omit unavailable/invalid logos; do not fabricate a substitute. */
      }
    }
    doc.setTextColor(25, 25, 25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(PENDING_CLOSURE_HEADER[0], 188.6, 20.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(PENDING_CLOSURE_HEADER[1], 188.6, 24, { align: "right" });
    doc.text(PENDING_CLOSURE_HEADER[2], 188.6, 27.4, { align: "right" });
    doc.setDrawColor(175, 175, 175);
    doc.setLineWidth(0.2);
    doc.line(layout.left, 36.5, layout.right, 36.5);
    font();
  };
  const nextPage = () => {
    doc.addPage();
    // No repeated logo, contact header, identity rows or decorative continuation title.
    y = layout.continuationStart;
    font();
  };
  const ensure = (height: number) => {
    if (y + height > layout.bodyBottom) nextPage();
  };
  const linesFor = (text: string, maxWidth: number): string[] =>
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .flatMap(line =>
        line ? (doc.splitTextToSize(line, maxWidth) as string[]) : [""]
      );
  const blockHeight = (count: number, lineHeight: number) =>
    (count - 1) * lineHeight + layout.descenderReserve;
  const write = (
    text: string,
    {
      lineHeight = layout.lineHeight,
      gap = 0,
      keep = false,
    }: {
      lineHeight?: number;
      gap?: number;
      keep?: boolean;
    } = {}
  ) => {
    font();
    const lines = linesFor(text, width);
    const height = blockHeight(lines.length, lineHeight);
    if (keep && height <= layout.bodyBottom - layout.continuationStart)
      ensure(height);
    for (const line of lines) {
      ensure(layout.descenderReserve);
      font();
      doc.text(line, layout.left, y);
      y += lineHeight;
    }
    y += gap;
  };

  firstPageHeader();
  write(content.letterDate, { lineHeight: 4.94, gap: 3.3 });
  for (const recipient of content.recipient)
    write(recipient, { lineHeight: 4.94 });
  y += 3.2;
  for (const [label, value] of content.identity) {
    font();
    doc.setFontSize(9.5);
    const labelLines = linesFor(label, 27);
    font();
    const valueLines = linesFor(value, layout.right - 55.4);
    const count = Math.max(labelLines.length, valueLines.length);
    const height = blockHeight(count, 4.76);
    if (height <= layout.bodyBottom - layout.continuationStart) ensure(height);
    for (let index = 0; index < count; index++) {
      ensure(layout.descenderReserve);
      font();
      doc.setFontSize(9.5);
      doc.setTextColor(115, 115, 115);
      if (labelLines[index]) doc.text(labelLines[index], layout.left, y);
      font();
      if (valueLines[index]) doc.text(valueLines[index], 55.4, y);
      y += 4.76;
    }
  }
  y += 4.8;
  write(content.salutation, { lineHeight: 5.8, gap: 2.4, keep: true });
  for (const paragraph of content.paragraphs)
    write(paragraph.text, { gap: 2.47, keep: true });

  // Keep an ordinary signatory block together; still safely paginate unusually long names/titles.
  font();
  const signatureCount = content.signature.reduce(
    (count, line) => count + linesFor(line, width).length,
    0
  );
  const signatureHeight = blockHeight(signatureCount, 4.94) + 3.98;
  if (signatureHeight <= layout.bodyBottom - layout.continuationStart)
    ensure(signatureHeight);
  write(content.signature[0], { lineHeight: 4.94, gap: 3.98 });
  for (const line of content.signature.slice(1))
    write(line, { lineHeight: 4.94 });

  // Reserve the footer area on every page; it is never part of the flowing body.
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setDrawColor(175, 175, 175);
    doc.setLineWidth(0.2);
    doc.line(layout.left, layout.footerLine, layout.right, layout.footerLine);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(115, 115, 115);
    doc.text(
      PENDING_CLOSURE_FOOTER,
      doc.internal.pageSize.getWidth() / 2,
      layout.footerText,
      { align: "center" }
    );
  }
  doc.setPage(1);
  doc.setProperties({
    title: PENDING_CLOSURE_SUBJECT,
    author: "Whip Claims Management",
  });
  return doc;
}
