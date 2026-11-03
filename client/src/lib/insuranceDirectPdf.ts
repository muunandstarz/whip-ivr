import { jsPDF } from "jspdf";
import { calculateDirectLou, directMoney } from "@shared/insuranceDirect";

export interface InsuranceDirectPdfInput {
  letterDate: string;
  claimNumber: string;
  carrierClaimNumber: string;
  dateOfLoss: string;
  carrier: string;
  adjuster: string;
  insuredName: string;
  driver: string;
  vehicle: string;
  vin: string;
  repairFacility: string;
  repairCompleted: string;
  liabilityStatement: string;
  hasLou: boolean;
  hasDv: boolean;
  louDays: number;
  dailyRate: number;
  louAmount: number;
  repairStart: string;
  repairEnd: string;
  prelossValue?: number;
  postlossValue?: number;
  dvAmount: number;
  dvMethod: string;
  carfaxReported: boolean;
  stateAuthority: string;
  handlerName: string;
  handlerTitle: string;
  handlerExtension: string;
  handlerEmail: string;
  logoBase64: string;
  snapshots: Array<{
    reportMonth: string;
    repairDays: number;
    fleetCount: number;
    rentCount: number;
    availableCount: number;
    utilization: string;
    dataStatus?: string;
  }>;
  marketName: string;
  sourceNote: string;
  reconciliation: string;
  attachLouSchedule: boolean;
}

const MARGIN = 25.4;
const FOOTER_BAND = 24;
const BODY_SIZE = 10;
const LINE_HEIGHT = 4.6;
const GENERAL_EMAIL = "claims@drivewhip.com";
const OWNER = "Metrocars Leasing Corp.";
const MISSING = "—";

// Keep supplied fields plain text. No HTML, browser, network, or PDF-template API is used.
function plain(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function field(value: unknown): string {
  return plain(value) || MISSING;
}

function numeric(value: unknown, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)
    : MISSING;
}

function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    : MISSING;
}

interface TextBlock {
  text: string;
  bold?: boolean;
  gap?: number;
}

interface TableRow {
  cells: string[];
  bold?: boolean;
}

/** A small measured layout engine. All body/table content stays above the footer band. */
class LetterLayout {
  readonly width: number;
  readonly bottom: number;
  y = MARGIN;

  constructor(readonly doc: jsPDF) {
    this.width = doc.internal.pageSize.getWidth() - MARGIN * 2;
    this.bottom = doc.internal.pageSize.getHeight() - FOOTER_BAND;
  }

  font(bold = false, size = BODY_SIZE): void {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(0);
  }

  lines(text: string, width = this.width, bold = false, size = BODY_SIZE): string[] {
    this.font(bold, size);
    return this.doc.splitTextToSize(text, width) as string[];
  }

  newPage(): void {
    this.doc.addPage();
    this.y = MARGIN;
  }

  reserve(height: number): void {
    if (height <= this.bottom - MARGIN && this.y + height > this.bottom) {
      this.newPage();
    }
  }

  gap(height = 3): void {
    // Do not create a new page merely for trailing whitespace.
    this.y = Math.min(this.bottom, this.y + height);
  }

  blockHeight(block: TextBlock): number {
    return this.lines(block.text, this.width, block.bold).length * LINE_HEIGHT + (block.gap ?? 3);
  }

  block(block: TextBlock, keepTogether = true): void {
    const lines = this.lines(block.text, this.width, block.bold);
    if (keepTogether) this.reserve(lines.length * LINE_HEIGHT);
    for (const line of lines) {
      if (this.y + LINE_HEIGHT > this.bottom) this.newPage();
      this.font(block.bold);
      this.doc.text(line, MARGIN, this.y + 3.4);
      this.y += LINE_HEIGHT;
    }
    this.gap(block.gap ?? 3);
  }

  section(title: string, text: string): void {
    const firstLines = this.lines(text).length;
    const height = LINE_HEIGHT + 1 + firstLines * LINE_HEIGHT;
    this.reserve(height <= this.bottom - MARGIN ? height : LINE_HEIGHT + 1 + Math.min(firstLines, 2) * LINE_HEIGHT);
    this.block({ text: title, bold: true, gap: 1 });
    this.block({ text }, false);
  }

