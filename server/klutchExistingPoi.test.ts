import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import vm from "node:vm";
import { Window } from "happy-dom";
import { webcrypto } from "node:crypto";
const mock = vi.hoisted(() => ({ user: { id: 999999 } as any, exact: null as any, reads: [] as string[], writes: [] as string[] }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: async () => mock.user } }));
vi.mock("./klutchSignoff", () => ({
  getKlutchSignoff: async () => ({ name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 0 }),
  assertCanonicalKlutchSignoff: (body: any) => { if (body.hn && body.hn !== "Morgan Ellis") throw new Error("Canonical signoff required"); },
  klutchSignoffInfo: vi.fn(), updateKlutchSignoff: vi.fn(), KlutchSignoffError: class extends Error {},
}));
vi.mock("./klutchPolicies", () => Object.fromEntries([
  "cancelKlutchPolicy", "correctKlutchPolicy", "documentMarylandPipHistory", "findKlutchPoliciesByVin", "getKlutchPolicy", "issueKlutchPolicy", "listKlutchPolicies", "recordKlutchDocument", "renewKlutchPolicy", "saveKlutchDraft", "getKlutchPolicyByExactNumber",
].map(name => [name, async (...args: any[]) => { if (name === "getKlutchPolicyByExactNumber") { mock.reads.push(args[0]); return mock.exact; } mock.writes.push(name); throw new Error("Unexpected mutation in read-only POI test"); }])));
import { authorizeExistingPoiOutput, assertRecordedPoiMatch, existingPoiNumber, signExistingPoi, validateExistingPoi } from "./klutchExistingPoi";
import { registerKlutchPolicyApi } from "./klutchPolicyApi";
const facts = { policyNumber: "EXT-VA-123456", memberName: "Fictional Member", memberNumber: "MEM-123", vin: "5YJ3E1EA1RF000001", state: "VA", effectiveOn: "2025-01-01", expiresOn: "2026-01-01" };
const input = () => ({ sourceMode: "existing", stateConfirmed: true, facts: { ...facts }, source: { ...facts, kind: "external", issuer: "Klutch Risk Retention Group", reference: "FILE-POI-123456-original.pdf", issuedOn: "2024-12-20", attested: true } });
const output = () => ({ ...input(), documentType: "car", lossOn: "2025-11-01", position: "The reviewed determination remains subject to the cited issued terms.", positionReference: "FILE-DETERMINATION-12345", positionConfirmed: true });
let server: Server | undefined;
beforeEach(() => { vi.stubEnv("JWT_SECRET", "synthetic-test-only-never-production"); mock.user = { id: 999999 }; mock.exact = null; mock.reads = []; mock.writes = []; });
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; } vi.unstubAllEnvs(); });
async function request(path: string, body: any) {
  if (!server) { const app = express(); app.use(express.json()); registerKlutchPolicyApi(app); server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server!.listening ? r() : server!.once("listening", r)); }
  const res = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/klutch-policy-documents/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
