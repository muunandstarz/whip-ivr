import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  store: {} as any, settings: null as any, user: null as any,
  writes: [] as { sql: string; args: any[] }[], reads: [] as { sql: string; args: any[] }[],
  opened: 0, committed: 0, rolledBack: 0, ended: 0, nextId: 1000,
  lock: Promise.resolve(), failNotice: false,
}));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: async () => h.user } }));
vi.mock("mysql2/promise", () => ({ default: { createConnection: async () => {
  h.opened++;
  let pending: any;
  let unlock: (() => void) | undefined;
  const finish = () => { unlock?.(); unlock = undefined; };
  return {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => { h.store = pending; h.committed++; finish(); }),
    rollback: vi.fn(async () => { h.rolledBack++; finish(); }),
    end: vi.fn(async () => { h.ended++; finish(); }),
    execute: vi.fn(async (sql: string, args: any[] = []) => {
      if (sql.startsWith("SELECT")) {
        h.reads.push({ sql, args });
        if (sql.includes("FROM klutch_signoff_settings")) return [h.settings ? [h.settings] : [], []];
        if (sql.includes("FROM klutch_policies")) {
          if (sql.includes("FOR UPDATE")) {
            const preceding = h.lock;
            h.lock = new Promise<void>(resolve => { unlock = resolve; });
            await preceding;
          }
          pending = structuredClone(h.store);
          return [pending.policy && pending.policy.id === args[0] ? [pending.policy] : [], []];
        }
        if (sql.includes("FROM klutch_policy_terms")) {
          let rows = pending.terms.filter((term: any) => term.policy_id === (sql.includes("WHERE id =") ? args[1] : args[0]));
          if (sql.includes("WHERE id =")) rows = rows.filter((term: any) => term.id === args[0]);
          if (sql.includes("effective_on <=")) rows = rows.filter((term: any) => term.effective_on <= args[1] && term.expires_on > args[2]);
          rows.sort((a: any, b: any) => b.term_number - a.term_number || b.revision_number - a.revision_number);
          return [sql.includes("LIMIT 1") ? rows.slice(0, 1) : rows, []];
        }
        if (sql.includes("FROM klutch_claims")) {
          const rows = pending.claims.filter((claim: any) => sql.includes("snapsheet_claim_number =") ? claim.snapsheet_claim_number === args[0] : sql.includes("klutch_claim_number =") ? claim.klutch_claim_number === args[0] : claim.id === args[0]);
          return [rows, []];
        }
        throw new Error(`Unexpected mock read: ${sql}`);
      }
      h.writes.push({ sql, args: structuredClone(args) });
      const id = h.nextId++;
      if (sql.startsWith("UPDATE klutch_policies")) {
        if (!sql.includes("SET status = 'cancelled'")) throw new Error(`Unexpected policy write: ${sql}`);
        Object.assign(pending.policy, { status: "cancelled", cancelled_on: args[0], cancellation_reason: "Lease terminated", updated_by_user_id: args[1], updated_by_name: args[2] });
      } else if (sql.startsWith("INSERT INTO klutch_claims")) {
        pending.claims.push({ id, policy_id: args[0], klutch_claim_number: args[1], snapsheet_claim_number: args[2] });
      } else if (sql.startsWith("INSERT INTO klutch_policy_documents")) {
        if (h.failNotice) throw new Error("SYNTHETIC document insert failed");
        const cancellationInsert = sql.includes("'cancellation_notice'");
        pending.documents.push({ id, policy_id: args[0], claim_id: args[1], term_id: args[2], document_type: cancellationInsert ? "cancellation_notice" : args[3], snapshot: JSON.parse(args[cancellationInsert ? 10 : 11]), args });
      } else if (sql.startsWith("INSERT INTO klutch_policy_events")) {
        const type = /VALUES \(\?, '([^']+)'/.exec(sql)?.[1];
        if (!type) throw new Error(`Unexpected event write: ${sql}`);
        pending.events.push({ event_type: type, metadata: JSON.parse(args[3]) });
      } else throw new Error(`Unexpected mock write: ${sql}`);
      return [{ insertId: id, affectedRows: 1 }, []];
    }),
  };
} } }));

import { cancelKlutchPolicy, recordKlutchDocument } from "./klutchPolicies";
import { registerKlutchPolicyApi } from "./klutchPolicyApi";
import { klutchPoliciesRouter } from "./routers/klutchPolicies";

