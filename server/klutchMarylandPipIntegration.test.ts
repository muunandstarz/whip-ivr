import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
const h = vi.hoisted(() => ({ conn: {} as any, policy: {} as any, terms: [] as any[], writes: [] as any[], opened: 0 }));
vi.mock("mysql2/promise", () => ({ default: { createConnection: async () => { h.opened++; return h.conn; } } }));
import { documentMarylandPipHistory, issueKlutchPolicy, recordKlutchDocument } from "./klutchPolicies";
const history = { rentalEffectiveOn: "2025-08-01", initialSelection: "elected" as const, initialElectionDetails: "", changes: [{ selection: "waived" as const, effectiveOn: "2026-05-15", signedOn: "2026-05-14", sourceReference: "SYNTHETIC signed waiver — exhibit A", electionDetails: "", confirmed: true }] };
const actor = { userId: 999999, name: "SYNTHETIC HANDLER" };
const policyTerms = { leaseId: "SYNTHETIC", memberName: "SYNTHETIC MEMBER", memberNumber: "SYNTHETIC", vehicle: "2024 Tesla Model 3", vin: "5YJ3E1EA1RF000001", state: "MD" as const, effectiveOn: "2025-08-01", expiresOn: "2026-08-01", termMonths: 12 as const, transactionType: "new" as const, coverages: [], totalPremium: 1820, weeklyMembershipFee: 35, coverageWeeks: 52, pipWaived: false, leaseStatus: "active" as const };
beforeEach(() => {
 h.opened = 0; h.writes = [];
 h.policy = { id: 998, policy_number: "KIC-MD-999991", state: "MD", terms: policyTerms, effective_on: "2026-08-01", expires_on: "2027-08-01", cancelled_on: null, member_name: "SYNTHETIC MEMBER", vin_normalized: policyTerms.vin };
 h.terms = [{ id: 1, policy_id: 998, term_number: 1, revision_number: 1, effective_on: "2025-08-01", expires_on: "2026-08-01", terms: policyTerms }, { id: 2, policy_id: 998, term_number: 2, revision_number: 1, effective_on: "2026-08-01", expires_on: "2027-08-01", terms: { ...policyTerms, effectiveOn: "2026-08-01", expiresOn: "2027-08-01" } }];
 h.conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), end: vi.fn(), execute: vi.fn(async (sql: string, args: any[]) => {
  if (sql.startsWith("SELECT name, title, revision FROM klutch_signoff_settings")) return [[], []];
  if (sql.startsWith("SELECT * FROM klutch_policies")) return [[h.policy], []];
  if (sql.startsWith("SELECT * FROM klutch_policy_terms")) return [sql.includes("LIMIT 1") ? [h.terms[1]] : h.terms, []];
  h.writes.push({ sql, args }); return [{ insertId: 77 }, []];
 }) };
});
	describe("Maryland PIP durable documentation integration", () => {
	 it("keeps original and renewal term records and amounts immutable when documenting a later change", async () => {
	  const policyDatesBefore = { effective_on: h.policy.effective_on, expires_on: h.policy.expires_on };
	  const termBoundariesBefore = h.terms.map(term => ({ term_number: term.term_number, revision_number: term.revision_number, effective_on: term.effective_on, expires_on: term.expires_on }));
	  const termCountBefore = h.terms.length; const before = JSON.stringify(h.terms); const result = await documentMarylandPipHistory(998, history, actor);
	  expect(result.terms.marylandPipHistory).toEqual(history); expect(result.terms.totalPremium).toBe(1820);
	  expect({ effective_on: h.policy.effective_on, expires_on: h.policy.expires_on }).toEqual(policyDatesBefore);
	  expect(h.terms[0].effective_on).toBe(history.rentalEffectiveOn);
	  expect(h.terms).toHaveLength(termCountBefore);
	  expect(h.terms.map(term => ({ term_number: term.term_number, revision_number: term.revision_number, effective_on: term.effective_on, expires_on: term.expires_on }))).toEqual(termBoundariesBefore);
	  expect(JSON.stringify(h.terms)).toBe(before);
	  expect(h.writes.some(w => w.sql.includes("UPDATE klutch_policy_terms"))).toBe(false);
	  expect(h.writes.some(w => w.sql.includes("INSERT INTO klutch_policy_terms") || w.sql.includes("renewed"))).toBe(false);
	  expect(h.writes).toHaveLength(2); expect(h.writes[1].sql).toContain("terms_amended");
	  expect(JSON.parse(h.writes[1].args[3])).toMatchObject({ history, issuedDeclarationsUnchanged: true });
	 });
	 it("rejects a documented change at the current policy end without changing dates, terms, or issuing a renewal", async () => {
	  const policyBefore = { effective_on: h.policy.effective_on, expires_on: h.policy.expires_on };
	  const termsBefore = JSON.stringify(h.terms); const writesBefore = h.writes.length;
	  const atCurrentEnd = { ...history, changes: [{ ...history.changes[0] }, { selection: "elected" as const, effectiveOn: h.policy.expires_on, signedOn: "2026-07-31", sourceReference: "SYNTHETIC signed election — exhibit B", electionDetails: "", confirmed: true }] };
	  await expect(documentMarylandPipHistory(998, atCurrentEnd, actor)).rejects.toThrow(/must precede.*expiresOn|packet expiresOn/i);
	  expect(h.policy).toMatchObject(policyBefore);
	  expect(JSON.stringify(h.terms)).toBe(termsBefore); expect(h.terms).toHaveLength(2);
	  expect(h.writes).toHaveLength(writesBefore); expect(h.writes.some(w => w.sql.includes("INSERT INTO klutch_policy_terms") || w.sql.includes("renewed"))).toBe(false);
	 });
	 it("appends a valid election after a waiver while preserving the original rental and all issued term boundaries", async () => {
	  const afterWaiver = { ...history, changes: [{ ...history.changes[0] }, { selection: "elected" as const, effectiveOn: "2026-06-01", signedOn: "2026-05-31", sourceReference: "SYNTHETIC signed election — exhibit B", electionDetails: "", confirmed: true }] };
	  const policyDatesBefore = { effective_on: h.policy.effective_on, expires_on: h.policy.expires_on };
	  const boundariesBefore = h.terms.map(term => [term.term_number, term.revision_number, term.effective_on, term.expires_on]);
	  const result = await documentMarylandPipHistory(998, afterWaiver, actor);
	  expect(result.terms.marylandPipHistory).toEqual(afterWaiver);
	  expect(afterWaiver.rentalEffectiveOn).toBe("2025-08-01");
	  expect({ effective_on: h.policy.effective_on, expires_on: h.policy.expires_on }).toEqual(policyDatesBefore);
	  expect(h.terms).toHaveLength(2);
	  expect(h.terms.map(term => [term.term_number, term.revision_number, term.effective_on, term.expires_on])).toEqual(boundariesBefore);
	  expect(h.writes.some(w => w.sql.includes("INSERT INTO klutch_policy_terms") || w.sql.includes("renewed"))).toBe(false);
	 });
 it("rejects a non-Maryland policy without writes", async () => {
  h.policy.state = "VA"; await expect(documentMarylandPipHistory(998, history, actor)).rejects.toThrow(/only.*Maryland/);
  expect(h.writes).toHaveLength(0); expect(h.conn.rollback).toHaveBeenCalledOnce();
 });
 it("rejects absent or empty changes rather than treating missing information as a waiver", async () => {
  await expect(documentMarylandPipHistory(998, undefined, actor)).rejects.toThrow(/at least one/i);
  await expect(documentMarylandPipHistory(998, { ...history, changes: [] }, actor)).rejects.toThrow(/at least one/i);
  expect(h.opened).toBe(0);
 });
 it("enforces the issued rental baseline and cancellation boundary", async () => {
  await expect(documentMarylandPipHistory(998, { ...history, rentalEffectiveOn: "2025-07-01" }, actor)).rejects.toThrow(/original issued/);
  h.policy.cancelled_on = "2026-05-01";
  await expect(documentMarylandPipHistory(998, history, actor)).rejects.toThrow(/cancelledOn/); expect(h.writes).toHaveLength(0);
 });
 it("allows identical replay without new writes and rejects removal or replacement of documented changes", async () => {
  h.policy.terms = { ...policyTerms, marylandPipHistory: history };
  await documentMarylandPipHistory(998, history, actor); expect(h.writes).toHaveLength(0);
  await expect(documentMarylandPipHistory(998, { ...history, changes: [{ ...history.changes[0], effectiveOn: "2026-05-16" }] }, actor)).rejects.toThrow(/cannot be replaced/);
 });
 it("records the PIP endorsement only against matching durable history, as created-not-sent", async () => {
  h.policy.terms = { ...policyTerms, marylandPipHistory: history };
  await recordKlutchDocument({ policyId: 998, documentType: "endorsement", snapshot: { formId: "MD-PIP-HISTORY", marylandPipHistory: history } }, actor);
  const insert = h.writes.find(w => w.sql.includes("INSERT INTO klutch_policy_documents"));
  expect(insert.args[4]).toBe("MD-PIP-HISTORY-2026.11"); expect(insert.args[5]).toBe("CREATED_NOT_SENT");
  h.writes = [];
  await expect(recordKlutchDocument({ policyId: 998, documentType: "endorsement", snapshot: { formId: "MD-PIP-HISTORY", marylandPipHistory: { ...history, changes: [] } } }, actor)).rejects.toThrow(/matching/);
  expect(h.writes).toHaveLength(0);
 });
 it("rejects forged state history before opening the database on new issuance", async () => {
  await expect(issueKlutchPolicy({ issueRequestKey: "SYNTHETIC", leaseId: "SYNTHETIC", state: "VA", effectiveOn: policyTerms.effectiveOn, expiresOn: policyTerms.expiresOn, referenceOn: "2026-07-01", terms: { ...policyTerms, state: "VA", marylandPipHistory: history } }, actor)).rejects.toThrow(/only for MD/);
  expect(h.opened).toBe(0);
 });
 it("uses the documented selection at each annual term start, never the latest waiver across the full rental", async () => {
  const baseExecute = h.conn.execute;
  const insertedTerms: any[] = [];
  h.conn.execute = vi.fn(async (sql: string, args: any[]) => {
   if (sql.includes("issue_request_key =")) return [[], []];
   if (sql.includes("vin_normalized =") && sql.startsWith("SELECT * FROM klutch_policies")) return [[], []];
   if (sql.includes("SELECT last_issued")) return [[{ last_issued: 100100 }], []];
   if (sql.includes("INSERT INTO klutch_policies")) {
    h.policy = { ...h.policy, policy_number: args[0], effective_on: args[12], expires_on: args[13], terms: JSON.parse(args[16]) };
    return [{ insertId: 998 }, []];
   }
   if (sql.includes("INSERT INTO klutch_policy_terms")) {
    insertedTerms.push({ id: insertedTerms.length + 1, term_number: args[1], revision_number: 1, transaction_type: args[3], effective_on: args[4], expires_on: args[5], terms: JSON.parse(args[6]) });
    return [{ insertId: insertedTerms.length }, []];
   }
   if (sql.startsWith("SELECT * FROM klutch_policy_terms")) return [insertedTerms, []];
   return baseExecute(sql, args);
  });
  const result = await issueKlutchPolicy({ issueRequestKey: "SYNTHETIC-PIP-ANNUAL", leaseId: "SYNTHETIC", state: "MD", effectiveOn: policyTerms.effectiveOn, expiresOn: policyTerms.expiresOn, referenceOn: "2026-11-09", terms: { ...policyTerms, pipWaived: true, marylandPipHistory: history } }, actor);
  expect(result.declarationTerms).toHaveLength(2);
  expect(insertedTerms[0].terms.pipWaived).toBe(false);
  expect(insertedTerms[1].terms.pipWaived).toBe(true);
  expect(insertedTerms[0].terms.coverages.find((c: any) => c.label === "Personal Injury Protection").limit).toContain("2,500");
  expect(insertedTerms[1].terms.coverages.find((c: any) => c.label === "Personal Injury Protection").limit).toBe("Waived");
  for (const term of insertedTerms) {
   expect(term.terms.marylandPipHistory).toEqual(history);
   expect(term.terms.coverages.reduce((sum: number, c: any) => sum + c.premium, 0)).toBeCloseTo(term.terms.totalPremium, 2);
  }
 });
 it("can document a missing earlier form on an existing policy without inferring its earlier selection", async () => {
  const unconfirmed = { ...history, initialSelection: "unconfirmed" };
  const result = await documentMarylandPipHistory(998, unconfirmed, actor);
  expect(result.terms.marylandPipHistory?.initialSelection).toBe("unconfirmed");
  expect(result.terms.pipWaived).toBe(false);
  expect(h.writes.some(w => w.sql.includes("UPDATE klutch_policy_terms"))).toBe(false);
 });
 it("preserves the approved form and automatically includes a distinct history document in MD packets", () => {
  const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
  expect(html).toContain("Was PIP the same throughout the rental?"); expect(html.toLowerCase()).toContain("signed source-form date");
  expect(html).toContain('...(s.st==="MD"&&s.mdPipSame==="no"?["pip_history"]:[])'); expect(html).toContain('snap.formId="MD-PIP-HISTORY"');
  expect(html).toContain('mdPipAt(F,F.eff)'); expect(html).toContain('hydrateMdPip(r)');
  expect(html).toContain('st!=="MD"'); expect(html).toContain('issuedTermRendering:true');
 });
});