  blocksTogether(blocks: TextBlock[]): void {
    const height = blocks.reduce((sum, block) => sum + this.blockHeight(block), 0);
    this.reserve(height);
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      // If an exceptionally long group cannot fit on one page, at least keep a
      // section heading with the first two lines of the paragraph that follows.
      if (block.bold && blocks[index + 1]) {
        const nextHeight = this.blockHeight(blocks[index + 1]);
        const pairHeight = this.blockHeight(block) + nextHeight;
        this.reserve(pairHeight <= this.bottom - MARGIN ? pairHeight : this.blockHeight(block) + 2 * LINE_HEIGHT);
      }
      this.block(block, index === 0 || !blocks[index - 1].bold);
    }
  }

  identity(label: string, value: string): void {
    const labelWidth = 38;
    const lines = this.lines(value, this.width - labelWidth);
    this.reserve(lines.length * LINE_HEIGHT);
    lines.forEach((line, index) => {
      if (this.y + LINE_HEIGHT > this.bottom) this.newPage();
      if (index === 0) {
        this.font(true);
        this.doc.text(label, MARGIN, this.y + 3.4);
      }
      this.font();
      this.doc.text(line, MARGIN + labelWidth, this.y + 3.4);
      this.y += LINE_HEIGHT;
    });
  }

  table(headers: string[], widths: number[], rows: TableRow[], size = 9): void {
    const cellGap = 2;
    const lineHeight = 4.2;
    const wrap = (cells: string[], bold = false) =>
      cells.map((cell, index) => this.lines(cell, widths[index] - cellGap * 2, bold, size));
    const headerLines = wrap(headers, true);
    const headerLineCount = Math.max(...headerLines.map(lines => lines.length));
    const headerHeight = headerLineCount * lineHeight + cellGap * 2;
    const draw = (cells: string[][], offset: number, count: number, bold: boolean, header = false) => {
      const height = count * lineHeight + cellGap * 2;
      let x = MARGIN;
      this.doc.setDrawColor(155);
      this.doc.setLineWidth(0.15);
      cells.forEach((lines, column) => {
        if (header) this.doc.setFillColor(235, 235, 235);
        this.doc.rect(x, this.y, widths[column], height, header ? "FD" : "S");
        this.font(bold, size);
        lines.slice(offset, offset + count).forEach((line, index) => {
          const rightAligned = column === 2 && headers.length === 4 && !header;
          this.doc.text(
            line,
            rightAligned ? x + widths[column] - cellGap : x + cellGap,
            this.y + cellGap + 3 + index * lineHeight,
            rightAligned ? { align: "right" } : undefined,
          );
        });
        x += widths[column];
      });
      this.y += height;
    };
    const drawHeader = () => draw(headerLines, 0, headerLineCount, true, true);
    const nextTablePage = () => {
      this.newPage();
      drawHeader();
    };
    this.reserve(headerHeight + lineHeight + cellGap * 2);
    drawHeader();
    for (const row of rows) {
      const cells = wrap(row.cells, row.bold);
      const lineCount = Math.max(...cells.map(lines => lines.length));
      const rowHeight = lineCount * lineHeight + cellGap * 2;
      if (this.y + rowHeight > this.bottom && rowHeight <= this.bottom - MARGIN - headerHeight) {
        nextTablePage();
      }
      let offset = 0;
      while (offset < lineCount) {
        const capacity = Math.floor((this.bottom - this.y - cellGap * 2) / lineHeight);
        if (capacity < 1) {
          nextTablePage();
          continue;
        }
        const count = Math.min(capacity, lineCount - offset);
        draw(cells, offset, count, Boolean(row.bold));
        offset += count;
        if (offset < lineCount) nextTablePage();
      }
    }
    this.gap(4);
    this.font();
  }
}