const policyId = 998;
const cancelledOn = "2026-05-15";
const signoff = { name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 0 };
const actor = { userId: 999999, name: "SYNTHETIC Actual Operator" };
const handler = { id: actor.userId, openId: "SYNTHETIC_HANDLER", role: "user", name: actor.name };
const terms = { leaseId: "SYNTHETIC", memberName: "SYNTHETIC MEMBER", memberNumber: "SYNTHETIC", vehicle: "SYNTHETIC VEHICLE", vin: "5YJ3E1EA1RF000001", state: "VA", effectiveOn: "2025-08-01", expiresOn: "2026-08-01", termMonths: 12, transactionType: "new", coverages: [], totalPremium: 1820, hn: "Historical Issued Handler", ht: "Historical Issued Title" };
const realSigner = { dopSignerName: "Real Metrocars Representative", dopSignerTitle: "Treasurer", dopSignatureData: "data:image/png;base64,SYNTHETIC", dopSignatureMode: "draw", dopSignatureAccepted: true, dopSignatureCertificateId: "SYNTHETIC CERTIFICATE", dopSignatureCertifiedAt: "2026-05-14T12:00:00Z", signatureData: "SYNTHETIC REAL SIGNATURE" };
const snapshot = () => ({ cdate: cancelledOn, lease: "t", ...realSigner });
const cancelInput = () => ({ policyId, cancelledOn, claimNumber: "SYNTHETIC CLAIM", documentSnapshot: snapshot() });
const noticeInput = () => ({ policyId, documentType: "cancellation_notice" as const, claimNumber: "SYNTHETIC CLAIM", snapshot: snapshot() });
const cancel = () => cancelKlutchPolicy(cancelInput(), actor);
const record = () => recordKlutchDocument(noticeInput(), actor);
const cancelledEvents = () => h.store.events.filter((event: any) => event.event_type === "cancelled");
const policyWrites = () => h.writes.filter(write => write.sql.startsWith("UPDATE klutch_policies"));
const asCancelled = (date: unknown = cancelledOn) => Object.assign(h.store.policy, { status: "cancelled", cancelled_on: date, cancellation_reason: "Historical recorded reason" });
let server: Server | undefined;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://synthetic-never-connected.invalid/test");
  h.settings = null; h.user = { ...handler }; h.writes = []; h.reads = []; h.opened = 0; h.committed = 0; h.rolledBack = 0; h.ended = 0; h.nextId = 1000; h.lock = Promise.resolve(); h.failNotice = false;
  h.store = {
    policy: { id: policyId, policy_number: "KIC-VA-999998", status: "active", state: "VA", member_name: terms.memberName, terms: JSON.stringify(terms), effective_on: "2026-08-01", expires_on: "2027-08-01", cancelled_on: null, cancellation_reason: null },
    terms: [
      { id: 1, policy_id: policyId, term_number: 1, revision_number: 1, effective_on: "2025-08-01", expires_on: "2026-08-01", terms: JSON.stringify(terms) },
      { id: 2, policy_id: policyId, term_number: 1, revision_number: 2, effective_on: "2025-08-01", expires_on: "2026-08-01", terms: { ...terms, transactionType: "correction" } },
      { id: 3, policy_id: policyId, term_number: 2, revision_number: 1, effective_on: "2026-08-01", expires_on: "2027-08-01", terms: { ...terms, effectiveOn: "2026-08-01", expiresOn: "2027-08-01", transactionType: "renewal" } },
    ],
    claims: [], documents: [{ id: 900, document_type: "declarations", snapshot: structuredClone(terms) }], events: [],
  };
});
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; }
  vi.unstubAllEnvs();
});

function expectNoSideEffects(before: string) {
  expect(h.writes).toEqual([]); expect(JSON.stringify(h.store)).toBe(before); expect(h.committed).toBe(0);
  expect(h.reads.some(read => read.sql.includes("FROM klutch_claims"))).toBe(false);
}
async function http(path: string, body: unknown) {
  if (!server) {
    const app = express(); app.use(express.json()); registerKlutchPolicyApi(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.listening ? resolve() : server!.once("listening", resolve));
  }
  const result = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/klutch-policy-documents/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: result.status, body: await result.json() };
}
function caller(user: any = handler) { return klutchPoliciesRouter.createCaller({ user, req: { headers: {} } as any, res: {} as any }); }

