import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { toDateOnly } from "./klutchPolicies";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/klutchPolicies.ts"), "utf8");
const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/klutchPolicies.ts"), "utf8");

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

  it("blocks Period 0 denial records and preserves created-not-sent lifecycle", () => {
    expect(source).toContain('input.documentType === "tnc_denial" && String(input.snapshot.tncPeriod ?? "") === "0"');
    expect(source).toContain("KLUTCH_CREATED_NOT_SENT");
    expect(routerSource).toContain("Period 0 personal use cannot be denied by this workflow");
    expect(source).toContain("deliveryStatus");
  });

  it("requires the paired declaration and denial before carrier position creation", () => {
    expect(source).toContain("Create the current declarations page and TNC coverage denial");
    expect(source).toContain("document_type IN ('declarations', 'tnc_denial')");
  });

  it("requires server-recorded manager approval for KIC-END-002", () => {
    expect(source).toContain("klutch_endorsement_approvals");
    expect(source).toContain("A named manager and recorded manager approval are required before creating KIC-END-002.");
    expect(routerSource).toContain("approveEndorsement: adminProcedure");
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