function letterhead(layout: LetterLayout, logoBase64: string): void {
  const { doc } = layout;
  const right = MARGIN + layout.width;
  if (plain(logoBase64)) {
    // Only the supplied actual logo is used; never synthesize a replacement.
    // Invalid image data is omitted rather than preventing the demand text.
    try {
      const image = doc.getImageProperties(logoBase64);
      const scale = Math.min(31 / image.width, 15 / image.height);
      doc.addImage(logoBase64, image.fileType, MARGIN, MARGIN, image.width * scale, image.height * scale);
    } catch {
      // jsPDF cannot decode this supplied logo. The letter remains usable.
    }
  }
  layout.font(true, 8);
  doc.text("Whip Claims Management", right, MARGIN + 3, { align: "right" });
  layout.font(false, 8);
  doc.setTextColor(70);
  doc.text("P.O. Box 10622 Rockville, MD 20849-0622", right, MARGIN + 7, { align: "right" });
  doc.text(`(855) 906-5949 | ${GENERAL_EMAIL}`, right, MARGIN + 11, { align: "right" });
  doc.setDrawColor(165);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, MARGIN + 18, right, MARGIN + 18);
  layout.y = MARGIN + 22;
  layout.font();
}

function footers(layout: LetterLayout): void {
  const { doc } = layout;
  const pages = doc.getNumberOfPages();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(165);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, height - 20, MARGIN + layout.width, height - 20);
    layout.font(false, 6.5);
    doc.setTextColor(100);
    doc.text(
      "Whip Claims Management | PO BOX 10622 Rockville, MD 20850 | (855) 906-5949",
      doc.internal.pageSize.getWidth() / 2,
      height - 16,
      { align: "center" },
    );
    doc.text(`Page ${page} of ${pages}`, MARGIN + layout.width, height - 10, { align: "right" });
  }
  doc.setPage(1);
}

/**
 * Render the user's Insurance Direct demand template and, optionally, its LOU
 * support schedule. Amounts/authority are supplied by the handler; this renderer
 * preserves days × effective daily rate and manually entered diminished value.
 * It neither decides damages nor substitutes legal authority or vehicle values.
 */