describe("Klutch cancellation replay regression (mocked mysql only)", () => {
  it("first cancellation writes once and selects the containing issued term's latest revision, not the latest renewal", async () => {
    const priorTerms = JSON.stringify(h.store.terms), policyTerms = h.store.policy.terms, oldNotice = JSON.stringify(h.store.documents[0]);
    const input = cancelInput(), beforeInput = JSON.stringify(input);
    const result = await cancelKlutchPolicy(input, actor);
    expect(result).toMatchObject({ replayed: false, deliveryStatus: "CREATED_NOT_SENT" });
    expect(result.klutchClaimNumber).toMatch(/^KC-/);
    expect(h.store.policy).toMatchObject({ status: "cancelled", cancelled_on: cancelledOn, cancellation_reason: "Lease terminated" });
    expect(policyWrites()).toHaveLength(1); expect(cancelledEvents()).toHaveLength(1);
    expect(h.store.documents[1]).toMatchObject({ id: result.documentId, term_id: 2, snapshot: { ...snapshot(), hn: signoff.name, ht: signoff.title } });
    expect(JSON.stringify(h.store.terms)).toBe(priorTerms); expect(h.store.policy.terms).toBe(policyTerms); expect(JSON.stringify(h.store.documents[0])).toBe(oldNotice); expect(JSON.stringify(input)).toBe(beforeInput);
    expect(h.committed).toBe(1); expect(h.ended).toBe(1);
  });

  it("sequential same-date retries append only notices and preserve recorded policy, terms, claim mapping and signer evidence", async () => {
    const first = await cancel(), beforePolicy = JSON.stringify(h.store.policy), beforeTerms = JSON.stringify(h.store.terms), beforeClaims = JSON.stringify(h.store.claims), oldNotice = JSON.stringify(h.store.documents[1]);
    h.writes = [];
    const replayInput = { ...cancelInput(), claimNumber: " synthetic claim ", documentSnapshot: { ...snapshot(), hn: ` ${signoff.name} ` } };
    const inputBefore = JSON.stringify(replayInput);
    const next = await cancelKlutchPolicy(replayInput, { ...actor, userId: 999998, name: "SYNTHETIC Second Tab Operator" });
    expect(next).toMatchObject({ replayed: true, klutchClaimNumber: first.klutchClaimNumber, deliveryStatus: "CREATED_NOT_SENT" });
    expect(next.documentId).not.toBe(first.documentId); expect(cancelledEvents()).toHaveLength(1); expect(policyWrites()).toEqual([]);
    expect(h.writes).toHaveLength(2); expect(h.writes[0].sql).toContain("INSERT INTO klutch_policy_documents"); expect(h.writes[1].sql).toContain("'document_created'");
    expect(JSON.stringify(h.store.policy)).toBe(beforePolicy); expect(JSON.stringify(h.store.terms)).toBe(beforeTerms); expect(JSON.stringify(h.store.claims)).toBe(beforeClaims); expect(JSON.stringify(h.store.documents[1])).toBe(oldNotice); expect(JSON.stringify(replayInput)).toBe(inputBefore);
    expect(h.store.documents[2].snapshot).toMatchObject({ ...realSigner, hn: signoff.name, ht: signoff.title, signoffRevision: 0 });
  });

  it("serializes two concurrent stale-tab cancellations into one cancellation and one same-date replay", async () => {
    const results = await Promise.all([cancel(), cancel()]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect(policyWrites()).toHaveLength(1); expect(cancelledEvents()).toHaveLength(1); expect(h.store.claims).toHaveLength(1); expect(h.store.documents).toHaveLength(3);
    expect(h.reads.filter(read => read.sql.includes("FROM klutch_policies")).every(read => read.sql.endsWith("FOR UPDATE"))).toBe(true);
    expect(h.committed).toBe(2); expect(h.ended).toBe(2);
  });

  it("accepts database DATE cancellation values and a valid leap day without altering existing cancellation metadata", async () => {
    asCancelled(new Date("2024-02-29T00:00:00.000Z"));
    h.store.terms[0] = { ...h.store.terms[0], effective_on: "2024-01-01", expires_on: "2025-01-01" };
    const before = structuredClone(h.store.policy);
    expect((await cancelKlutchPolicy({ ...cancelInput(), cancelledOn: "2024-02-29", documentSnapshot: { cdate: "2024-02-29" } }, actor)).replayed).toBe(true);
    expect(h.store.policy).toEqual(before); expect(policyWrites()).toEqual([]); expect(cancelledEvents()).toEqual([]);
  });

  it.each(["2026-05-14", "2026-05-16"])("rejects changed recorded cancellation date %s before claim/document/event writes", async date => {
    asCancelled(); const before = JSON.stringify(h.store);
    await expect(cancelKlutchPolicy({ ...cancelInput(), cancelledOn: date, documentSnapshot: { cdate: date } }, actor)).rejects.toThrow(/recorded cancellation date/);
    expectNoSideEffects(before);
  });

  it("rejects the losing changed-date stale tab after the first tab cancels, without any second-tab writes", async () => {
    const results = await Promise.allSettled([
      cancel(),
      cancelKlutchPolicy({ ...cancelInput(), cancelledOn: "2026-05-16", documentSnapshot: { cdate: "2026-05-16" }, claimNumber: "SYNTHETIC DIFFERENT CLAIM" }, actor),
    ]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1]).toMatchObject({ status: "rejected", reason: { message: "The cancellation date must match the policy's recorded cancellation date." } });
    expect(h.store.policy.cancelled_on).toBe(cancelledOn); expect(policyWrites()).toHaveLength(1); expect(cancelledEvents()).toHaveLength(1);
    expect(h.store.documents).toHaveLength(2); expect(h.store.claims).toHaveLength(1);
    expect(h.reads.filter(read => read.sql.includes("FROM klutch_claims") && read.args[0] === "SYNTHETICDIFFERENTCLAIM")).toEqual([]);
    expect(h.committed).toBe(1); expect(h.rolledBack).toBe(1);
  });

  it.each(["first cancellation", "same-date replay", "document reprint"])("preserves claim-policy mapping boundaries on %s", async operation => {
    if (operation !== "first cancellation") asCancelled();
    h.store.claims = [{ id: 777, policy_id: 999, klutch_claim_number: "KC-SYNTHETIC", snapsheet_claim_number: "SYNTHETICCLAIM" }];
    const before = JSON.stringify(h.store);
    await expect(operation === "document reprint" ? record() : cancel()).rejects.toThrow(/mapped to another Klutch policy/);
    expect(h.writes).toEqual([]); expect(JSON.stringify(h.store)).toBe(before); expect(h.committed).toBe(0);
  });

  it.each([null, "2026-02-30"])("fails closed for a cancelled policy with invalid recorded date %j", async date => {
    asCancelled(date); const before = JSON.stringify(h.store);
    await expect(cancel()).rejects.toThrow(/recorded cancellation date/); expectNoSideEffects(before);
  });

  it.each(["missing", "expired"])("rejects %s policies without writes", async status => {
    if (status === "missing") h.store.policy = null; else h.store.policy.status = status;
    const before = JSON.stringify(h.store);
    await expect(cancel()).rejects.toThrow(status === "missing" ? /not found/ : /Only an active/); expectNoSideEffects(before);
  });

  it.each(["", "2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "0000-01-01", "2026-05-15T00:00:00Z", "2026-5-15", " 2026-05-15", "2026-05-15 "])("rejects noncalendar/noncanonical cancellation date %j before connecting", async date => {
    const before = JSON.stringify(h.store);
    await expect(cancelKlutchPolicy({ ...cancelInput(), cancelledOn: date }, actor)).rejects.toThrow(/valid lease-termination/);
    expect(h.opened).toBe(0); expectNoSideEffects(before);
  });

  it.each([undefined, "2026-05-16", "2026-02-30", "2026-05-15T00:00:00Z"])("rejects /cancel notice cdate %j before mutation even on an active policy", async cdate => {
    const before = JSON.stringify(h.store);
    await expect(cancelKlutchPolicy({ ...cancelInput(), documentSnapshot: { cdate } }, actor)).rejects.toThrow(/notice date must match/); expectNoSideEffects(before);
  });

  it.each(["2025-07-31", "2027-08-01"])("rejects cancellation outside issued term history (%s) before writes", async date => {
    const before = JSON.stringify(h.store);
    await expect(cancelKlutchPolicy({ ...cancelInput(), cancelledOn: date, documentSnapshot: { cdate: date } }, actor)).rejects.toThrow(/issued.*term containing/); expectNoSideEffects(before);
  });

  it("uses the next issued term when cancellation is exactly at a renewal boundary", async () => {
    await cancelKlutchPolicy({ ...cancelInput(), cancelledOn: "2026-08-01", documentSnapshot: { cdate: "2026-08-01" } }, actor);
    expect(h.store.documents[1].term_id).toBe(3);
  });

  it("rolls back first cancellation, mapping and events if recording its notice fails, then permits a clean retry", async () => {
    const before = JSON.stringify(h.store); h.failNotice = true;
    await expect(cancel()).rejects.toThrow(/document insert failed/);
    expect(JSON.stringify(h.store)).toBe(before); expect(h.rolledBack).toBe(1); expect(h.committed).toBe(0);
    h.failNotice = false;
    expect((await cancel()).replayed).toBe(false); expect(cancelledEvents()).toHaveLength(1);
  });
});