describe("Actual existing POI — no issuance mutation", () => {
  it("accepts an exact source-attested historical term without extending it to today", () => { expect(validateExistingPoi(input()).facts).toEqual(facts); });
  it.each(["", "x", "DRAFT-KIC-VA-123456", "UNKNOWN", "N/A", "<script>", "EXT 123", "EXT-" + "1".repeat(70)])("rejects invalid or placeholder number %s", number => { expect(() => existingPoiNumber(number)).toThrow(); });
  it.each(Object.keys(facts))("rejects mismatched POI %s", key => { const body: any = input(); body.source[key] = key === "vin" ? "5YJ3E1EA1RF000002" : key === "state" ? "MD" : key === "effectiveOn" ? "2025-02-01" : key === "expiresOn" ? "2027-01-01" : "WRONG"; expect(() => validateExistingPoi(body)).toThrow(); });
  it.each(["2025-02-30", "2025-13-01", "not a date"]) ("rejects invalid dates %s", value => { const body = input(); body.facts.effectiveOn = body.source.effectiveOn = value; expect(() => validateExistingPoi(body)).toThrow(); });
  it("rejects missing attestation, unsupported issuer and empty source", () => { for (const change of [{ attested: false }, { reference: "" }, { issuer: "Other Carrier" }, { issuedOn: "2099-01-01" }]) expect(() => validateExistingPoi({ ...input(), source: { ...input().source, ...change } })).toThrow(); expect(() => validateExistingPoi({ ...input(), stateConfirmed: false })).toThrow(); });
  it("binds verification to the operator and refuses expiry or forgery", () => {
    const token = signExistingPoi(validateExistingPoi(input()), 999999, 1000), body = { ...output(), verificationToken: token };
    expect(authorizeExistingPoiOutput(body, 999999, 2000)).toMatchObject({ issued: false, recorded: false, sent: false });
    expect(() => authorizeExistingPoiOutput(body, 999998, 2000)).toThrow(/another operator/);
    expect(() => authorizeExistingPoiOutput(body, 999999, 1900000)).toThrow(/expired/);
    expect(() => authorizeExistingPoiOutput({ ...body, verificationToken: token + "x" }, 999999, 2000)).toThrow();
  });
  it.each(Object.keys(facts))("rejects source and matching form changed after verification: %s", key => {
    const token = signExistingPoi(validateExistingPoi(input()), 999999), body: any = output(); body.facts[key] = body.source[key] = key === "vin" ? "5YJ3E1EA1RF000002" : key === "state" ? "MD" : key === "effectiveOn" ? "2025-02-01" : key === "expiresOn" ? "2027-01-01" : "CHANGED";
    expect(() => authorizeExistingPoiOutput({ ...body, verificationToken: token }, 999999)).toThrow(/changed/);
  });
  it("rejects a changed source reference and revoked attestation", () => { const token = signExistingPoi(validateExistingPoi(input()), 999999); for (const source of [{ ...input().source, reference: "CHANGED-REFERENCE" }, { ...input().source, attested: false }]) expect(() => authorizeExistingPoiOutput({ ...output(), source, verificationToken: token }, 999999)).toThrow(); });
  it.each(["dec", "den", "end", "can", "pip_history", "dop"]) ("does not synthesize external policy document %s", documentType => { const token = signExistingPoi(validateExistingPoi(input()), 999999); expect(() => authorizeExistingPoiOutput({ ...output(), documentType, verificationToken: token }, 999999)).toThrow(/correspondence only/); });
  it.each(["2024-12-31", "2026-01-01", "2026-11-20", "2025-02-30"]) ("rejects loss outside original authentic term %s", lossOn => { const token = signExistingPoi(validateExistingPoi(input()), 999999); expect(() => authorizeExistingPoiOutput({ ...output(), lossOn, verificationToken: token }, 999999)).toThrow(/date of loss/); });
  it("requires the reviewed coverage determination separately from POI", () => { const token = signExistingPoi(validateExistingPoi(input()), 999999); for (const change of [{ positionConfirmed: false }, { position: "" }, { positionReference: "" }]) expect(() => authorizeExistingPoiOutput({ ...output(), ...change, verificationToken: token }, 999999)).toThrow(/reviewed coverage/); });
  it("loads only an exact matching recorded member, VIN, state and historical term", () => {
    const verified = validateExistingPoi({ ...input(), source: { ...input().source, kind: "recorded" } }); const p = { ...facts, termsHistory: [{ effectiveOn: facts.effectiveOn, expiresOn: facts.expiresOn, terms: { ...facts } }] };
    expect(assertRecordedPoiMatch(verified, p)).toMatchObject({ effectiveOn: facts.effectiveOn });
    expect(() => assertRecordedPoiMatch(verified, { ...p, policyNumber: "EXT-VA-1234567" })).toThrow(/exact/);
    expect(() => assertRecordedPoiMatch(verified, { ...p, termsHistory: [] })).toThrow(/historical term/);
  });
  it("verifies and authorizes external correspondence via authenticated read-only APIs", async () => {
    const verified = await request("existing-poi/verify", input()); expect(verified.status).toBe(200);
    const result = await request("existing-poi/output", { ...output(), verificationToken: verified.body.verificationToken }); expect(result.status).toBe(200); expect(result.body).toMatchObject({ mode: "source_backed_correspondence", issued: false, recorded: false, sent: false }); expect(mock.reads).toEqual([facts.policyNumber, facts.policyNumber]); expect(mock.writes).toEqual([]);
  });
  it("does not override an existing exact shared-register number", async () => { mock.exact = { ...facts }; expect((await request("existing-poi/verify", input())).status).toBe(400); expect(mock.writes).toEqual([]); });
  it("rechecks the registry at output to reject a number recorded after verification", async () => { const verified = await request("existing-poi/verify", input()); mock.exact = { ...facts }; const result = await request("existing-poi/output", { ...output(), verificationToken: verified.body.verificationToken }); expect(result.status).toBe(400); expect(mock.writes).toEqual([]); });
  it("requires authentication and rejects forged canonical signoff", async () => { mock.user = null; expect((await request("existing-poi/verify", input())).status).toBe(401); mock.user = { id: 999999 }; expect((await request("existing-poi/verify", { ...input(), hn: "Forged" })).status).toBe(400); expect(mock.writes).toEqual([]); });
  it.each(["issue", "renew", "correct", "pip-history", "document", "cancel"])("blocks existing POI from mutation endpoint %s", async path => { const res = await request(path, { ...input(), snapshot: { sourceMode: "existing" } }); expect(res.status).toBe(400); expect(res.body.error).toContain("correspondence-only"); expect(mock.writes).toEqual([]); });
});
describe("Letter-tab create-number and honest correspondence rendering", () => {
  const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
  it("exposes creation inputs and button on letter tabs, not just declarations", () => {
    const form = html.slice(html.indexOf("function buildForm(){"), html.indexOf("function calc(){"));
    expect(form).toContain('data-act="genpol">Create policy number'); expect(form).toContain('d!=="dop"&&F.sourceMode!=="existing"');
    expect(html).toContain('await createPolicyNumber()'); expect(html).toContain('Confirm policy issuance'); expect(html).toContain('Prepare marked draft');
    const flow = html.slice(html.indexOf("async function durablePrint"), html.indexOf('document.addEventListener("click", async event'));
    expect(flow).toContain('detail==="policy number"'); expect(flow.indexOf('if(F.sourceMode==="existing")')).toBeLessThan(flow.indexOf('persistTermIfNeeded()'));
  });
  it("renders only entered reviewed position with entered number, source provenance and locked Morgan identity", () => {
    const context = vm.createContext({ LOGO: "test-logo", FOOT: "footer", esc: (x: unknown) => String(x ?? "").replaceAll("<", "&lt;"), ld: (x: unknown) => String(x || ""), today: () => "2026-11-20", klutchSignoffAccess: { signoff: { name: "Morgan Ellis", title: "Liability Claims Specialist" } } });
    vm.runInContext(html.slice(html.indexOf("function buildExistingPoiCorrespondence"), html.indexOf("function buildForm(){")), context);
    const rendered = context.buildExistingPoiCorrespondence({}, { pn: facts.policyNumber, member: facts.memberName, mno: facts.memberNumber, vin: facts.vin, vehicle: "Fictional Vehicle", dol: "2025-11-01", carrier: "Fictional Carrier", attn: "Fictional Adjuster", caddr: "Fictional Address", ccity: "Fictional City", cclm: "CLAIM-123", poiPosition: "<script>not executable</script> Reviewed authentic position", poiPositionRef: "FILE-DETERMINATION-123", poiPositionConfirmed: true, poiReference: "ORIGINAL-POI-123", poiIssuer: "Klutch Risk Retention Group", poiIssuedOn: "2024-12-20", hn: "Forged", ht: "Forged" });
    expect(rendered.miss).toEqual([]); expect(rendered.html).toContain(facts.policyNumber); expect(rendered.html).toContain("ORIGINAL-POI-123"); expect(rendered.html).toContain("Morgan Ellis"); expect(rendered.html).toContain("Liability Claims Specialist"); expect(rendered.html).not.toContain("Forged"); expect(rendered.html).not.toContain("<script>"); expect(rendered.html).not.toContain("Klutch has denied coverage"); expect(rendered.html).not.toContain("KIC-END-002"); expect(rendered.html).toContain("does not issue, register, renew, endorse, cancel");
  });
});

