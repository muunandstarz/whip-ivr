import { jsPDF } from "jspdf";
import { UAD_FOOTER, UAD_HEADER, uadDenialContent, validateUadDenialFields, type UadDenialFields } from "@shared/uadDenial";

export const UAD_PDF_LAYOUT = {
  left: 25.4, right: 184.4, bodyStart: 43.1, bodyBottom: 273,
  fontSize: 10, lineHeight: 5.8, quoteIndent: 9.5, quoteLineHeight: 5.3,
  footerLine: 279.5, footerText: 283.8,
} as const;

/** No source-template modification, storage, legal inference, or network/AI calls. */
export function createUadDenialPdf(fields: UadDenialFields, options: { logoBase64?: string; draft?: boolean } = {}): jsPDF {
  if (!options.draft) {
    const errors = validateUadDenialFields(fields);
    if (errors.length) throw new Error(errors.join(" "));
  }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const layout = UAD_PDF_LAYOUT;
  let y: number = layout.bodyStart;
  const content = uadDenialContent(fields);
  const font = (italic = false) => {
    doc.setFont("helvetica", italic ? "italic" : "normal");
    doc.setFontSize(layout.fontSize);
    doc.setTextColor(25, 25, 25);
  };
  const header = () => {
    if (options.logoBase64) {
      // Reuse the existing transparent Whip logo by injection; no duplicate asset.
      try {
        const image = doc.getImageProperties(options.logoBase64);
        const scale = Math.min(22 / image.width, 15 / image.height);
        doc.addImage(options.logoBase64, image.fileType, layout.left, 16, image.width * scale, image.height * scale);
      } catch { /* Never fabricate a substitute logo. */ }
    }
    doc.setTextColor(25, 25, 25); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(UAD_HEADER[0], 188.6, 20.5, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(90, 90, 90);
    doc.text(UAD_HEADER[1], 188.6, 24, { align: "right" });
    doc.text(UAD_HEADER[2], 188.6, 27.4, { align: "right" });
    doc.setDrawColor(175, 175, 175); doc.setLineWidth(0.2);
    doc.line(layout.left, 36.5, layout.right, 36.5);
    font();
  };
  const nextPage = () => { doc.addPage(); header(); y = layout.bodyStart; };
  const ensure = (height: number) => { if (y + height > layout.bodyBottom) nextPage(); };
  const linesFor = (text: string, width: number): string[] => text.replace(/\r\n?/g, "\n").split("\n").flatMap(line => line ? doc.splitTextToSize(line, width) as string[] : [""]);
  const write = (text: string, { x = layout.left, width = layout.right - x, lineHeight = layout.lineHeight, italic = false, gap = 0, keep = false }: {
    x?: number; width?: number; lineHeight?: number; italic?: boolean; gap?: number; keep?: boolean;
  } = {}) => {
    font(italic);
    const lines = linesFor(text, width);
    if (keep && lines.length * lineHeight < layout.bodyBottom - layout.bodyStart) ensure(lines.length * lineHeight);
    for (const line of lines) {
      ensure(1.2); // Baseline plus descenders must remain above the footer reserve.
      font(italic); // Restore after a continuation letterhead.
      doc.text(line, x, y);
      y += lineHeight;
    }
    y += gap;
  };

  header();
  write(content.letterDate, { lineHeight: 4.94, gap: 3.3 });
  for (const recipient of content.recipient) write(recipient, { lineHeight: 4.94 });
  y += 3.2;
  for (const [label, value] of content.identity) {
    font();
    const labelLines = linesFor(label, 27);
    const valueLines = linesFor(value, layout.right - 55.4);
    for (let i = 0; i < Math.max(labelLines.length, valueLines.length); i++) {
      ensure(1.2);
      font(); doc.setFontSize(9.5); doc.setTextColor(115, 115, 115);
      if (labelLines[i]) doc.text(labelLines[i], layout.left, y);
      font();
      if (valueLines[i]) doc.text(valueLines[i], 55.4, y);
      y += 4.76;
    }
  }
  y += 4.8;
  write(content.salutation, { gap: 2.4, keep: true });
  for (const paragraph of content.paragraphs) {
    write(paragraph.text, paragraph.quote
      ? { x: layout.left + layout.quoteIndent, italic: true, lineHeight: layout.quoteLineHeight, gap: 2.5, keep: true }
      : { gap: 3, keep: true });
  }
  // Keep the ordinary closing/signatory block together, but never clip a long title/name.
  font();
  const closingHeight = content.signature.reduce((height, line) => height + linesFor(line, layout.right - layout.left).length * 4.94, 3.5);
  if (closingHeight < layout.bodyBottom - layout.bodyStart) ensure(closingHeight);
  write(content.signature[0], { lineHeight: 4.94, gap: 3.5 });
  for (const line of content.signature.slice(1)) write(line, { lineHeight: 4.94 });

  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setDrawColor(175, 175, 175); doc.setLineWidth(0.2);
    doc.line(layout.left, layout.footerLine, layout.right, layout.footerLine);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(115, 115, 115);
    doc.text(UAD_FOOTER, doc.internal.pageSize.getWidth() / 2, layout.footerText, { align: "center" });
  }
  doc.setProperties({ title: "Notice of coverage denial", author: "Whip Claims Management" });
  return doc;
}