describe("Cancellation notice defense in depth", () => {
  it.each(["active", "expired", "missing", "missing date"])("rejects /document cancellation_notice for %s before claims or writes", async state => {
    if (state === "missing") h.store.policy = null;
    else if (state === "missing date") asCancelled(null);
    else h.store.policy.status = state;
    const before = JSON.stringify(h.store);
    await expect(record()).rejects.toThrow(state === "missing" ? /not found/ : /already cancelled/); expectNoSideEffects(before);
  });

  it.each([undefined, "2026-05-14", "2026-02-30", "2026-05-15T00:00:00Z", "2026-05-15 ", 20260515])("rejects /document notice date %j instead of bypassing recorded cancellation", async cdate => {
    asCancelled(); const before = JSON.stringify(h.store);
    await expect(recordKlutchDocument({ ...noticeInput(), snapshot: { cdate } }, actor)).rejects.toThrow(/notice date must match/); expectNoSideEffects(before);
  });

  it("records a matching reprint only, retaining the cancellation and selecting its historical issued term", async () => {
    asCancelled(); const before = JSON.stringify(h.store.policy), beforeTerms = JSON.stringify(h.store.terms);
    const result = await record();
    expect(result.deliveryStatus).toBe("CREATED_NOT_SENT"); expect(policyWrites()).toEqual([]); expect(cancelledEvents()).toEqual([]);
    expect(JSON.stringify(h.store.policy)).toBe(before); expect(JSON.stringify(h.store.terms)).toBe(beforeTerms);
    expect(h.store.documents[1]).toMatchObject({ term_id: 2, snapshot: { ...realSigner, cdate: cancelledOn, hn: signoff.name, ht: signoff.title } });
  });

  it.each([3, 9999])("rejects explicitly selected wrong/outside policy term %d before mapping a claim", async termId => {
    asCancelled(); const before = JSON.stringify(h.store);
    await expect(recordKlutchDocument({ ...noticeInput(), termId }, actor)).rejects.toThrow(/term.*(?:containing|not found)/); expectNoSideEffects(before);
  });

  it("accepts an explicitly selected issued term containing the cancellation date", async () => {
    asCancelled(); await recordKlutchDocument({ ...noticeInput(), termId: 1 }, actor);
    expect(h.store.documents[1].term_id).toBe(1); expect(policyWrites()).toEqual([]);
  });

  it("rejects an explicit term belonging to a different policy even when its dates match", async () => {
    asCancelled(); h.store.terms.push({ ...h.store.terms[0], id: 888, policy_id: 999 });
    const before = JSON.stringify(h.store);
    await expect(recordKlutchDocument({ ...noticeInput(), termId: 888 }, actor)).rejects.toThrow(/selected.*term.*not found/); expectNoSideEffects(before);
  });

  it.each(["declarations", "direction_of_pay"] as const)("does not impose cancellation requirements on unrelated %s documents", async documentType => {
    await recordKlutchDocument({ policyId, documentType, snapshot: realSigner }, actor);
    expect(h.store.policy.status).toBe("active"); expect(h.store.documents[1].snapshot).toMatchObject(realSigner);
  });
});