describe("Actual embedded UI execution without browser or network", () => {
  const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
  async function ui(overrides: Record<string, unknown> = {}) {
    const window = new Window({ url: "http://synthetic.test/klutch-policy-documents.html", settings: { disableJavaScriptEvaluation: true } });
    window.document.write(html);
    const base = { sourceMode: "new", sel: "car", ptype: "n", st: "VA", stateConfirmed: true, confirmedState: "VA", member: "Fictional Member", mno: "MEM-123", address: "123 Fictional Street", city: "Fictional City", cst: "VA", zip: "22001", vehicle: "2026 Fictional Vehicle", vin: facts.vin, eff: "2026-08-01", term: "12", date: "2026-11-20", lease: "a", pip: "w", um: "a", ...overrides };
    window.localStorage.setItem("klutch_form_v3", JSON.stringify(base));
    const calls: any[] = []; let policy: any = null;
    const context = vm.createContext({ window, document: window.document, localStorage: window.localStorage, location: window.location, history: window.history, navigator: window.navigator, crypto: webcrypto, console, innerWidth: 1440, Image: window.Image, FileReader: window.FileReader, setTimeout: () => 1, clearTimeout: () => {}, fetch: async (url: string, options: any = {}) => {
      const path = url.replace("/api/klutch-policy-documents", ""); const body = options.body ? JSON.parse(options.body) : {}; calls.push({ path, body });
      let data: any;
      if (path === "/signoff") data = { signoff: { name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 0 }, canEdit: false };
      else if (path === "/register") data = { policies: policy ? [policy] : [] };
      else if (path.startsWith("/vin/")) data = { policies: [] };
      else if (path === "/issue") { policy = { id: 999999, policyNumber: "KIC-VA-999991", state: "VA", status: "active", effectiveOn: body.effectiveOn, expiresOn: body.expiresOn, terms: body.terms }; data = { policy, declarationTerms: [] }; }
      else throw new Error("Unexpected UI API call " + path);
      return { ok: true, json: async () => data };
    } });
    for (const [, script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(script, context);
    await vi.waitFor(() => expect(vm.runInContext("klutchSignoffAccess.ready", context)).toBe(true));
    return { context, window, calls };
  }
  it("creates an authoritative number from the coverage letter with complete original inputs", async () => {
    const { context, window, calls } = await ui();
    try {
      expect(window.document.querySelector('[data-k="address"]')).not.toBeNull();
      expect(window.document.querySelector('[data-act="genpol"]')?.textContent).toBe("Create policy number");
      (window.document.querySelector('[data-act="genpol"]') as any).click();
      await vi.waitFor(() => expect(window.document.querySelector('[data-r="1"]')?.textContent).toBe("Confirm policy issuance"));
      (window.document.querySelector('[data-r="1"]') as any).click();
      await vi.waitFor(() => expect(vm.runInContext("F.pn", context)).toBe("KIC-VA-999991"));
      expect(vm.runInContext("F.sel", context)).toBe("car"); expect(calls.filter(c => c.path === "/issue")).toHaveLength(1);
      expect(calls.find(c => c.path === "/issue").body.terms).toMatchObject({ memberName: "Fictional Member", state: "VA", effectiveOn: "2026-08-01", expiresOn: "2027-08-01" });
    } finally { await window.happyDOM.close(); }
  });
  it("offers marked draft when actual authoritative facts are missing, without issuing", async () => {
    const { context, window, calls } = await ui({ member: "" });
    try {
      (window.document.querySelector('[data-act="genpol"]') as any).click();
      await vi.waitFor(() => expect(window.document.querySelector('[data-r="1"]')?.textContent).toBe("Prepare marked draft"));
      (window.document.querySelector('[data-r="1"]') as any).click();
      await vi.waitFor(() => expect(vm.runInContext("F.pn", context)).toMatch(/^DRAFT-KIC-VA-/));
      expect(calls.filter(c => c.path === "/issue")).toHaveLength(0);
    } finally { await window.happyDOM.close(); }
  });
  it("preserves exact external term, clears attestation on source edit and blocks replacement declarations", async () => {
    const { context, window, calls } = await ui({ sourceMode: "existing", pn: facts.policyNumber, eff: facts.effectiveOn, exp: facts.expiresOn, poiAttested: true });
    try {
      expect(vm.runInContext("F.exp", context)).toBe(facts.expiresOn); expect(vm.runInContext("F.poiAttested", context)).toBe(false);
      vm.runInContext('F.poiAttested=true;buildForm();preview()', context);
      const field = window.document.querySelector('[data-k="poiReference"]') as any; field.value = "CHANGED-SOURCE-REFERENCE"; field.dispatchEvent(new window.Event("input", { bubbles: true }));
      expect(vm.runInContext("F.poiAttested", context)).toBe(false);
      expect(JSON.parse(window.localStorage.getItem("klutch_form_v3")!).poiAttested).toBe(false);
      vm.runInContext('F.sel="dec";buildForm();preview()', context);
      expect((window.document.querySelector("#prt") as any).disabled).toBe(true); expect(window.document.querySelector("#pv .sheet")).toBeNull();
      expect(calls.filter(c => ["/issue", "/draft", "/document", "/cancel", "/renew"].includes(c.path))).toEqual([]);
    } finally { await window.happyDOM.close(); }
  });
});
