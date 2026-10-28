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

  it("keeps all six document types in the supplied page while routing persistence to Whip", () => {
    for (const title of ["Policy Declarations", "TNC Coverage Denial", "Carrier Coverage Position", "Policy Cancellation Notice", "Endorsement KIC-END-002", "Direction of Pay & Vehicle Ownership Notice"]) {
      expect(contract).toContain(title);
    }
    for (const sourceId of ["dec", "den", "car", "can", "end", "dop"]) expect(sourcePage).toContain(`"${sourceId}"`);
    expect(sourcePage).toContain('const API = "/api/klutch-policy-documents"');
    expect(sourcePage).toContain('dop: "direction_of_pay"');
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
    expect(sourcePage).toContain('const NON_PDF_REFERENCE_IDS=["carrier_email","carrier_guide"]');
    expect(sourcePage).toContain('return [...new Set([...packet,...NON_PDF_REFERENCE_IDS])]');
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

  it("requires an explicit garaging-state confirmation and invalidates an unissued state-specific draft", () => {
    expect(sourcePage).toContain('stateConfirmed:false,confirmedState:""');
    expect(sourcePage).toContain('const isStateConfirmed=()=>F.stateConfirmed===true&&F.confirmedState===F.st&&!!RULES[F.st];');
    expect(sourcePage).toContain('I confirm that ${esc(R.n)} is the vehicle’s correct garaging state.');
    expect(sourcePage).toContain("Confirm garaging state to continue.");
    expect(sourcePage).toContain('F.confirmedState=F.stateConfirmed?F.st:"";save();buildForm();preview();return');
    expect(sourcePage).toContain('if(F.st!==priorState){F.stateConfirmed=false;F.confirmedState="";if(/^DRAFT-KIC-[A-Z]{2}-\\d{6}$/.test(F.pn||"")){F.pn="";say("Garaging state changed. The unissued draft policy number was cleared.")}}');
    expect(sourcePage).toContain('Confirm the garaging state before preparing a draft policy number.');
    expect(sourcePage).toContain('Confirm the garaging state before creating or printing a policy document.');
    expect(sourcePage).toContain('Garaging state is locked after a shared policy number is issued. Start a correction workflow for a verified policy-record issue.');
    expect(sourcePage).toContain('st:r.st,stateConfirmed:true,confirmedState:r.st');
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

  it("does not auto-fill the signed-in user as the Klutch document handler", () => {
    expect(sourcePage).not.toContain('if (!F.hn && currentUser?.name) F.hn = currentUser.name;');
    expect(sourcePage).toContain('if(!F.handlerNameEntered&&F.hn){F.hn="";F.ht="";');
    expect(sourcePage).toContain('if (!F.handlerNameEntered && F.hn) {');
    expect(sourcePage).not.toContain('const autoFilledHandlerName = String(currentUser?.name || "").trim();');
    expect(sourcePage).toContain('if(k==="hn")F.handlerNameEntered=true;');
    expect(sourcePage).toContain('F={ptype:"n",set:F.set,sel:F.sel,st:F.st,stateConfirmed:false,confirmedState:"",term:"6",pip:"w",um:"a",lease:"a",date:today(),tnc:"Uber",period:"2",eff:today()}');
    expect(legacyWorkspace).toContain('const signer = docForm.handlerName;');
    expect(legacyWorkspace).toContain('placeholder="Enter the handling adjuster"');
    expect(legacyWorkspace).not.toContain('impersonating?.name || user?.name');
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

  it("uses the Nashville mailing address and no phone or CEO signature in all active Klutch forms", () => {
    expect(sourcePage).toContain("424 Church Street, Suite 800");
    expect(sourcePage).toContain("Nashville, Tennessee 37219");
    expect(sourcePage).not.toContain("P.O. Box 10622");
    expect(sourcePage).not.toContain("(855) 906-5949");
    expect(sourcePage).not.toContain("Bobby Taheri");
    expect(legacyWorkspace).toContain("424 Church Street, Suite 800");
    expect(legacyWorkspace).toContain("Nashville, Tennessee 37219");
    expect(legacyWorkspace).not.toContain("(855) 906-5949");
    expect(legacyWorkspace).not.toContain("Bobby Taheri");
  });

  it("matches the approved Dec Page without the page-one TNC exclusion or a loss-payee block", () => {
    const buildDocStart = sourcePage.indexOf("function buildDoc(");
    const decStart = sourcePage.indexOf('if(d==="dec")', buildDocStart);
    const decRenderer = sourcePage.slice(decStart, sourcePage.indexOf('if(d==="dop")', decStart));
    expect(decRenderer).toContain('<h2>Vehicle lessor</h2>');
    expect(decRenderer).toContain('Metrocars Leasing Corp<br>14670 Southlawn Lane<br>Rockville, MD 20850');
    expect(decRenderer).not.toContain('Transportation network company use');
    expect(decRenderer).not.toContain('Lessor / Loss Payee');
    expect(decRenderer).not.toContain('designated loss payee');
    expect(legacyWorkspace).toContain('doc.text("Vehicle lessor", 15, y);');
    expect(legacyWorkspace).not.toContain('doc.text("Transportation network company use", 15, y);');
  });

  it("offers a fillable two-page Metrocars Direction of Pay with selectable payment and attachment checkboxes", () => {
    const buildDocStart = sourcePage.indexOf("function buildDoc(");
    const dopStart = sourcePage.indexOf('if(d==="dop")', buildDocStart);
    const dopRenderer = sourcePage.slice(dopStart, sourcePage.indexOf('if(d==="end")', dopStart));

    expect(sourcePage).toContain('["dop","Direction of Pay & Vehicle Ownership Notice"]');
    expect(sourcePage).toContain('dopFld("dopWhipClaim","Metrocars / Whip claim number"');
    expect(sourcePage).toContain('dopFld("dopRegistration","Registration / plate"');
    expect(sourcePage).toContain('dopFld("dopRepairFacility","Repair facility"');
    expect(dopRenderer).toContain('Metrocars Leasing Corp. | Claims Department');
    expect(dopRenderer).toContain('DIRECTION OF PAY AND VEHICLE OWNERSHIP NOTICE');
    expect(dopRenderer).toContain('Physical-damage claim');
    expect(dopRenderer).toContain('TO (CARRIER AND CLAIMS DEPARTMENT)');
    expect(dopRenderer).toContain('REPAIR PAYMENT — make payment directly to Total Recon — Laurel, 3521 Whiskey Bottom Rd, Laurel, MD 20724.');
    expect(dopRenderer).toContain('REPAIR PAYMENT — make payment directly to Total Recon — Rockville, 627 Southlawn Lane, Rockville, MD 20850.');
    expect(dopRenderer).toContain('TOTAL LOSS — make payment payable to Metrocars Leasing Corp., 14670 Southlawn Lane, Rockville, MD 20850, as owner.');
    expect(dopRenderer).toContain('SUBROGATION RECOVERY — make payment payable to Metrocars Leasing Corp., 14670 Southlawn Lane, Rockville, MD 20850.');
    expect(dopRenderer).toContain('Title, electronic-title, or lien/ownership record when available, requested, or necessary to resolve ownership or a total loss');
    expect(dopRenderer).toContain('This notice is limited to payment administration and protection of the vehicle owner’s documented interest.');
    expect(dopRenderer).toContain('Authorized representative (signature)');
    expect(dopRenderer).not.toContain('Email / direct phone');
    expect(dopRenderer).not.toContain('signerContact');
    expect(dopRenderer).not.toContain('<img class="lg" src="${LOGO}"');
    expect(dopRenderer).not.toContain('Klutch Insurance Company');
    expect(sourcePage).toContain('chk("dopPayLaurel"');
    expect(sourcePage).toContain('chk("dopAttachRegistration"');
    expect(sourcePage).not.toContain('chk("dopAttachPoi"');
  });

  it("captures a compact internal Direction of Pay e-signature indicator without personal contact data", () => {
    const buildDocStart = sourcePage.indexOf("function buildDoc(");
    const dopStart = sourcePage.indexOf('if(d==="dop")', buildDocStart);
    const dopRenderer = sourcePage.slice(dopStart, sourcePage.indexOf('if(d==="end")', dopStart));

    expect(sourcePage).toContain('Authorized representative e-signature');
    expect(sourcePage).toContain('id="dopSignatureCanvas"');
    expect(sourcePage).toContain('Draw signature');
    expect(sourcePage).toContain('Use typed signature');
    expect(sourcePage).toContain('dopSignatureAccepted');
    expect(sourcePage).toContain('I certify that I am authorized to sign this Direction of Pay for Metrocars Leasing Corp.');
    expect(sourcePage).toContain('dopSignatureCertificateId');
    expect(sourcePage).toContain('data:image\\/png;base64');
    expect(dopRenderer).toContain('signatureCertified');
    expect(dopRenderer).toContain('E-signature certified');
    expect(dopRenderer).toContain('E-signature certification pending');
    expect(dopRenderer).toContain('dop-cert');
    expect(dopRenderer).toContain('dop-signature-wrap');
    expect(dopRenderer).not.toContain('DocuSign');
    expect(sourcePage).not.toContain('dopFld("dopSignerContact"');
    expect(sourcePage).not.toContain('["dopSignerName","dopSignerTitle","dopSignerContact","dopSignerDate"]');
    expect(sourcePage).toContain('const { dopSignerContact: _legacyDopSignerContact, ...documentState } = F;');
  });

  it("matches the supplied MetroCars form scale and positions signatures and dates cleanly on their rules", () => {
    expect(sourcePage).toContain('.dopdoc{font-size:13.3px;line-height:1.48}');
    expect(sourcePage).toContain('.dopdoc-p2{font-size:12px;line-height:1.45}');
    expect(sourcePage).toContain('.dop-department{font-size:13.3px;margin-top:-17px}');
    expect(sourcePage).toContain('.dop-signatures{grid-template-columns:1fr .7fr;gap:16px 34px;margin-top:66px');
    expect(sourcePage).toContain('.dop-signature-wrap{display:block;position:relative}');
    expect(sourcePage).toContain('.dop-sign-image{position:absolute;left:4px;bottom:calc(100% - 5px)');
    expect(sourcePage).toContain('.dop-typed-sign{position:absolute;left:5px;bottom:calc(100% - 5px)');
    expect(sourcePage).toContain('.dop-date-value{top:-10px}');
    expect(sourcePage).toContain('.dop-cert{position:absolute;right:0;top:calc(100% + 3px)');
    const buildDocStart = sourcePage.indexOf("function buildDoc(");
    const dopStart = sourcePage.indexOf('if(d==="dop")', buildDocStart);
    const dopRenderer = sourcePage.slice(dopStart, sourcePage.indexOf('if(d==="end")', dopStart));
    expect(dopRenderer).toContain('dop-line-value dop-date-value');
  });

  it("turns the carrier communication guide into a focused on-screen call workspace", () => {
    expect(sourcePage).toContain('guideFocus:"opening"');
    expect(sourcePage).toContain("function carrierGuideEntries");
    expect(sourcePage).toContain("function activeCarrierGuideEntry");
    expect(sourcePage).toContain("function carrierGuideForm");
    expect(sourcePage).toContain('data-act="guideFocus"');
    expect(sourcePage).toContain('guide-reference');
    expect(sourcePage).toContain('guide-script-card');
    expect(sourcePage).toContain('guide-step-controls');
    expect(sourcePage).toContain('body.guide-mode .split{grid-template-columns:minmax(292px,350px) minmax(0,1fr)');
    expect(sourcePage).toContain('@media(max-width:900px){body.guide-mode .split{grid-template-columns:1fr;gap:16px}');
    expect(sourcePage).toContain('document.body.classList.toggle("guide-mode",F.sel==="carrier_guide")');
    expect(sourcePage).toContain('if(a==="guideFocus"){F.guideFocus=b.dataset.v;save();buildForm();preview()');
    expect(sourcePage).toContain('Copy complete guide');
  });

  it("keeps editable carrier coverage email templates and communication scripts out of PDF print packets", () => {
    expect(sourcePage).toContain('["carrier_email","Carrier Coverage Request Email"]');
    expect(sourcePage).toContain('["carrier_guide","Carrier Communication Guide"]');
    expect(sourcePage).toContain('Carrier Coverage Request Email');
    expect(sourcePage).toContain('Carrier Communication Guide');
    expect(sourcePage).toContain('Copy Email');
    expect(sourcePage).toContain('copyCarrierCoverageEmail');
    expect(sourcePage).toContain('Copy guide');
    expect(sourcePage).toContain('copyCarrierCommunicationGuide');
    expect(sourcePage).toContain('function carrierGuideData');
    expect(sourcePage).toContain('Metrocars is the owner of the vehicle your insured driver was operating.');
    expect(sourcePage).toContain('We’re requesting a review of whether ${tnc}\'s physical-damage coverage responds to this loss.');
    expect(sourcePage).toContain('Can you confirm that you’ve received everything needed to make a coverage determination');
    expect(sourcePage).toContain('We need proof that the vehicle owner is a registered self-insured entity.');
    expect(sourcePage).toContain('We need a signed Direction of Pay or we’ll issue payment to the driver.');
    expect(sourcePage).toContain('We’re denying coverage.');
    expect(sourcePage).toContain('document the carrier response in Snapsheet');
    expect(sourcePage).toContain('Escalate to leadership for review before responding further.');
    expect(sourcePage).toContain('whether your insured’s policy provides comprehensive and/or collision coverage');
    expect(sourcePage).toContain('Handler guide — carrier coverage verification');
    expect(sourcePage).toContain('if(d==="carrier_email")');
    expect(sourcePage).toContain('if(d==="carrier_guide")');
    expect(sourcePage).toContain('Editable email preview · not a PDF packet document');
    expect(sourcePage).toContain('On-screen reference · not a PDF packet document');
    expect(sourcePage).toContain('const PRINTABLE_PDF_IDS=["dec","den","car","can","end","dop"]');
    expect(sourcePage).toContain('const NON_PDF_REFERENCE_IDS=["carrier_email","carrier_guide"]');
    expect(sourcePage).toContain('const candidates = all ? PRINTABLE_PDF_IDS.filter(id => setDocs().includes(id)) : [F.sel];');
    expect(sourcePage).toContain('const ordered = all ? PRINTABLE_PDF_IDS.filter(id => printable.includes(id)) : printable;');
    expect(sourcePage).toContain('This is an email template. Use Copy Email; it is not a printable PDF.');
    expect(sourcePage).toContain('This is an on-screen communication guide. Use Copy guide; it is not a printable PDF.');
    expect(sourcePage).toContain('email templates and communication scripts are not included in print packets');
    expect(sourcePage).not.toContain('carrier_email: "');
    expect(sourcePage).not.toContain('carrier_guide: "');
  });
});
