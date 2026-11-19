import type { jsPDF } from "jspdf";

/** COI typography is never scaled down to hide overflow. Measurements use mm. */
export const COI_MIN_FONT_SIZE = 7.5;
const MM_PER_POINT = 25.4 / 72;
export type CoiText = {
  text: string;
  size: number;
  font: "normal" | "bold" | "italic";
  align: "left" | "center" | "right";
  gapAfter: number;
};
export function coiText(
  text: string,
  size = 8,
  font: CoiText["font"] = "normal",
  align: CoiText["align"] = "left",
  gapAfter = 0,
): CoiText {
  return { text, size: Math.max(COI_MIN_FONT_SIZE, size), font, align, gapAfter };
}
export type CoiLine = CoiText & { height: number; width: number };
export type CoiCell = CoiText[];
export type CoiRowOptions = {
  widths?: number[];
  padding?: number;
  minHeight?: number;
  gapAfter?: number;
  border?: boolean | "top";
  /** Repeated table heading whenever this row moves to / spans a new page. */
  repeat?: { cells: CoiCell[]; widths: number[] };
  /** Display the heading on the first table row; preflight both as one unit. */
  showHeading?: boolean;
};
export type CoiGeometry = {
  page: number;
  kind: "cell" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
};

/** Greedy word wrapping, with character-safe splitting of long IDs/VINs. */
export function wrapCoiText(doc: jsPDF, run: CoiText, width: number): CoiLine[] {
  if (!(width > 0)) throw new Error("COI text requires a positive cell width");
  doc.setFont("helvetica", run.font);
  doc.setFontSize(run.size);
  const measure = (text: string) => typeof doc.getTextWidth === "function"
    ? doc.getTextWidth(text)
    // Lightweight jsPDF mocks used by identity tests do not expose metrics.
    : text.length * run.size * MM_PER_POINT * 0.55;
  const result: string[] = [];
  for (const paragraph of run.text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!paragraph.trim()) { result.push(""); continue; }
    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= width) { current = candidate; continue; }
      if (current) { result.push(current); current = ""; }
      // Do not let a no-space policy number leak into the next column.
      for (const character of Array.from(word)) {
        if (current && measure(current + character) > width) {
          result.push(current); current = "";
        }
        if (measure(character) > width) throw new Error("COI cell is narrower than one readable character");
        current += character;
      }
    }
    if (current) result.push(current);
  }
  return result.map((text, index) => ({
    ...run,
    text,
    width: measure(text),
    height: run.size * MM_PER_POINT * 1.3 + (index === result.length - 1 ? run.gapAfter : 0),
    gapAfter: index === result.length - 1 ? run.gapAfter : 0,
  }));
}

