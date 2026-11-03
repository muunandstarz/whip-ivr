import { jsPDF } from "jspdf";
import { calculateDirectLou, directMoney } from "@shared/insuranceDirect";

export interface StandaloneLouInput {
  claimNumber: string; carrierClaimNumber: string; dateOfLoss: string;
  carrier: string; adjuster: string; vehicle: string; vin: string; driver: string;
  registeredOwner: string; vehicleStatus: string; vehicleClass: string;
  repairFacility: string; roNumber: string; repairStart: string; repairEnd: string;
  days: number; dailyRate: number; amount: number; customRate: boolean;
  marketName: string; letterDate: string; handlerName: string; handlerTitle: string;
  handlerExtension: string; handlerEmail: string; logoBase64: string;
  snapshots: Array<{ reportMonth: string; repairDays: number; fleetCount: number; rentCount: number; availableCount: number; utilization: string; dataStatus?: string }>;
  sourceNote: string; reconciliation: string; verifiedAuthority?: string;
}

const clean = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
const value = (v: string) => clean(v) || "—";
const numberValue = (v: number) => Number.isFinite(v) ? String(v) : "—";

/** The ordinary LOU request, shared by standalone downloads and active-claim packets. */
export function appendStandaloneLouForm(doc: jsPDF, input: StandaloneLouInput, options: { addPage?: boolean; letterhead?: boolean } = {}): void {
  const calculation = calculateDirectLou({ days: input.days, dailyRate: input.dailyRate });
  if (calculation.error || !Number.isFinite(input.amount) || directMoney(input.amount) !== calculation.amount) throw new RangeError("The LOU form must use the same days × daily rate amount as the calculator.");
  if (options.addPage !== false) doc.addPage();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const left = 14, width = W - 28, bottom = H - 24;
  let y = 24;
  const font = (size = 8, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(40); };
  const next = () => { doc.addPage(); y = 24; font(9, true); doc.text("Loss of Use / Rental Reimbursement Request (continued)", left, y); y += 10; };
  const reserve = (height: number) => { if (y + height > bottom) next(); };
  const paragraph = (text: string, size = 7.5, bold = false) => {
    font(size, bold); const lines = doc.splitTextToSize(clean(text), width) as string[];
    for (const line of lines) { reserve(4); font(size, bold); doc.text(line, left, y); y += 4; }
    y += 4;
  };
  const heading = (title: string) => { reserve(18); font(8, true); doc.text(title, left, y); y += 2; doc.setDrawColor(70); doc.setLineWidth(0.4); doc.line(left, y, W - left, y); y += 6; };
  const identityRows = (rows: string[][]) => {
    const labelW = 68;
    for (const [label, content] of rows) {
      font(7.5); const lines = doc.splitTextToSize(value(content), width - labelW - 4) as string[];
      for (let offset = 0; offset < lines.length;) {
        reserve(7); const count = Math.max(1, Math.min(lines.length - offset, Math.floor((bottom - y - 3) / 4)));
        const h = Math.max(6.5, count * 4 + 2.5);
        doc.setFillColor(248, 248, 248); doc.setDrawColor(220); doc.rect(left, y, width, h, "FD");
        font(7.5, true); doc.text(offset ? `${label} (cont.)` : label, left + 2, y + 4.5);
        font(7.5); lines.slice(offset, offset + count).forEach((line, i) => doc.text(line, left + labelW, y + 4.5 + i * 4));
        y += h; offset += count;
      }
    }
    y += 6;
  };
  if (options.letterhead) {
    if (input.logoBase64) {
      try { const img = doc.getImageProperties(input.logoBase64); const scale = Math.min(31 / img.width, 15 / img.height); doc.addImage(input.logoBase64, img.fileType, left, 14, img.width * scale, img.height * scale); } catch { /* no replacement logo */ }
    }
    font(8, true); doc.text("Whip Claims Management", W - left, 18, { align: "right" });
    font(7); doc.text("P.O. Box 10622, Rockville, MD 20849", W - left, 22, { align: "right" });
    doc.text("(855) 906-5949 | claims@drivewhip.com", W - left, 26, { align: "right" });
    doc.setDrawColor(165); doc.line(left, 33, W - left, 33); y = 42;
  }
  font(14, true); doc.text("Loss of Use / Rental Reimbursement Request", left, y); y += 6;
  font(8); doc.text("Monthly Fleet Utilization & Claim Documentation", left, y); y += 5;
  doc.text(value(input.letterDate), left, y); y += 8;
  identityRows([
    ["Whip Claim No.", input.claimNumber], ["Adverse Claim No.", input.carrierClaimNumber],
    ["Date of Loss", input.dateOfLoss], ["Adverse Carrier", input.carrier], ["Adjuster", input.adjuster],
    ["Vehicle", input.vehicle], ["VIN", input.vin], ["Member / Driver", input.driver],
    ["Registered Owner", input.registeredOwner], ["Vehicle Status", input.vehicleStatus], ["Vehicle Class", input.vehicleClass],
  ]);
  heading("REPAIR PERIOD");
  identityRows([
    ["Repair Facility", input.repairFacility], ["RO Number", input.roNumber], ["Drop-Off Date", input.repairStart],
    ["Pick-Up / Returned to Service Date", input.repairEnd], ["Total Days in Repair", String(input.days)], ["Days Claimed", String(input.days)],
  ]);
  heading("MONTHLY FLEET UTILIZATION SNAPSHOTS");
  paragraph("The Whip Utilization Report is a monthly market snapshot, not a daily tracking feed. One reconciled snapshot is shown per source reporting month. Reported occupancy is supporting context, not a multiplier in the days × daily rate calculation.", 7);
  const widths = [29, 15, 35, 24, 18, 24, width - 145];
  const heads = ["Report month", "Repair days", "Location", "Rentable fleet", "Rented", "Reported unrented", "Occupancy / status"];
  const tableRow = (cells: string[], header = false) => {
    font(6.5, header);
    const lines = cells.map((c, i) => doc.splitTextToSize(c, widths[i] - 3) as string[]);
    const count = Math.max(...lines.map(l => l.length)); const height = count * 3.3 + 4;
    if (y + height > bottom) { next(); if (!header) tableRow(heads, true); }
    let x = left;
    cells.forEach((_, i) => {
      doc.setFillColor(header ? 235 : 248, header ? 235 : 248, header ? 235 : 248); doc.setDrawColor(210); doc.rect(x, y, widths[i], height, "FD");
      font(6.5, header); lines[i].forEach((line, j) => doc.text(line, x + 1.5, y + 4 + j * 3.3)); x += widths[i];
    });
    y += height;
  };
  tableRow(heads, true);
  for (const row of input.snapshots) {
    const unavailable = row.dataStatus === "unavailable";
    tableRow([value(row.reportMonth), numberValue(row.repairDays), value(input.marketName), unavailable ? "—" : numberValue(row.fleetCount), unavailable ? "—" : numberValue(row.rentCount), unavailable ? "—" : numberValue(row.availableCount), `${value(row.utilization)}${row.dataStatus === "latest_available" ? " (latest available; context only)" : unavailable ? " (unavailable)" : ""}`]);
  }
  if (!input.snapshots.length) tableRow(["—", String(input.days), value(input.marketName), "—", "—", "—", "Unavailable"]);
  y += 7;
  const beforeCalculationPage = doc.getNumberOfPages();
  reserve(48); heading("LOSS OF USE / RENTAL CALCULATION");
  paragraph("Loss of Use Breakdown", 10, true);
  paragraph(`Days Out of Service: ${input.days} × Daily Rate: $${input.dailyRate.toFixed(2)} = $${input.amount.toFixed(2)}`, 8);
  paragraph(`Rate basis: ${input.customRate ? "Handler-entered custom rate" : "Whip Standard Rate"} — ${input.vehicle || input.vehicleClass || "Vehicle"}, ${input.marketName} market ($${(input.dailyRate * 7).toFixed(2)}/wk ÷ 7 = $${input.dailyRate.toFixed(2)}/day)`, 7);
  reserve(14); doc.setFillColor(235, 235, 235); doc.rect(left, y, width, 11, "F");
  font(8, true); doc.text("TOTAL LOSS OF USE / RENTAL REIMBURSEMENT CLAIMED:", left + 2, y + 7);
  font(11, true); doc.text(`$${input.amount.toFixed(2)}`, W - left - 2, y + 7, { align: "right" }); y += 17;

  // Retain the normal second-page source and supporting basis, not a substitute mini-summary.
  if (doc.getNumberOfPages() === beforeCalculationPage) { doc.addPage(); y = 24; }
  else y += 4;
  paragraph("Loss of Use / Rental Reimbursement Supporting Basis", 12, true);
  paragraph(`Claim #${value(input.claimNumber)} — attached to the preceding reimbursement calculation and monthly utilization snapshot.`, 8);
  heading("SOURCE NOTE"); paragraph(input.sourceNote || "No monthly source report is available for this period; no occupancy percentage is assumed.", 7);
  heading("RECONCILIATION"); paragraph(input.reconciliation || "No reported monthly snapshot is available to reconcile.", 7);
  heading("CLAIM-SPECIFIC SUPPORTING BASIS");
  paragraph(`The vehicle is registered to ${value(input.registeredOwner)} and its recorded status is ${value(input.vehicleStatus)}. It was unavailable for service during the stated repair period. The requested loss of use equals the selected daily rate multiplied by the documented days out of service. Monthly fleet reporting is context, not proof of daily occupancy. This request remains subject to the applicable jurisdiction, policy, liability, repair-period, and claim-specific evidence.`);
  if (input.verifiedAuthority?.trim()) { heading("VERIFIED CLAIM-SPECIFIC AUTHORITY"); paragraph(input.verifiedAuthority); }
  paragraph("Please contact us directly if additional documentation is required for review. Repair records, photographs, and other external exhibits are supplied separately by the handler.", 7);
  reserve(40); paragraph("Respectfully,", 8);
  if (input.handlerName) paragraph(input.handlerName, 8, true);
  paragraph(`${input.handlerTitle || "Claims Resolution Specialist"}\nWhip Claims Management\n(855) 906-5949${input.handlerExtension ? ` ext. ${input.handlerExtension}` : ""} | ${input.handlerEmail || "claims@drivewhip.com"}\nP.O. Box 10622, Rockville, MD 20849`, 8);
}

export function createStandaloneLouPdf(input: StandaloneLouInput): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  appendStandaloneLouForm(doc, input, { addPage: false, letterhead: true });
  numberLouPages(doc);
  return doc;
}

/** Called once after assembly so packet page numbers include the cover letter. */
export function numberLouPages(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(100); doc.setDrawColor(165);
    doc.line(14, H - 20, W - 14, H - 20);
    doc.text("Whip Claims Management | PO BOX 10622 Rockville, MD 20850 | (855) 906-5949", W / 2, H - 16, { align: "center" });
    doc.text(`Page ${p} of ${pages}`, W - 14, H - 10, { align: "right" });
  }
  doc.setPage(1);
}
