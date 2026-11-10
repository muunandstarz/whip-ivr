import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
const helper = html.slice(html.indexOf("function mdPipChangePeriod("), html.indexOf("function mdPipForm("));
const months = html.match(/function addMonths\(iso,n\)\{[^\n]+/u)![0];
const date = html.match(/function validMdDate\(v\)\{[^\n]+/u)![0];
const context = vm.createContext({ pad: (n: number) => String(n).padStart(2, "0"), mdPipHistory: (s: any) => ({ changes: s.mdPipChanges }) });
vm.runInContext(`${months}\n${date}\n${helper}`, context);
const period = (s: any, c: any, i = 0) => JSON.parse(JSON.stringify(context.mdPipChangePeriod(s, c, i)));
const change = { effectiveOn: "2026-05-15" };
const state = {
  pn: "KIC-MD-999991", eff: "2025-08-01", term: "12", lease: "a", mdPipRequireIssuedTerms: true,
  mdPipChanges: [change],
  mdPipPolicyTerms: [
    { termNumber: 1, effectiveOn: "2025-08-01", expiresOn: "2026-08-01" },
    { termNumber: 2, effectiveOn: "2026-08-01", expiresOn: "2027-08-01" },
  ],
};

describe("Maryland PIP endorsement layout and unchanged term", () => {
  it("uses the original issued term around the change, not the latest renewal or a new year from the change", () => {
    const before = JSON.stringify(state);
    expect(period(state, change)).toEqual({ termStart: "2025-08-01", termEnd: "2026-08-01", appliesUntil: "2026-08-01", endReason: "Unchanged policy-term expiration", verified: true });
    expect(JSON.stringify(state)).toBe(before);
  });
  it("assigns a change on a renewal boundary to that separate issued term", () => {
    expect(period(state, { effectiveOn: "2026-08-01" })).toMatchObject({ termStart: "2026-08-01", termEnd: "2027-08-01" });
  });
  it("ends the selection at an intervening documented change without changing the term expiration", () => {
    expect(period({ ...state, mdPipChanges: [change, { effectiveOn: "2026-06-01" }] }, change)).toMatchObject({ termEnd: "2026-08-01", appliesUntil: "2026-06-01", endReason: "Next documented PIP change" });
  });
  it("honors earlier cancellation without extending or overwriting the original expiration", () => {
    expect(period({ ...state, lease: "t", cdate: "2026-07-01" }, change)).toMatchObject({ termEnd: "2026-08-01", appliesUntil: "2026-07-01", endReason: "Recorded policy cancellation" });
  });
  it("will not invent a missing issued term or extend past its exclusive expiration", () => {
    expect(period({ ...state, mdPipPolicyTerms: [] }, change)).toMatchObject({ termStart: "", termEnd: "", verified: false });
    expect(period(state, { effectiveOn: "2027-08-01" })).toMatchObject({ termStart: "", termEnd: "", verified: false });
  });
  it("allows a clearly unissued preview to use the normal policy term plan, never a plan from the PIP date", () => {
    expect(period({ ...state, pn: "DRAFT-KIC-MD-TEST", mdPipRequireIssuedTerms: false, mdPipPolicyTerms: [] }, change)).toMatchObject({ termStart: "2025-08-01", termEnd: "2026-08-01", verified: false });
  });
  it("uses a scoped policy endorsement layout rather than the correspondence letterhead", () => {
    const renderer = html.slice(html.indexOf(' if(d==="pip_history"){', html.indexOf("function buildDoc(")), html.indexOf(' if(d==="dop"){', html.indexOf("function buildDoc(")));
    expect(renderer).toContain('class="pip-masthead"');
    expect(renderer).toContain('class="pip-term"');
    expect(renderer).toContain('class="pip-change"');
    expect(renderer).not.toContain('class="ltr');
    expect(renderer).not.toContain("Sincerely");
    expect(renderer).toContain("Policy term expires — unchanged");
    expect(renderer).toContain("It does not restart or extend that term.");
    expect(renderer).toContain("any later renewal is a separate policy term");
  });
  it("binds final printed endorsement dates to server-returned terms and rejects missing boundaries before document recording", () => {
    const print = html.slice(html.indexOf("async function durablePrint("), html.indexOf('document.addEventListener("click", async event', html.indexOf("async function durablePrint(")));
    expect(print).toContain("termEntries=issued.declarationTerms");
    expect(print).toContain(".policy.termsHistory");
    expect(print).toContain("mdPipPolicyTerms:termEntries,mdPipRequireIssuedTerms:true");
    expect(print.indexOf("if(rs.pip_history.miss.length)throw")).toBeLessThan(print.indexOf("await recordDocumentForSource"));
  });
});