export function createInsuranceDirectPdf(input: InsuranceDirectPdfInput): jsPDF {
  if (!input.hasLou && !input.hasDv) {
    throw new RangeError("Select loss of use or diminished value before creating a demand.");
  }
  if (/[\[\]{}]/.test(plain(input.liabilityStatement))) {
    throw new RangeError("Replace every square-bracket or brace placeholder in the liability statement with verified claim facts and source/exhibit references, or remove unused placeholders before generating the letter.");
  }
  const lou = calculateDirectLou({ days: input.louDays, dailyRate: input.dailyRate });
  if (input.hasLou && (lou.error || !Number.isFinite(input.louAmount) || input.louAmount <= 0 || directMoney(input.louAmount) !== lou.amount)) {
    throw new RangeError("The loss-of-use amount must reconcile to days multiplied by the effective daily rate; occupancy is supporting context only.");
  }
  const hasValues = input.prelossValue !== undefined || input.postlossValue !== undefined;
  if (input.hasDv) {
    if (!Number.isFinite(input.dvAmount) || input.dvAmount <= 0 || directMoney(input.dvAmount) <= 0) {
      throw new RangeError("Enter a positive, finite diminished-value amount manually; no vehicle valuation is calculated.");
    }
    if (!plain(input.dvMethod)) {
      throw new RangeError("Enter the diminished-value method and source reference supporting the manual amount.");
    }
    if (hasValues) {
      const pre = input.prelossValue; const post = input.postlossValue;
      if (typeof pre !== "number" || typeof post !== "number" || !Number.isFinite(pre) || !Number.isFinite(post) || pre < 0 || post < 0 || directMoney(pre) <= directMoney(post)) {
        throw new RangeError("If supplying optional pre-loss or post-repair values, enter both valid values; pre-loss must exceed post-repair.");
      }
      if (directMoney(directMoney(pre) - directMoney(post)) !== directMoney(input.dvAmount)) {
        throw new RangeError("The optional pre-loss minus post-repair values must reconcile to the manually entered diminished-value amount.");
      }
    }
  }
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: false });
  const layout = new LetterLayout(doc);
  const both = input.hasLou && input.hasDv;
  const title = both ? "Loss of Use and Diminished Value" : input.hasLou ? "Loss of Use" : "Diminished Value";
  const total = both ? input.louAmount + input.dvAmount : input.hasLou ? input.louAmount : input.dvAmount;
  const calculation = `${numeric(input.louDays)} days x ${money(input.dailyRate)} per day = ${money(input.louAmount)}`;
  const handlerEmail = plain(input.handlerEmail) || GENERAL_EMAIL;
  doc.setProperties({ title: `Demand for ${title}`, subject: `Claim ${plain(input.claimNumber)}`, author: "Whip Claims Management" });
  letterhead(layout, input.logoBase64);

  layout.block({ text: field(input.letterDate), gap: 4 });
  layout.block({
    text: `Re: Claim #${field(input.claimNumber)} — ${field(input.carrier)} Claim No. ${field(input.carrierClaimNumber)} — Date of Loss: ${field(input.dateOfLoss)}`,
    gap: 2,
  });
  layout.block({ text: `To: ${field(input.adjuster)}, ${field(input.carrier)}`, gap: 2 });
  layout.block({ text: `Demand for ${title}`, bold: true, gap: 3 });
  // Six identity rows; VIN is on its own line within the vehicle row.
  layout.identity("Your insured", field(input.insuredName));
  layout.identity("Vehicle owner", OWNER);
  layout.identity("Driver", field(input.driver));
  layout.identity("Vehicle", `${field(input.vehicle)}\nVIN: ${field(input.vin)}`);
  layout.identity("Repair facility", field(input.repairFacility));
  layout.identity("Repair completed", field(input.repairCompleted));
  layout.gap(4);
  layout.block({
    text: `${plain(input.liabilityStatement) ? `${plain(input.liabilityStatement)} ` : ""}The vehicle, owned by ${OWNER}, was repaired at ${field(input.repairFacility)}. This letter demands ${money(total)} for ${title.toLowerCase()}, owed in addition to the cost of repair.`,
  });
  layout.block({
    text: both
      ? "Repair does not make the owner whole. The vehicle was out of service while it was repaired, and it is worth less now than before the loss. Both are damages your insured caused. Both are documented in the enclosed packet."
      : input.hasLou
        ? "The vehicle was out of service while it was repaired. That time is a damage your insured caused, and it is documented in the enclosed packet."
        : "The vehicle is worth less now than before the loss, even though it has been repaired. That loss in value is a damage your insured caused, and it is documented in the enclosed packet.",
  });

  const rows: TableRow[] = [];
  if (input.hasLou) rows.push({ cells: ["1", "Loss of use", money(input.louAmount), "Loss of use summary with fleet log and utilization rate"] });
  if (input.hasDv) rows.push({ cells: [String(rows.length + 1), "Diminished value", money(input.dvAmount), `Diminished value appraisal, repair estimate, image report${input.carfaxReported ? ", Carfax history" : ""}`] });
  if (both) rows.push({ cells: ["", "Total demand", money(total), ""], bold: true });
  layout.table(["#", "Item", "Amount", "Support (attached)"], [8, 35, 28, layout.width - 71], rows);

  if (input.hasLou) {
    layout.section(
      "Loss of use",
      `The vehicle was out of service ${numeric(input.louDays)} days, from ${field(input.repairStart)} to ${field(input.repairEnd)}, while it was repaired. ${OWNER} rents its vehicles to drivers, so each day out of service is a day the vehicle could not be rented. The amount is ${numeric(input.louDays)} days at ${money(input.dailyRate)} per day, for ${money(input.louAmount)}. Monthly fleet occupancy is supporting context only, not a multiplier in this calculation or daily occupancy evidence. The fleet log and the calculation are in the packet.`,
    );
  }
  if (input.hasDv) {
    layout.section(
      "Diminished value",
      `The enclosed diminished-value documentation supports the manually entered amount of ${money(input.dvAmount)} for loss in value after repair, using ${field(input.dvMethod).replace(/\.+$/, "")}.${hasValues ? ` The supplied supporting values are ${money(input.prelossValue)} before the loss and ${money(input.postlossValue)} after repair; they reconcile to the entered amount.` : ""}${input.carfaxReported ? " The loss is reported on the enclosed Carfax history, so the next buyer will see it." : ""}`,
    );
  }
  if (plain(input.stateAuthority)) layout.block({ text: plain(input.stateAuthority) });

  const enclosures = ["Repair estimate or final bill", "image report"];
  if (input.hasLou) enclosures.push("loss of use summary and fleet log");
  if (input.hasLou && input.attachLouSchedule) enclosures.push("loss of use support schedule");
  if (input.hasDv) enclosures.push("diminished value appraisal");
  if (input.hasDv && input.carfaxReported) enclosures.push("Carfax history report");
  enclosures.push("Direction of Pay and Vehicle Ownership Notice");
  const closing: TextBlock[] = [
    { text: "Demand", bold: true, gap: 1 },
    { text: `Pay ${money(total)}. If you value any item differently, send your valuation and the method behind it with your response. A general statement that an item is not owed does not answer a documented item. Please respond within ten (10) days of receipt.` },
    { text: "Payment", bold: true, gap: 1 },
    { text: `${OWNER} owns the vehicle. Issue payment as directed in the enclosed Direction of Pay and Vehicle Ownership Notice.` },
    { text: `Please reference both claim numbers on all correspondence and send it to ${GENERAL_EMAIL}. This letter does not waive any right or remedy of ${OWNER} or Whip Claims Management, and does not concede any position on coverage, liability or the amount of loss.` },
    { text: "Sincerely,", gap: 4 },
  ];
  if (plain(input.handlerName)) closing.push({ text: plain(input.handlerName), gap: 0 });
  if (plain(input.handlerTitle)) closing.push({ text: plain(input.handlerTitle), gap: 3 });
  closing.push(
    { text: `Whip Claims Management\nP.O. Box 10622, Rockville, MD 20849\nPhone: (855) 906-5949${plain(input.handlerExtension) ? ` ext. ${plain(input.handlerExtension)}` : ""}\n${handlerEmail}`, gap: 3 },
    { text: `Enclosures: ${enclosures.join("; ")}`, gap: 0 },
  );
  layout.blocksTogether(closing);

  if (input.hasLou && input.attachLouSchedule) {
    layout.newPage();
    layout.block({ text: "Loss of use support schedule", bold: true, gap: 3 });
    layout.block({ text: `Claim #${field(input.claimNumber)} — ${field(input.carrier)} Claim No. ${field(input.carrierClaimNumber)}`, gap: 2 });
    layout.block({ text: `Market: ${field(input.marketName)}\nRepair period: ${field(input.repairStart)} to ${field(input.repairEnd)}`, gap: 3 });
    layout.block({ text: `Loss of use calculation: ${calculation}\nLoss of use demand: ${money(input.louAmount)}`, bold: true });
    layout.block({ text: "Monthly fleet occupancy is supporting context only, not a multiplier in the days x daily rate calculation. Monthly snapshots below are source reporting values, not daily occupancy evidence or a daily rental log. Missing or older reports do not change the demand amount; no occupancy percentage is assumed." });
    const snapshotRows = (input.snapshots ?? []).map(snapshot => ({
      cells: [field(snapshot.reportMonth), numeric(snapshot.repairDays), snapshot.dataStatus === "unavailable" ? MISSING : numeric(snapshot.fleetCount), snapshot.dataStatus === "unavailable" ? MISSING : numeric(snapshot.rentCount), snapshot.dataStatus === "unavailable" ? MISSING : numeric(snapshot.availableCount), field(snapshot.utilization), snapshot.dataStatus === "latest_available" ? "Latest available (context only)" : field(snapshot.dataStatus)],
    }));
    layout.table(
      ["Report month", "Repair days", "Reported rentable fleet", "Rented", "Reported unrented", "Occupancy", "Data status"],
      [29, 18, 20, 20, 22, 22, layout.width - 131],
      snapshotRows.length ? snapshotRows : [{ cells: Array(7).fill(MISSING) }],
      8.2,
    );
    layout.section("Source note", field(input.sourceNote));
    layout.section("Reconciliation", field(input.reconciliation));
  }
  footers(layout);
  return doc;
}
