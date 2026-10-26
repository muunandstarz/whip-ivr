import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const docGenerator = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");
const app = fs.readFileSync(path.resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const sidebar = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/WhipLayout.tsx"), "utf8");
const knowledgeBasePage = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/kb/KlutchPolicyDocuments.tsx"), "utf8");
const sourcePage = fs.readFileSync(path.resolve(process.cwd(), "client/public/klutch-policy-documents.html"), "utf8");
const legacyWorkspace = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/KlutchPolicyDocumentsWorkspace.tsx"), "utf8");
const api = fs.readFileSync(path.resolve(process.cwd(), "server/klutchPolicyApi.ts"), "utf8");
const contract = fs.readFileSync(path.resolve(process.cwd(), "shared/klutchPolicy.ts"), "utf8");

describe("Klutch policy documents source integration", () => {
  it("gives Klutch its own Knowledge Base route instead of a Document Generator tab", () => {
    expect(docGenerator).not.toContain('{ id: "klutch-policy-documents", label: "Klutch Policy Documents"');
    expect(docGenerator).not.toContain('case "klutch-policy-documents": return <iframe');
    expect(docGenerator).toContain('navigate("/kb/klutch-policy-documents")');
    expect(docGenerator).toContain("LEGACY_KLUTCH_TAB_IDS");
    expect(docGenerator).toContain('return "klutch-policy-documents"');

    expect(app).toContain('import KlutchPolicyDocuments from "./pages/kb/KlutchPolicyDocuments"');
    expect(app).toContain('<Route path="/kb/klutch-policy-documents" component={KlutchPolicyDocuments} />');
    expect(sidebar).toContain('{ href: "/kb/klutch-policy-documents", label: "Klutch Policy Documents", icon: FileText }');
    expect(knowledgeBasePage).toContain('src="/klutch-policy-documents.html"');
    expect(knowledgeBasePage).toContain('title="Klutch Policy Documents"');
  });

  it("keeps all five document types in the supplied page while routing persistence to Whip", () => {
    for (const title of ["Policy Declarations", "TNC Coverage Denial", "Carrier Coverage Position", "Policy Cancellation Notice", "Endorsement KIC-END-002"]) {
      expect(contract).toContain(title);
    }
    for (const sourceId of ["dec", "den", "car", "can", "end"]) expect(sourcePage).toContain(`"${sourceId}"`);
    expect(sourcePage).toContain('const API = "/api/klutch-policy-documents"');
    expect(sourcePage).toContain("async function durablePrint");
    expect(sourcePage).toContain('window.print()');
    expect(sourcePage).not.toContain("Handler note: Created is not sent to the member.");
    expect(legacyWorkspace).not.toContain("Created is not sent");
    expect(sourcePage).toContain("shared Klutch register");
  });

  it("does not treat browser storage as the policy register", () => {
    expect(sourcePage).toContain('localStorage.setItem("klutch_form_v3"');
    expect(sourcePage).not.toContain('localStorage.setItem("klutch_policies"');
    expect(sourcePage).not.toContain('localStorage.setItem("klutch_policy_register"');
    expect(api).toContain("registerKlutchPolicyApi");
    expect(api).toContain("issueKlutchPolicy");
    expect(api).toContain("recordKlutchDocument");
    expect(api).toContain("cancelKlutchPolicy");
  });

  it("makes every form previewable in All forms without manager or claim-document gates", () => {
    expect(sourcePage).toContain('const SETS=[["liab","Dec page + cancellation if terminated"],["all","All forms"]]');
    expect(sourcePage).toContain('return DOCS.map(x=>x[0])');
    expect(sourcePage).toContain('const denialClaim=claim||{kc:s.kc||"[Klutch claim number]"');
    expect(sourcePage).toContain('if(d==="end")h+=sec("Endorsement")');
    expect(sourcePage).toContain('This form is available for preview and creation without a manager-approval or carrier-evidence field.');
    expect(sourcePage).not.toContain("Manager approval is required.");
    expect(sourcePage).not.toContain("Carrier request evidence is required for KIC-END-002.");
    expect(sourcePage).not.toContain("Enter the Whip / SnapSheet claim number before creating a claim document.");
    expect(api).not.toContain('type === "endorsement" && user.role !== "admin"');
    expect(api).not.toContain("endorsement-approval");
  });

  it("retains structured policy terms and insurer references from the updated source workflow", () => {
    expect(sourcePage).toContain("memberStreet");
    expect(sourcePage).toContain("memberCity");
    expect(sourcePage).toContain("memberZip");
    expect(sourcePage).toContain("weeklyMembershipFee: 35");
    expect(contract).toContain("memberStreet?: string");
    expect(contract).toContain("memberZip?: string");
  });

  it("starts a new policy with garaging state and places policy-number creation last", () => {
    const formStart = sourcePage.indexOf("function buildForm()");
    const garagingState = sourcePage.indexOf('h+=fld("st","Garaging state"', formStart);
    const documentSet = sourcePage.indexOf('Which documents do you need?', formStart);
    const coverageElections = sourcePage.indexOf('h+=sec("Coverage elections")', formStart);
    const policyNumber = sourcePage.indexOf('h+=sec("Policy number")', formStart);

    expect(garagingState).toBeGreaterThan(formStart);
    expect(garagingState).toBeLessThan(documentSet);
    expect(policyNumber).toBeGreaterThan(coverageElections);
    expect(sourcePage).toContain('"Create draft policy number"');
    expect(sourcePage).toContain("Creates a draft number for review only. The final policy number and shared-register entry are assigned when you Print / Save PDF.");
  });

  it("gives the Policy Type selector enough room for New policy, Renewal, and Correction", () => {
    expect(sourcePage).toContain('.seg.policy-type{min-width:330px;width:100%}');
    expect(sourcePage).toContain('seg("ptype",[["n","New policy"],["r","Renewal"],["c","Correction"]],undefined,"policy-type")');
    expect(sourcePage).toContain('<div class="s6"><label>Policy type</label>');
  });

  it("keeps a new-policy number as a draft until Print or Save PDF creates the shared policy", () => {
    expect(sourcePage).toContain('F.pn = `DRAFT-KIC-${F.st}-${String(Date.now()).slice(-6)}`');
    expect(sourcePage).toContain('Draft policy number prepared. Print / Save PDF assigns the final shared policy number.');
    expect(sourcePage).toContain('if (F.ptype === "n" && !isIssuedPolicyNumber(F.pn)) return issueCurrent();');
    expect(sourcePage).toContain('if (action === "genpol") { event.preventDefault(); event.stopImmediatePropagation(); try { await prepareDraftPolicyNumber(); }');
    expect(sourcePage).not.toContain('if (action === "genpol") { event.preventDefault(); event.stopImmediatePropagation(); try { await issueCurrent(); }');
  });

  it("does not render PIP controls or declaration rows for Virginia", () => {
    expect(sourcePage).toContain('VA:{n:"Virginia",bi:[50000,100000],pd:25000,pip:null,umReject:false}');
    expect(sourcePage).toContain('if(R.pip)h+=`<div class="s3"><label>PIP</label>');
    expect(sourcePage).toContain('RULES[s.st]?.pip?rowv("pip","Personal injury protection"):""');
    expect(sourcePage).toContain('...(z.R.pip ? { "Personal Injury Protection": z.cov.pip } : {})');
  });

  it("shows declined UM and UIM bodily-injury coverage as REJECTED on declarations", () => {
    expect(sourcePage).toContain('um:umOn?usd(R.bi[0])+" each person / "+usd(R.bi[1])+" each accident":"REJECTED"');
    expect(sourcePage).toContain('uim:umOn?usd(R.bi[0])+" each person / "+usd(R.bi[1])+" each accident":"REJECTED"');
  });
});
