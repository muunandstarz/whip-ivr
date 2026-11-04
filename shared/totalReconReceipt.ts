import { z } from "zod";

const normalizeText = (v: string) => v.trim().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-");
const text = (max = 96) => z.string().transform(normalizeText).pipe(z.string().min(1, "Required").max(max).regex(/^[\x20-\x7E\u00A0-\u00FF]*$/, "Use standard Latin characters for this receipt template"));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date").refine(v => { const d = new Date(v + "T00:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, "Invalid calendar date");
const money = z.string().trim().regex(/^\d{1,7}(?:\.\d{1,2})?$/, "Enter a nonnegative USD amount with up to two decimals");
export function usdCents(value: string): number { const [whole, fraction = ""] = value.split("."); return Number(whole) * 100 + Number(fraction.padEnd(2, "0")); }
export const totalReconReceiptSchema = z.object({
  receiptDate: date, owner: text(), vehicle: text(), vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Enter the full 17-character VIN"),
  licensePlate: text(32), color: text(32), claimNumber: text(96), roNumber: text(64),
  receivedFrom: text(), paymentMethod: z.enum(["check", "ach", "wire", "card"]),
  referenceNumber: z.string().trim().max(64).regex(/^[\x20-\x7E]*$/), paymentDate: date,
  amountReceived: money, receivedBy: text(80), totalBalanceDue: money, priorPayments: money,
}).superRefine((v, ctx) => {
  if (usdCents(v.amountReceived) <= 0) ctx.addIssue({ code: "custom", path: ["amountReceived"], message: "Amount received must be greater than zero" });
  if (usdCents(v.amountReceived) + usdCents(v.priorPayments) > usdCents(v.totalBalanceDue)) ctx.addIssue({ code: "custom", path: ["totalBalanceDue"], message: "Payments exceed total balance due. Verify the figures before issuing." });
  if (v.paymentMethod === "check" && !v.referenceNumber) ctx.addIssue({ code: "custom", path: ["referenceNumber"], message: "Enter the check number" });
});
export type TotalReconReceiptFields = z.infer<typeof totalReconReceiptSchema>;
export function receiptBalances(v: TotalReconReceiptFields) {
  const currentCents = usdCents(v.amountReceived), totalCents = usdCents(v.totalBalanceDue);
  const paymentsCents = usdCents(v.priorPayments) + currentCents;
  return { currentCents, totalCents, paymentsCents, remainingCents: totalCents - paymentsCents };
}
export function receiptNumber(id: number, createdAt: Date, format: "compact-v1" | "legacy" = "compact-v1"): string {
  if (!Number.isSafeInteger(id) || id < 1 || id > 9_999_999_999 || Number.isNaN(createdAt.getTime())) throw new Error("Invalid issued receipt identity");
  if (format === "legacy") return `TR-${createdAt.toISOString().slice(0, 10).replaceAll("-", "")}-${String(id).padStart(6, "0")}`;
  return String(id).padStart(8, "0");
}
export function receiptDollars(cents: number): string { return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function receiptDateLabel(value: string): string { const [y, m, d] = value.split("-"); return `${m}/${d}/${y}`; }
