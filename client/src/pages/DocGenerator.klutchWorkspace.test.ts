import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const docGenerator = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DocGenerator.tsx"), "utf8");
const sourcePage = fs.readFileSync(path.resolve(process.cwd(), "client/public/klutch-policy-documents.html"), "utf8");
const api = fs.readFileSync(path.resolve(process.cwd(), "server/klutchPolicyApi.ts"), "utf8");
const contract = fs.readFileSync(path.resolve(process.cwd(), "shared/klutchPolicy.ts"), "utf8");

describe("Klutch policy documents source integration", () => {
  it("routes the live Document Generator tab to the supplied Klutch page", () => {
    expect(docGenerator).toContain('id: "klutch-policy-documents", label: "Klutch Policy Documents"');
    expect(docGenerator).toContain('case "klutch-policy-documents": return <iframe src="/klutch-policy-documents.html"');
    expect(docGenerator).toContain("LEGACY_KLUTCH_TAB_IDS");
    expect(docGenerator).toContain('return "klutch-policy-documents"');
    expect(docGenerator).not.toContain('{ id: "coi-whip", label: "Certificate of Insurance"');
    expect(docGenerator).not.toContain('{ id: "klutch-policy-declarations", label: "Klutch — Policy Declarations (Approved)"');
  });

  it("keeps all five document types in the supplied page while routing persistence to Whip", () => {
    for (const title of ["Policy Declarations", "TNC Coverage Denial", "Carrier Coverage Position", "Policy Cancellation Notice", "Endorsement KIC-END-002"]) {
      expect(contract).toContain(title);
    }
    for (const sourceId of ["dec", "den", "car", "can", "end"]) expect(sourcePage).toContain(`"${sourceId}"`);
    expect(sourcePage).toContain('const API = "/api/klutch-policy-documents"');
    expect(sourcePage).toContain("async function durablePrint");
    expect(sourcePage).toContain('window.print()');
    expect(sourcePage).toContain("Created is not sent");
    expect(sourcePage).toContain("shared Klutch register");
  });

  it("does not treat browser storage as the policy register", () => {
    expect(sourcePage).toContain('localStorage.setItem("klutch_form_v3"');
    expect(sourcePage).not.toContain('localStorage.setItem("klutch_policies"');
    expect(sourcePage).not.toContain('localStorage.setItem("klutch_policy_register"');
    expect(api).toContain('registerKlutchPolicyApi');
    expect(api).toContain('issueKlutchPolicy');
    expect(api).toContain('recordKlutchDocument');
    expect(api).toContain('cancelKlutchPolicy');
  });

  it("requires a Whip claim for claim documents and retains endorsement controls", () => {
    expect(sourcePage).toContain('Enter the Whip / SnapSheet claim number before creating a claim document.');
    expect(sourcePage).toContain('Carrier request evidence is required for KIC-END-002.');
    expect(sourcePage).toContain('Name the approving manager and confirm approval before printing KIC-END-002.');
    expect(api).toContain('type === "endorsement" && user.role !== "admin"');
    expect(api).toContain('approveKlutchEndorsement');
  });

  it("retains structured policy terms and insurer references from the updated source workflow", () => {
    expect(sourcePage).toContain('memberStreet');
    expect(sourcePage).toContain('memberCity');
    expect(sourcePage).toContain('memberZip');
    expect(sourcePage).toContain('carrierRequestEvidence');
    expect(sourcePage).toContain('weeklyMembershipFee: 35');
    expect(contract).toContain('memberStreet?: string');
    expect(contract).toContain('memberZip?: string');
  });
});