/** Measured cells stay together when possible, then continue without dropping text. */
export function createCoiLayout(doc: jsPDF, options: {
  left?: number;
  right?: number;
  start?: number;
  bottom?: number;
  continuationStart?: number;
  onGeometry?: (geometry: CoiGeometry) => void;
} = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = options.left ?? 12;
  const right = options.right ?? pageWidth - 12;
  const width = right - left;
  const bottom = options.bottom ?? pageHeight - 16;
  const continuationStart = options.continuationStart ?? 23;
  let y = options.start ?? 8;
  let page = 1;
  const heightOf = (lines: CoiLine[]) => lines.reduce((sum, line) => sum + line.height, 0);
  const record = (geometry: Omit<CoiGeometry, "page">) => options.onGeometry?.({ ...geometry, page });
  const prepare = (cells: CoiCell[], widths: number[], padding: number) => {
    if (cells.length !== widths.length || widths.some(w => w <= padding * 2)
      || Math.abs(widths.reduce((sum, w) => sum + w, 0) - width) > 0.01) {
      throw new Error("COI cells must fill the content width with positive padded widths");
    }
    return cells.map((cell, i) => cell.flatMap(run => wrapCoiText(doc, run, widths[i] - padding * 2)));
  };
  const draw = (cells: CoiLine[][], widths: number[], padding: number, height: number, border: CoiRowOptions["border"]) => {
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    if (border === "top") doc.line(left, y, right, y);
    else if (border !== false) doc.rect(left, y, width, height);
    let x = left;
    cells.forEach((lines, i) => {
      if (i > 0 && border !== false && border !== "top") doc.line(x, y, x, y + height);
      record({ kind: "cell", x, y, width: widths[i], height });
      let lineY = y + padding;
      for (const line of lines) {
        doc.setFont("helvetica", line.font);
        doc.setFontSize(line.size);
        const textX = line.align === "center" ? x + widths[i] / 2
          : line.align === "right" ? x + widths[i] - padding : x + padding;
        const baseline = lineY + line.size * MM_PER_POINT;
        if (line.align === "left") doc.text(line.text, textX, baseline);
        else doc.text(line.text, textX, baseline, { align: line.align });
        record({ kind: "text", x: line.align === "center" ? textX - line.width / 2
          : line.align === "right" ? textX - line.width : textX,
          y: lineY, width: line.width, height: line.height - line.gapAfter,
          text: line.text, fontSize: line.size });
        lineY += line.height;
      }
      x += widths[i];
    });
    y += height;
  };
  const nextPage = () => {
    doc.addPage("letter", "portrait");
    page += 1;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    doc.text("CERTIFICATE OF INSURANCE — CONTINUED", left, 15);
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(left, 18, right, 18);
    y = continuationStart;
  };
  const row = (cells: CoiCell[], rowOptions: CoiRowOptions = {}) => {
    const widths = rowOptions.widths ?? [width];
    const padding = rowOptions.padding ?? 2;
    const remaining = prepare(cells, widths, padding);
    const headerWidths = rowOptions.repeat?.widths;
    const header = rowOptions.repeat ? prepare(rowOptions.repeat.cells, headerWidths!, padding) : undefined;
    const headerHeight = header ? Math.max(...header.map(heightOf)) + padding * 2 : 0;
    const capacity = bottom - continuationStart - headerHeight;
    if (capacity <= padding * 2 + Math.max(...remaining.flat().map(line => line.height), 0)) {
      throw new Error("COI continuation header leaves no readable content space");
    }
    const newRowPage = () => {
      nextPage();
      if (header) draw(header, headerWidths!, padding, headerHeight, true);
    };
    const totalHeight = Math.max(rowOptions.minHeight ?? 0, Math.max(...remaining.map(heightOf)) + padding * 2);
    let headingDrawn = false;
    if (y + totalHeight + (rowOptions.showHeading ? headerHeight : 0) > bottom && totalHeight <= capacity) {
      newRowPage(); headingDrawn = true;
    }
    const firstLineHeight = Math.max(...remaining.map(lines => lines[0]?.height ?? 0)) + padding * 2;
    if (y + firstLineHeight + (rowOptions.showHeading && !headingDrawn ? headerHeight : 0) > bottom) {
      newRowPage(); headingDrawn = true;
    }
    if (rowOptions.showHeading && header && !headingDrawn) draw(header, headerWidths!, padding, headerHeight, true);
    do {
      const available = bottom - y - padding * 2;
      const segment = remaining.map(lines => {
        let height = 0, count = 0;
        while (count < lines.length && height + lines[count].height <= available + 0.0001) {
          height += lines[count].height; count += 1;
        }
        return lines.splice(0, count);
      });
      const hasRemaining = remaining.some(lines => lines.length > 0);
      const segmentHeight = Math.max(...segment.map(heightOf)) + padding * 2;
      if (hasRemaining && segment.every(lines => !lines.length)) {
        throw new Error("COI continuation cannot fit a readable line");
      }
      const height = Math.min(bottom - y, Math.max(segmentHeight, rowOptions.minHeight ?? 0));
      draw(segment, widths, padding, height, rowOptions.border);
      if (hasRemaining) newRowPage();
    } while (remaining.some(lines => lines.length > 0));
    y += rowOptions.gapAfter ?? 0;
  };
  const finish = (footerText: string) => {
    const footer = [coiText(footerText, 7.5, "normal", "center")];
    const footerHeight = heightOf(prepare([footer], [width], 2)[0]) + 4;
    if (footerHeight <= bottom - continuationStart) {
      if (y + footerHeight > bottom) nextPage();
      y = Math.max(y, bottom - footerHeight);
    }
    row([footer], { border: "top" });
    // Fixed, footer-safe page numbering. Legacy identity-only mocks omit these APIs.
    if (typeof doc.setPage === "function") {
      for (let index = 1; index <= page; index++) {
        doc.setPage(index); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
        doc.text(`Page ${index} of ${page}`, right, pageHeight - 8, { align: "right" });
      }
      doc.setPage(page);
    }
  };
  return { row, finish, get y() { return y; }, get page() { return page; }, left, right, width, bottom };
}