describe("Canonical sign-off stays mandatory before replay; real signatures stay unchanged", () => {
  it.each(["hn", "ht", "handlerName", "handlerTitle"])("rejects forged nested %s on both cancellation entry points before even reading policy", async alias => {
    asCancelled(); const before = JSON.stringify(h.store);
    const forged = { ...snapshot(), nested: { [alias]: "FORGED" } };
    await expect(cancelKlutchPolicy({ ...cancelInput(), documentSnapshot: forged }, actor)).rejects.toMatchObject({ status: 403 });
    await expect(recordKlutchDocument({ ...noticeInput(), snapshot: forged }, actor)).rejects.toMatchObject({ status: 403 });
    expectNoSideEffects(before); expect(h.reads.every(read => read.sql.includes("klutch_signoff_settings"))).toBe(true);
  });

  it.each(["handlerName", "handlerTitle"])("rejects forged actor %s on replay", async alias => {
    asCancelled(); const before = JSON.stringify(h.store);
    await expect(cancelKlutchPolicy(cancelInput(), { ...actor, [alias]: "FORGED" })).rejects.toMatchObject({ status: 403 });
    expectNoSideEffects(before); expect(h.reads.every(read => read.sql.includes("klutch_signoff_settings"))).toBe(true);
  });

  it("rejects nested handler name/title aliases before replay", async () => {
    asCancelled(); const before = JSON.stringify(h.store);
    await expect(cancelKlutchPolicy({ ...cancelInput(), documentSnapshot: { ...snapshot(), handler: { name: "FORGED", title: signoff.title } } }, actor)).rejects.toMatchObject({ status: 403 });
    expectNoSideEffects(before);
  });

  it("uses current shared settings for a fresh replay notice, never rewrites old terms, snapshots or real signer fields", async () => {
    asCancelled(); h.settings = { name: "SYNTHETIC Approved Representative", title: "SYNTHETIC Approved Title", revision: 2 };
    const before = JSON.stringify({ policy: h.store.policy, terms: h.store.terms, documents: h.store.documents });
    const oldAlias = { ...snapshot(), hn: signoff.name };
    await expect(cancelKlutchPolicy({ ...cancelInput(), documentSnapshot: oldAlias }, actor)).rejects.toMatchObject({ status: 403 });
    expect(h.writes).toEqual([]);
    const input = cancelInput(), inputBefore = JSON.stringify(input);
    expect((await cancelKlutchPolicy(input, actor)).replayed).toBe(true);
    expect(h.store.documents[1].snapshot).toMatchObject({ ...realSigner, hn: h.settings.name, ht: h.settings.title, handlerName: h.settings.name, handlerTitle: h.settings.title, signoffRevision: 2 });
    expect(JSON.stringify({ policy: h.store.policy, terms: h.store.terms, documents: h.store.documents.slice(0, 1) })).toBe(before);
    expect(JSON.stringify(input)).toBe(inputBefore); expect(policyWrites()).toEqual([]);
  });
});

