import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { receiptBalances, receiptDateLabel, receiptDollars, totalReconReceiptSchema, type TotalReconReceiptFields } from "@shared/totalReconReceipt";

export const TOTAL_RECON_RECEIPT_TEMPLATE = "/manus-storage/total-recon-payment-receipt-template_c8dd6b4c.pdf";
let cachedTemplate: Promise<ArrayBuffer> | undefined;
export async function loadTotalReconReceiptTemplate(): Promise<ArrayBuffer> {
  if (!cachedTemplate) cachedTemplate = fetch(TOTAL_RECON_RECEIPT_TEMPLATE).then(async response => {
    if (!response.ok) throw new Error("The Total Recon receipt template could not be loaded. Please retry.");
    return response.arrayBuffer();
  }).catch(error => { cachedTemplate = undefined; throw error; });
  return cachedTemplate;
}

/** The supplied blank PDF is the actual background. Only its blank fields are filled. */
export async function createTotalReconReceiptPdf(template: ArrayBuffer | Uint8Array, fields: TotalReconReceiptFields, receiptNo: string): Promise<Uint8Array> {
  const v = totalReconReceiptSchema.parse(fields);
  if (!/^(TR-\d{8}-\d{6,}|(?!0+$)\d{8,10}|PREVIEW)$/.test(receiptNo)) throw new Error("Invalid receipt number");
  const doc = await PDFDocument.load(template), page = doc.getPage(0);
  if (doc.getPageCount() !== 1 || Math.abs(page.getWidth() - 595.304) > 1 || Math.abs(page.getHeight() - 841.89) > 1) throw new Error("Unexpected Total Recon template geometry");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const write = (value: string, x: number, ruleY: number, width = 147, maxSize = 9) => {
    const size = Math.min(maxSize, width * maxSize / Math.max(width, font.widthOfTextAtSize(value, maxSize)));
    if (size < 6.5) throw new Error("A receipt field is too long for this exact template. Shorten it before generating.");
    page.drawText(value, { x, y: ruleY + 3, size, font, color: rgb(0.24, 0.24, 0.24) });
  };
  write(receiptNo, 431, 737, 107, 9);
  write(receiptDateLabel(v.receiptDate), 431, 724, 107, 9);
  write(v.owner, 150, 659.739);
  write(v.vehicle, 150, 627.239);
  write(v.vin, 150, 605.739, 147, 9);
  write(v.licensePlate, 150, 584.239);
  write(v.color, 150, 551.739);
  write(v.claimNumber, 150, 530.239, 147, 9);
  write(v.roNumber, 150, 508.739);
  write(v.receivedFrom, 390, 659.739);
  write(v.referenceNumber || "Not provided", 390, 605.739);
  write(receiptDateLabel(v.paymentDate), 390, 584.239);
  const b = receiptBalances(v);
  write(`$${receiptDollars(b.currentCents)}`, 390, 551.739);
  write(v.receivedBy, 390, 530.239);
  // Cross the selected checkbox; keep every template label and unchecked box.
  const boxX = { check: 388.2, ach: 424.5, wire: 454.6, card: 484.5 }[v.paymentMethod];
  page.drawLine({ start: { x: boxX, y: 633.3 }, end: { x: boxX + 3.8, y: 637.1 }, thickness: 0.7 });
  page.drawLine({ start: { x: boxX, y: 637.1 }, end: { x: boxX + 3.8, y: 633.3 }, thickness: 0.7 });
  // Preserve dollar signs and underlines from the supplied summary.
  write(receiptDollars(b.totalCents), 454, 437.59, 81, 9);
  write(receiptDollars(b.paymentsCents), 454, 405.59, 81, 9);
  write(receiptDollars(b.remainingCents), 454, 373.59, 81, 9);
  doc.setTitle("Total Recon Payment Receipt");
  doc.setSubject(receiptNo === "PREVIEW" ? "Unissued preview; no receipt number allocated" : `Receipt ${receiptNo}`);
  doc.setAuthor("Total Recon");
  return doc.save();
}
