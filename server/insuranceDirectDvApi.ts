import type { Express } from "express";
import multer from "multer";
import { sdk } from "./_core/sdk";
import { analyzeInsuranceDirectDvUpload } from "./insuranceDirectDvAnalysis";
import { createInsuranceDirectDvReview } from "./db";
import { dvReportToDollarFacts } from "../shared/insuranceDirectDv";

/** DV source PDFs/images are never passed to /api/upload/document or object storage. */
export function registerInsuranceDirectDvApi(app: Express): void {
  const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  app.post("/api/insurance-direct/dv-report/analyze", async (req, res) => {
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) { res.status(401).json({ error: "Sign in to read a DV report." }); return; }
    memoryUpload.single("file")(req, res, async (uploadError) => {
      try {
        if (uploadError) { res.status(400).json({ error: "Upload one PDF, PNG, JPG, or WEBP report, up to 20 MB." }); return; }
        if (!req.file) { res.status(400).json({ error: "Choose a DV report to read." }); return; }
        const result = await analyzeInsuranceDirectDvUpload({ bytes: req.file.buffer, fileName: req.file.originalname, mimeType: req.file.mimetype });
        const report = result.report ? dvReportToDollarFacts(result.report) : undefined;
        const claimNumber = (result.report?.claimNumberRole === "our" ? result.report.claimNumber : String(req.body?.claimNumber || ""))
          .replace(/[\u0000-\u001f]/g, "").trim().slice(0, 96);
        // Persist only the normalized review outcome, never the source file,
        // filename, extracted text, rendered pages, storage key, or document URL.
        const reviewId = await createInsuranceDirectDvReview({
          claimNumber, modelId: result.modelId, status: result.report ? "parsed" : "failed",
          reviewOutput: { report: report || null, currency: "USD", amountUnit: "dollars", warnings: result.warnings, error: result.error || "", handlerVerificationRequired: true },
          createdByUserId: user.id, createdByName: user.name,
        });
        res.status(result.report ? 200 : 422).json({ ...result, report, currency: "USD", amountUnit: "dollars", reviewId });
      } catch {
        res.status(500).json({ error: "The DV report could not be read or its review recorded. Your form remains unchanged; enter the report's final opinion and reference manually." });
      } finally {
        req.file?.buffer.fill(0);
      }
    });
  });
}