describe("Existing cancellation API access boundaries", () => {
  it("denies unauthenticated REST cancel/document and tRPC cancelAndRecord/recordDocument without opening mysql", async () => {
    h.user = null;
    expect((await http("cancel", { policyId, cancelledOn, snapshot: snapshot() })).status).toBe(401);
    expect((await http("document", noticeInput())).status).toBe(401);
    await expect(caller(null).cancelAndRecord(cancelInput())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).recordDocument(noticeInput())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(h.opened).toBe(0); expect(h.writes).toEqual([]);
  });

  it("lets an authenticated ordinary handler cancel, retry and reprint through the unchanged REST contracts", async () => {
    const body = { policyId, cancelledOn, claimNumber: "SYNTHETIC CLAIM", snapshot: snapshot() };
    expect(await http("cancel", body)).toMatchObject({ status: 200, body: { result: { replayed: false } } });
    expect(await http("cancel", body)).toMatchObject({ status: 200, body: { result: { replayed: true } } });
    expect(await http("document", noticeInput())).toMatchObject({ status: 200, body: { result: { deliveryStatus: "CREATED_NOT_SENT" } } });
    expect(policyWrites()).toHaveLength(1); expect(cancelledEvents()).toHaveLength(1);
  });

  it("lets an authenticated ordinary handler cancel, retry and reprint through tRPC", async () => {
    expect(await caller().cancelAndRecord(cancelInput())).toMatchObject({ replayed: false });
    expect(await caller().cancelAndRecord(cancelInput())).toMatchObject({ replayed: true });
    expect(await caller().recordDocument(noticeInput())).toMatchObject({ deliveryStatus: "CREATED_NOT_SENT" });
    expect(policyWrites()).toHaveLength(1); expect(cancelledEvents()).toHaveLength(1);
  });

  it("keeps raw forged aliases denied before stripping on both REST and tRPC same-date retries", async () => {
    asCancelled(); const before = JSON.stringify(h.store);
    expect((await http("cancel", { policyId, cancelledOn, snapshot: snapshot(), hn: "FORGED" })).status).toBe(400);
    expect((await http("document", { ...noticeInput(), ht: "FORGED" })).status).toBe(400);
    await expect(caller().cancelAndRecord({ ...cancelInput(), hn: "FORGED" } as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().recordDocument({ ...noticeInput(), ht: "FORGED" } as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoSideEffects(before); expect(h.reads.every(read => read.sql.includes("klutch_signoff_settings"))).toBe(true);
  });
});
