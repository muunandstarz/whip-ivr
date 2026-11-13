import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
const defaults = html.slice(html.indexOf("const KLUTCH_DEFAULT_HANDLER="), html.indexOf("let F,K;"));
const loadCode = html.slice(html.indexOf("let F,K;"), html.indexOf("function upsert()"));
function environment(draft: Record<string, unknown> | null = null) {
  const data = new Map<string, string>();
  if (draft) data.set("klutch_form_v3", JSON.stringify(draft));
  const context = vm.createContext({
    localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) },
    today: () => "2026-11-13",
  });
  vm.runInContext(`${defaults}\n${loadCode}\nload();`, context);
  return {
    apply: (draft: Record<string, unknown>) => JSON.parse(JSON.stringify(context.applyKlutchHandlerDefaults(draft))),
    state: () => JSON.parse(vm.runInContext("JSON.stringify(F)", context)),
  };
}
const expected = { hn: "Morgan Ellis", ht: "Liability Claims Specialist", dopSignerName: "Morgan Ellis", dopSignerTitle: "Liability Claims Specialist" };

describe("Klutch designated handler attribution", () => {
  it("defaults fresh forms to Morgan and her supplied title without a login identity", () => {
    expect(environment().state()).toMatchObject(expected);
  });
  it("fills persisted empty fields rather than letting empty strings defeat defaults", () => {
    expect(environment({ hn: "", ht: "", dopSignerName: "", dopSignerTitle: "" }).state()).toMatchObject(expected);
  });
  it("replaces obsolete unentered login defaults only in the editable draft", () => {
    expect(environment({ hn: "Old Auto User", ht: "Old Auto Title", handlerNameEntered: false }).state()).toMatchObject(expected);
  });
  it("preserves an explicitly entered alternate handler and title", () => {
    expect(environment({ hn: "Explicit Handler", ht: "Explicit Title", handlerNameEntered: true }).state()).toMatchObject({ hn: "Explicit Handler", ht: "Explicit Title" });
  });
  it("keeps an explicitly edited title for Morgan", () => {
    expect(environment({ hn: "Morgan Ellis", ht: "Explicit Title", handlerNameEntered: true }).state()).toMatchObject({ hn: "Morgan Ellis", ht: "Explicit Title" });
  });
  it("never manufactures a Direction of Pay mark, consent or certificate", () => {
    const value = environment().state();
    for (const key of ["dopSignatureData", "dopSignatureAccepted", "dopSignatureCertifiedAt", "dopSignatureCertificateId"]) expect(value[key]).toBeUndefined();
    expect(value.dopSignatureMode).not.toBe("typed");
  });
  it.each(["dopSignatureData", "dopSignatureAccepted", "dopSignatureCertifiedAt", "dopSignatureCertificateId"])("preserves representative identity whenever %s already exists", (key) => {
    const draft = { dopSignerName: "Original Representative", dopSignerTitle: "Original Title", [key]: key === "dopSignatureAccepted" ? true : "retained-original-evidence" };
    expect(environment(draft).state()).toMatchObject(draft);
  });
  it("does not assign Morgan's title to another unsigned named representative", () => {
    expect(environment({ dopSignerName: "Other Representative", dopSignerTitle: "" }).state()).toMatchObject({ dopSignerName: "Other Representative", dopSignerTitle: "" });
  });
  it("does not modify an issued snapshot when defaulting a separate current draft", () => {
    const snapshot = { hn: "Original Handler", ht: "Original Title", dopSignerName: "Original Signer", dopSignatureAccepted: true };
    const copy = JSON.stringify(snapshot);
    environment().apply({});
    expect(JSON.stringify(snapshot)).toBe(copy);
  });
  it("keeps defaults through reset and async register refresh without adopting currentUser", () => {
    const reset = html.slice(html.indexOf("async function clearFlow()"), html.indexOf('document.addEventListener("click",e=>', html.indexOf("async function clearFlow()")));
    const refresh = html.slice(html.indexOf("async function refreshRegister("), html.indexOf("function saveDraft()"));
    expect(reset).toContain("applyKlutchHandlerDefaults(F)");
    expect(refresh).toContain("applyKlutchHandlerDefaults(F)");
    expect(refresh).not.toContain('F.hn = ""');
    expect(refresh).not.toContain("currentUser.name");
  });
  it("attributes declarations and both endorsements, and uses the real handler block for cancellation", () => {
    const renderer = html.slice(html.indexOf("function buildDoc("), html.indexOf("function ask("));
    expect((renderer.match(/\$\{preparedBy\(\)\}/g) ?? []).length).toBe(3);
    const cancellation = renderer.slice(renderer.indexOf('if(d==="can")'));
    expect(cancellation).toContain("${hand()}");
    expect(cancellation).not.toContain('${L("Policy Services")}');
    expect(html).toContain('["dec","den","car","can","end","pip_history"].includes(d)');
  });
});
