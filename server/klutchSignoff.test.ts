import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
const h = vi.hoisted(() => ({
  env: { ownerOpenId: "SYNTHETIC_OWNER_OPEN_ID" }, user: null as any,
  settings: null as any, pending: null as any, audits: [] as any[], pendingAudits: [] as any[],
  writes: [] as { sql: string; args: any[] }[], reads: [] as string[], opened: 0,
  conn: {} as any, policy: {} as any, term: {} as any, failAudit: false, conflictInsert: false,
}));
vi.mock("./_core/env", () => ({ ENV: h.env }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: async () => h.user } }));
vi.mock("mysql2/promise", () => ({ default: { createConnection: async () => { h.opened++; return h.conn; } } }));
import { assertCanonicalKlutchSignoff, canEditKlutchSignoff, getKlutchSignoff, klutchSignoffInfo, normalizeKlutchSignoffAliases, requireKlutchSignoffSameOrigin, updateKlutchSignoff } from "./klutchSignoff";
import { cancelKlutchPolicy, correctKlutchPolicy, issueKlutchPolicy, loadKlutchDraft, recordKlutchDocument, renewKlutchPolicy, saveKlutchDraft } from "./klutchPolicies";
import { registerKlutchPolicyApi } from "./klutchPolicyApi";
import { klutchPoliciesRouter } from "./routers/klutchPolicies";
const owner = { id: 90001, openId: "SYNTHETIC_OWNER_OPEN_ID", role: "admin", name: "Jasmine Lane Acosta", email: "synthetic-owner@example.invalid" };
const handler = { id: 999990, openId: "SYNTHETIC_HANDLER_OPEN_ID", role: "user", name: "Actual Operator", email: "synthetic-handler@example.invalid" };
const defaults = { name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 0 };
const changed = { name: "SYNTHETIC Approved Representative", title: "SYNTHETIC Approved Title", revision: 1 };
const actor = { userId: handler.id, name: handler.name };
const input = { name: changed.name, title: changed.title, revision: 0 };
const request = (origin: string | undefined = "http://localhost:3000", extra: Record<string, unknown> = {}, host = "localhost:3000") => ({ headers: { origin, "sec-fetch-site": "same-origin", ...extra }, get: (key: string) => key === "host" ? host : undefined }) as any;
const terms = { leaseId: "SYNTHETIC", memberName: "SYNTHETIC MEMBER", memberNumber: "SYNTHETIC", vehicle: "SYNTHETIC VEHICLE", vin: "5YJ3E1EA1RF000001", state: "VA" as const, effectiveOn: "2026-01-01", expiresOn: "2027-01-01", termMonths: 12 as const, transactionType: "new" as const, coverages: [{ label: "Liability", limit: "$100,000", premium: 100 }], totalPremium: 100, tncUseNote: "" };
let server: Server | undefined;
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://synthetic-never-connected.invalid/test");
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("KLUTCH_APP_ORIGIN", "");
  h.env.ownerOpenId = owner.openId; h.user = { ...owner };
  h.settings = null; h.pending = null; h.audits = []; h.pendingAudits = []; h.writes = []; h.reads = []; h.opened = 0; h.failAudit = false; h.conflictInsert = false;
  h.policy = { id: 998, policy_number: "KIC-VA-999998", status: "active", state: "VA", terms, member_name: terms.memberName, vin_normalized: terms.vin, lease_id: terms.leaseId };
  h.term = { id: 997, policy_id: 998, term_number: 1, revision_number: 1, expires_on: terms.expiresOn, terms };
  h.conn = {
    beginTransaction: vi.fn(async () => { h.pending = structuredClone(h.settings); h.pendingAudits = [...h.audits]; }),
    commit: vi.fn(async () => { h.settings = structuredClone(h.pending); h.audits = [...h.pendingAudits]; }),
    rollback: vi.fn(async () => { h.pending = structuredClone(h.settings); h.pendingAudits = [...h.audits]; }), end: vi.fn(),
    execute: vi.fn(async (sql: string, args: any[] = []) => {
      if (sql.startsWith("SELECT")) {
        h.reads.push(sql);
        if (sql.includes("FROM klutch_signoff_settings")) return [[...(h.pending ?? h.settings ? [h.pending ?? h.settings] : [])], []];
        if (sql.includes("issue_request_key =")) return [[], []];
        if (sql.includes("FROM klutch_policy_drafts")) return [[{ handler_name: "Old Handler", handler_title: "Old Title", draft: { hn: "Old Handler", ht: "Old Title", dopSignerName: "Real Metrocars Signer", dopSignatureData: "retained-mark" } }], []];
        if (sql.includes("FROM klutch_policies")) return [[h.policy], []];
        if (sql.includes("FROM klutch_policy_terms")) return [[h.term], []];
        return [[], []];
      }
      h.writes.push({ sql, args });
      if (sql.startsWith("INSERT INTO klutch_signoff_settings")) {
        if (h.conflictInsert) throw Object.assign(new Error("synthetic duplicate"), { code: "ER_DUP_ENTRY" });
        h.pending = { name: args[0], title: args[1], revision: args[2] };
      }
      if (sql.startsWith("UPDATE klutch_signoff_settings")) h.pending = { name: args[0], title: args[1], revision: args[2] };
      if (sql.startsWith("INSERT INTO klutch_signoff_events")) {
        if (h.failAudit) throw new Error("SYNTHETIC audit unavailable");
        h.pendingAudits.push({ args });
      }
      return [{ insertId: 77, affectedRows: 1 }, []];
    }),
  };
});
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; } vi.unstubAllEnvs(); });
function caller(user: any = owner, req = request()) { return klutchPoliciesRouter.createCaller({ user, req, res: {} as any }); }
async function http(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  if (!server) {
    const app = express(); app.use(express.json()); registerKlutchPolicyApi(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.listening ? resolve() : server!.once("listening", resolve));
  }
  const address = server.address() as { port: number };
  const result = await fetch(`http://127.0.0.1:${address.port}/api/klutch-policy-documents${path}`, { method, headers: { "content-type": "application/json", origin: `http://127.0.0.1:${address.port}`, "sec-fetch-site": "same-origin", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: result.status, body: await result.json() };
}
describe("Klutch exact project-owner authorization", () => {
  it("returns Morgan defaults at revision zero without any GET write", async () => {
    expect(await klutchSignoffInfo(owner, request())).toEqual({ signoff: defaults, canEdit: true });
    expect(await getKlutchSignoff()).toEqual(defaults); expect(h.writes).toEqual([]); expect(h.conn.beginTransaction).not.toHaveBeenCalled();
  });
  it.each([
    ["ordinary handler", handler],
    ["other admin", { ...handler, role: "admin" }],
    ["spoofed owner name/email/id", { ...owner, openId: "SYNTHETIC_OTHER_ADMIN" }],
    ["owner without admin role", { ...owner, role: "user" }],
    ["empty authenticated identity", { ...owner, openId: "" }],
    ["whitespace identity", { ...owner, openId: " " }],
    ["prefix owner match", { ...owner, openId: `${owner.openId}-spoof` }],
    ["impersonation flag", { ...owner, isImpersonating: true }],
  ])("denies %s without connecting or mutating", async (_label, user) => {
    expect(canEditKlutchSignoff(user as any, request())).toBe(false);
    await expect(updateKlutchSignoff(user as any, request(), input)).rejects.toMatchObject({ status: 403 });
    expect(h.opened).toBe(0); expect(h.writes).toEqual([]); expect(h.settings).toBeNull(); expect(h.audits).toEqual([]);
  });
  it.each(["42", "", "invalid", "90001"])("denies owner with impersonation header %j", async value => {
    const req = request(undefined, { "x-impersonate-handler-id": value });
    expect(canEditKlutchSignoff(owner, req)).toBe(false);
    await expect(updateKlutchSignoff(owner, req, input)).rejects.toMatchObject({ status: 403 }); expect(h.opened).toBe(0);
  });
  it.each(["", " "])("fails closed when configured owner is %j", async value => {
    h.env.ownerOpenId = value;
    expect(canEditKlutchSignoff({ ...owner, openId: value }, request())).toBe(false);
    await expect(updateKlutchSignoff(owner, request(), input)).rejects.toMatchObject({ status: 403 }); expect(h.writes).toEqual([]);
  });
  it("allows the exact SDK identity, CAS updates one row and appends actual actor audit transactionally", async () => {
    expect(await updateKlutchSignoff(owner, request(), input)).toEqual({ signoff: changed, canEdit: true });
    expect(h.settings).toEqual(changed); expect(h.audits).toHaveLength(1);
    expect(h.audits[0].args).toEqual([0, 1, defaults.name, defaults.title, changed.name, changed.title, owner.id, owner.openId, owner.name]);
    expect(h.conn.beginTransaction).toHaveBeenCalledOnce(); expect(h.conn.commit).toHaveBeenCalledOnce();
    expect(h.reads).toContain("SELECT name, title, revision FROM klutch_signoff_settings WHERE id = 1 FOR UPDATE");
    h.writes = [];
    const next = await updateKlutchSignoff(owner, request(), { name: "SYNTHETIC Next", title: changed.title, revision: 1 });
    expect(next.signoff.revision).toBe(2); expect(h.audits).toHaveLength(2);
    expect(h.writes[0].sql).toContain("WHERE id = 1 AND revision = ?");
    expect(h.writes.some(w => /(?:UPDATE|DELETE).*klutch_signoff_events/.test(w.sql))).toBe(false);
  });
  it("rejects a stale revision without modifying settings or audit", async () => {
    h.settings = { ...changed }; await expect(updateKlutchSignoff(owner, request(), input)).rejects.toMatchObject({ status: 409 });
    expect(h.writes).toEqual([]); expect(h.settings).toEqual(changed); expect(h.audits).toEqual([]); expect(h.conn.rollback).toHaveBeenCalledOnce();
  });
  it("rolls back settings when append-only audit insert fails", async () => {
    h.failAudit = true; await expect(updateKlutchSignoff(owner, request(), input)).rejects.toThrow(/audit unavailable/);
    expect(h.settings).toBeNull(); expect(h.audits).toEqual([]); expect(h.conn.commit).not.toHaveBeenCalled(); expect(h.conn.rollback).toHaveBeenCalledOnce();
  });
  it("maps a concurrent first-row race to revision conflict and rolls back", async () => {
    h.conflictInsert = true; await expect(updateKlutchSignoff(owner, request(), input)).rejects.toMatchObject({ status: 409 });
    expect(h.settings).toBeNull(); expect(h.audits).toEqual([]); expect(h.conn.rollback).toHaveBeenCalledOnce();
  });
  it("no-op saves do not bump revision or append an event", async () => {
    expect(await updateKlutchSignoff(owner, request(), defaults)).toEqual({ signoff: defaults, canEdit: true }); expect(h.writes).toEqual([]);
  });
  it.each([{ name: "", title: "Title", revision: 0 }, { name: "Name", title: "", revision: 0 }, { ...input, revision: -1 }, { ...input, revision: "0" }, { ...input, extra: "forged" }])("rejects malformed explicit settings %j before connecting", async value => {
    await expect(updateKlutchSignoff(owner, request(), value)).rejects.toMatchObject({ status: 400 }); expect(h.opened).toBe(0);
  });
});
describe("Klutch fail-closed same-origin setting edits", () => {
  it.each([undefined, "null", "https://evil.example", "http://localhost:3000/path", "http://user@localhost:3000", "http://localhost:3001"])("rejects hostile or missing origin %j without writes", async origin => {
    await expect(updateKlutchSignoff(owner, request(origin, { origin }), input)).rejects.toMatchObject({ status: 403 }); expect(h.opened).toBe(0); expect(h.writes).toEqual([]);
  });
  it.each(["cross-site", "same-site"])("rejects %s fetch metadata despite approved origin", async site => {
    await expect(updateKlutchSignoff(owner, request("http://localhost:3000", { "sec-fetch-site": site }), input)).rejects.toMatchObject({ status: 403 }); expect(h.writes).toEqual([]);
  });
  it("ignores spoofed forwarded Host and production Host and supports exact configured origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => requireKlutchSignoffSameOrigin(request("https://evil.example", { "x-forwarded-host": "whipclaimsivr.com", "x-forwarded-proto": "https" }, "evil.example"))).toThrow();
    expect(() => requireKlutchSignoffSameOrigin(request("https://whipclaimsivr.com", {}, "internal-service:3000"))).not.toThrow();
    vi.stubEnv("KLUTCH_APP_ORIGIN", "https://whipclaimsivr.com");
    expect(() => requireKlutchSignoffSameOrigin(request("https://www.whipclaimsivr.com"))).toThrow();
    expect(() => requireKlutchSignoffSameOrigin(request("https://whipclaimsivr.com"))).not.toThrow();
    vi.stubEnv("KLUTCH_APP_ORIGIN", "invalid"); expect(() => requireKlutchSignoffSameOrigin(request("https://whipclaimsivr.com"))).toThrow();
  });
});
describe("Klutch raw REST and tRPC boundaries", () => {
  it("uses exact GET/POST and tRPC response contracts", async () => {
    expect(await http("/signoff")).toEqual({ status: 200, body: { signoff: defaults, canEdit: true } });
    expect(await caller().signoff()).toEqual({ signoff: defaults, canEdit: true });
    expect(await http("/signoff", "POST", input)).toEqual({ status: 200, body: { signoff: changed, canEdit: true } });
    expect(await caller().updateSignoff({ name: changed.name, title: "SYNTHETIC Next Title", revision: 1 })).toEqual({ signoff: { ...changed, title: "SYNTHETIC Next Title", revision: 2 }, canEdit: true });
  });
  it("returns 401 for unauthenticated REST and UNAUTHORIZED for tRPC", async () => {
    h.user = null; expect((await http("/signoff")).status).toBe(401); expect((await http("/signoff", "POST", input)).status).toBe(401);
    await expect(caller(null).signoff()).rejects.toMatchObject({ code: "UNAUTHORIZED" }); expect(h.opened).toBe(0);
  });
  it.each([handler, { ...handler, role: "admin" }, { ...owner, openId: "SYNTHETIC SPOOF" }])("denies non-owner settings for both transports %j", async user => {
    h.user = user; expect((await http("/signoff")).body.canEdit).toBe(false);
    expect((await http("/signoff", "POST", input)).status).toBe(403);
    await expect(caller(user).updateSignoff(input)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(h.writes).toEqual([]);
  });
  it("denies impersonated owner GET edit flag and both setting transports", async () => {
    expect((await http("/signoff", "GET", undefined, { "x-impersonate-handler-id": "42" })).body.canEdit).toBe(false);
    expect((await http("/signoff", "POST", input, { "x-impersonate-handler-id": "42" })).status).toBe(403);
    await expect(caller(owner, request("http://localhost:3000", { "x-impersonate-handler-id": "42" })).updateSignoff(input)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(h.writes).toEqual([]);
  });
  it("returns REST 409/tRPC CONFLICT for stale saves and 403/FORBIDDEN for hostile origin", async () => {
    h.settings = { ...changed };
    expect((await http("/signoff", "POST", input)).status).toBe(409);
    await expect(caller().updateSignoff(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await http("/signoff", "POST", { ...input, revision: 1 }, { origin: "https://evil.example" })).status).toBe(403);
    await expect(caller(owner, request("https://evil.example")).updateSignoff({ ...input, revision: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(h.writes).toEqual([]);
  });
  it.each(["draft", "issue", "renew", "correct", "document", "cancel", "pip-history"])("rejects forged REST %s top-level attribution before any side effect", async path => {
    const result = await http(`/${path}`, "POST", { hn: "FORGED SIGNOFF", draft: {}, snapshot: {}, terms });
    expect([400, 403]).toContain(result.status); expect(h.writes).toEqual([]); expect(h.conn.beginTransaction).not.toHaveBeenCalled();
  });
  it.each(["saveDraft", "issue", "renew", "correct", "recordDocument", "cancelAndRecord"])("checks raw unknown aliases before Zod stripping for tRPC %s", async method => {
    await expect((caller(handler) as any)[method]({ hn: "FORGED SIGNOFF", draft: {}, snapshot: {}, documentSnapshot: {}, terms })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.writes).toEqual([]); expect(h.conn.beginTransaction).not.toHaveBeenCalled();
  });
  it("allows ordinary handlers to save canonical drafts without owner or manager gates", async () => {
    const result = await caller(handler).saveDraft({ handlerName: defaults.name, handlerTitle: defaults.title, draft: { hn: defaults.name, ht: defaults.title } });
    expect(result).toEqual({ ok: true, signoff: defaults });
  });
  it("returns canonical draft info in REST and does not adopt operator identity", async () => {
    h.user = handler;
    expect(await http("/draft", "POST", { draft: {} })).toEqual({ status: 200, body: { ok: true, signoff: defaults } });
    expect(h.writes[0].args.slice(0, 3)).toEqual([handler.id, defaults.name, defaults.title]);
  });
});
describe("Klutch immutable storage aliases and separate real Direction of Pay signer", () => {
  it.each(["hn", "ht", "handlerName", "handlerTitle"])("rejects a forged %s alias even nested", key => {
    expect(() => assertCanonicalKlutchSignoff({ terms: { snapshot: { [key]: "FORGED" } } }, defaults)).toThrow();
  });
  it("normalizes all aliases on a clone while keeping operator and actual DOP evidence untouched", () => {
    const real = { dopSignerName: "Real Metrocars Representative", dopSignerTitle: "Treasurer", dopSignatureData: "data:image/png;base64,SYNTHETIC", dopSignatureMode: "draw", dopSignatureAccepted: true, dopSignatureCertificateId: "SYNTHETIC CERTIFICATE", dopSignatureCertifiedAt: "2026-11-01T12:00:00Z" };
    const original = { hn: ` ${defaults.name} `, ht: defaults.title, handlerName: defaults.name, handlerTitle: defaults.title, nested: { handler: { name: defaults.name, title: defaults.title } }, ...real };
    const before = JSON.stringify(original); assertCanonicalKlutchSignoff(original, defaults);
    expect(normalizeKlutchSignoffAliases(original, defaults)).toMatchObject({ hn: defaults.name, ht: defaults.title, handlerName: defaults.name, handlerTitle: defaults.title, signoffRevision: 0, ...real });
    expect(JSON.stringify(original)).toBe(before);
    expect(normalizeKlutchSignoffAliases({}, defaults)).not.toHaveProperty("dopSignerName");
  });
  it("stores canonical document title and snapshot, actual operator identity, and unchanged real DOP", async () => {
    h.settings = { ...changed };
    const snapshot = { dopSignerName: "Real Metrocars Representative", dopSignerTitle: "Treasurer", dopSignatureData: "SYNTHETIC MARK", dopSignatureAccepted: true, dopSignatureCertificateId: "SYNTHETIC CERTIFICATE", dopSignatureCertifiedAt: "2026-11-01T12:00:00Z" };
    const before = JSON.stringify(snapshot);
    await recordKlutchDocument({ policyId: 998, documentType: "direction_of_pay", snapshot }, actor);
    const insert = h.writes.find(w => w.sql.includes("INSERT INTO klutch_policy_documents"))!;
    expect(insert.args[10]).toBe(changed.title); expect(insert.args[12]).toBe(handler.id); expect(insert.args[13]).toBe(handler.name);
    expect(JSON.parse(insert.args[11])).toEqual({ ...snapshot, hn: changed.name, ht: changed.title, handlerName: changed.name, handlerTitle: changed.title, signoffRevision: 1 });
    const audit = h.writes.find(w => w.sql.includes("INSERT INTO klutch_policy_events"))!;
    expect(audit.args[2]).toBe(handler.name); expect(JSON.parse(audit.args[3]).handler).toEqual({ name: changed.name, title: changed.title });
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it("rejects forged document and cancellation aliases before claims, cancellation, or document writes", async () => {
    for (const call of [
      () => recordKlutchDocument({ policyId: 998, documentType: "declarations", claimNumber: "SYNTHETIC CLAIM", snapshot: { handlerTitle: "FORGED" } }, actor),
      () => cancelKlutchPolicy({ policyId: 998, cancelledOn: "2026-11-01", claimNumber: "SYNTHETIC CLAIM", documentSnapshot: { hn: "FORGED" } }, actor),
      () => recordKlutchDocument({ policyId: 998, documentType: "declarations", snapshot: {} }, { ...actor, handlerName: "FORGED" }),
    ]) { await expect(call()).rejects.toMatchObject({ status: 403 }); }
    expect(h.writes).toEqual([]); expect(h.policy.status).toBe("active"); expect(h.reads.every(sql => sql.includes("klutch_signoff_settings"))).toBe(true);
  });
  it("requires canonical per-document names even when the actor is the owner", async () => {
    await expect(recordKlutchDocument({ policyId: 998, documentType: "declarations", snapshot: { hn: owner.name } }, { userId: owner.id, name: owner.name })).rejects.toMatchObject({ status: 403 }); expect(h.writes).toEqual([]);
  });
  it("rejects forged issue/renew/correct terms before register or policy side effects", async () => {
    const forged = { ...terms, hn: "FORGED" };
    await expect(issueKlutchPolicy({ issueRequestKey: "SYNTHETIC_ISSUE_REQUEST", leaseId: terms.leaseId, state: terms.state, effectiveOn: terms.effectiveOn, expiresOn: terms.expiresOn, terms: forged }, actor)).rejects.toMatchObject({ status: 403 });
    await expect(renewKlutchPolicy(998, terms.effectiveOn, terms.expiresOn, forged, actor)).rejects.toMatchObject({ status: 403 });
    await expect(correctKlutchPolicy(998, forged, actor)).rejects.toMatchObject({ status: 403 });
    expect(h.writes).toEqual([]); expect(h.reads.every(sql => sql.includes("klutch_signoff_settings"))).toBe(true);
  });
  it("rejects forged draft before mutation and loads old editable draft with current aliases only", async () => {
    await expect(saveKlutchDraft(handler.id, undefined, undefined, { ht: "FORGED" })).rejects.toMatchObject({ status: 403 }); expect(h.writes).toEqual([]);
    const loaded = await loadKlutchDraft(handler.id);
    expect(loaded).toMatchObject({ handlerName: defaults.name, handlerTitle: defaults.title, signoff: defaults, draft: { hn: defaults.name, ht: defaults.title, dopSignerName: "Real Metrocars Signer", dopSignatureData: "retained-mark" } }); expect(h.writes).toEqual([]);
  });
  it("preserves old issuance replay term snapshots without rewriting aliases or fingerprint behavior", async () => {
    const oldTerms = { ...terms, hn: "Historical Issued Handler", ht: "Historical Issued Title" };
    h.term = { ...h.term, terms: oldTerms }; h.policy = { ...h.policy, terms: oldTerms, initial_issue_fingerprint: "" };
    const execute = h.conn.execute;
    h.conn.execute = vi.fn(async (sql: string, args: any[]) => sql.includes("issue_request_key =") ? [[h.policy], []] : execute(sql, args));
    const before = JSON.stringify(h.term);
    const result = await issueKlutchPolicy({ issueRequestKey: "SYNTHETIC_OLD_REQUEST", leaseId: terms.leaseId, state: terms.state, effectiveOn: terms.effectiveOn, expiresOn: terms.expiresOn, terms }, actor);
    expect(result.replayed).toBe(true); expect(result.declarationTerms[0].terms).toEqual(oldTerms); expect(JSON.stringify(h.term)).toBe(before); expect(h.writes).toEqual([]);
  });
  it("ships only an additive two-table migration, no historic policy writes", () => {
    const sql = fs.readFileSync("drizzle/0030_klutch_signoff_settings.sql", "utf8").replace(/^--.*$/gm, "");
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(2); expect(sql).not.toMatch(/^\s*(?:DROP|ALTER|INSERT|UPDATE|DELETE)\b/m); expect(sql).toContain("klutch_signoff_events_revision_uq");
  });
});
