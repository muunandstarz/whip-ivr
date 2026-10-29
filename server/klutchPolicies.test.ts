import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { toDateOnly } from "./klutchPolicies";
import { planKlutchTermsThrough } from "@shared/klutchPolicy";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/klutchPolicies.ts"), "utf8");
const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/klutchPolicies.ts"), "utf8");
const contractSource = fs.readFileSync(path.resolve(process.cwd(), "shared/klutchPolicy.ts"), "utf8");

describe("Klutch policy service safeguards", () => {
  it("allocates policy and claim sequences under transaction locks", () => {
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("await conn.beginTransaction()");
    expect(source).toContain("await conn.rollback()");
    expect(source).toContain("formatKlutchPolicyNumber");
    expect(source).toContain("formatKlutchClaimNumber");
    expect(source).not.toContain("MAX(policy_sequence)");
  });

  it("keeps policy issuance idempotent and policy-owned", () => {
    expect(source).toContain("issue_request_key = ? FOR UPDATE");
    expect(source).toContain("created_by_user_id");
    expect(source).toContain("snapsheet_claim_number");
    expect(source).toContain("Whip / SnapSheet claim number");
    expect(routerSource).toContain("issueRequestKey");
    expect(routerSource).toContain("input.terms.state !== input.state");
    expect(routerSource).toContain("memberStreet");
    expect(routerSource).toContain("memberCity");
    expect(routerSource).toContain("memberZip");
  });

  it("creates calendar-contiguous original and automatic renewal terms through the issuance reference date", () => {
    expect(planKlutchTermsThrough("2025-08-01", "2026-10-29", 12)).toEqual([
      { termNumber: 1, transactionType: "new", effectiveOn: "2025-08-01", expiresOn: "2026-08-01" },
      { termNumber: 2, transactionType: "renewal", effectiveOn: "2026-08-01", expiresOn: "2027-08-01" },
    ]);
    expect(source).toContain("planKlutchTermsThrough(input.effectiveOn, referenceOn, input.terms.termMonths)");
    expect(source).toContain("initial_issue_fingerprint");
    expect(source).toContain("initial_issue_term_count");
    expect(source).toContain("automaticAtInitialIssuance");
    expect(source).toContain("A renewal must begin on the immediately prior term's expiration date.");
    expect(routerSource).toContain("referenceOn: dateSchema.optional()");
  });

  it("records automatic declarations against their own issued policy term", () => {
    expect(source).toContain("termId?: number");
    expect(source).toContain("WHERE id = ? AND policy_id = ? FOR UPDATE");
    expect(routerSource).toContain("termId: z.number().int().positive().optional()");
  });

  it("keeps the created-not-sent lifecycle without restricting available document forms", () => {
    expect(source).toContain("KLUTCH_CREATED_NOT_SENT");
    expect(source).toContain("deliveryStatus");
    expect(source).not.toContain('input.documentType === "tnc_denial" && String(input.snapshot.tncPeriod ?? "") === "0"');
    expect(routerSource).not.toContain("Period 0 personal use cannot be denied by this workflow");
  });

  it("records every document form without cross-document, claim, or manager-approval prerequisites", () => {
    expect(source).not.toContain("Create the current declarations page and TNC coverage denial");
    expect(source).not.toContain("A Whip / SnapSheet claim number is required for this claim document.");
    expect(source).not.toContain("klutch_endorsement_approvals");
    expect(source).not.toContain("A named manager and recorded manager approval are required before creating KIC-END-002.");
    expect(routerSource).not.toContain("approveEndorsement");
    expect(routerSource).not.toContain("adminProcedure");
  });

  it("recognizes Direction of Pay as an auditable created-not-sent document form", () => {
    expect(contractSource).toContain('"direction_of_pay"');
    expect(contractSource).toContain("Direction of Pay & Vehicle Ownership Notice");
    expect(source).toContain("KLUTCH_DOCUMENT_TYPES");
  });

  it("preserves database DATE objects in policy terms and documents", () => {
    expect(toDateOnly(new Date("2026-10-23T00:00:00.000Z"))).toBe("2026-10-23");
    expect(toDateOnly("2026-10-23")).toBe("2026-10-23");
  });

  it("uses a bounded numeric LIMIT compatible with TiDB", () => {
    expect(source).toContain("const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);");
    expect(source).toContain("LIMIT ${boundedLimit}");
    expect(source).not.toContain('ORDER BY updated_at DESC LIMIT ?');
  });
});
