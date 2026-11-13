import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
const html=fs.readFileSync("client/public/klutch-policy-documents.html","utf8");
const context=vm.createContext({F:{},PRINTABLE_PDF_IDS:["dec","den","car","can","end","dop","pip_history"]});
vm.runInContext(html.slice(html.indexOf("function automaticPacketIds("),html.indexOf("function renderPacketPicker(")),context);
const ids=(all:boolean,s:any)=>Array.from(context.packetDocumentIds(all,s));
const name=(list:string[],s:any={},draft=false)=>context.klutchOutputFilename(list,s,draft);
describe("Klutch packet selection and output",()=>{
 it("always appends END-002 and TNC denial when declarations are printed from the current-document action",()=>expect(ids(false,{sel:"dec",lease:"a",st:"VA"})).toEqual(["dec","den","end"]));
 it("adds cancellation automatically for terminated rentals",()=>expect(ids(false,{sel:"dec",lease:"t",st:"VA"})).toEqual(["dec","den","can","end"]));
 it("does not add cancellation for active rentals",()=>expect(ids(true,{sel:"dec",lease:"a",st:"VA"})).not.toContain("can"));
 it("adds the distinct Maryland history only for documented changes",()=>{
  expect(ids(true,{lease:"a",st:"MD",mdPipSame:"no"})).toEqual(["dec","den","end","pip_history"]);
  expect(ids(true,{lease:"a",st:"MD",mdPipSame:"yes"})).not.toContain("pip_history");
  expect(ids(true,{lease:"a",st:"VA",mdPipSame:"no"})).not.toContain("pip_history");
 });
 it("includes optional printable letters explicitly selected by the handler",()=>expect(ids(true,{lease:"a",st:"VA",packetExtras:["car","dop"]})).toEqual(["dec","den","car","end","dop"]));
 it("deduplicates automatic additions and rejects non-PDF/unknown extras",()=>expect(ids(true,{lease:"t",st:"VA",packetExtras:["dec","end","car","car","carrier_email","carrier_guide","unknown"]})).toEqual(["dec","den","car","can","end"]));
 it.each(["end","den","car","can","dop","pip_history"])("allows %s to be printed by itself",sel=>expect(ids(false,{sel,lease:"t",st:"MD",mdPipSame:"no",packetExtras:["car"]})).toEqual([sel]));
 it("does not put copy-only reference items into any PDF",()=>expect(ids(false,{sel:"carrier_email"})).toEqual([]));
 it.each([
  ["end","Klutch-END-002.pdf"],["den","Klutch-TNC-Denial.pdf"],["car","Klutch-Carrier-Coverage-Position.pdf"],
  ["can","Klutch-Cancellation-Notice.pdf"],["dop","Klutch-Direction-of-Pay.pdf"],["pip_history","Klutch-MD-PIP-Endorsement.pdf"],
 ])("uses an insurer-specific filename for %s",(id,expected)=>expect(name([id])).toBe(expected));
 it("names multi-document packets with only a validated policy number",()=>{
  expect(name(["dec","den","end"],{pn:"KIC-MD-123456"})).toBe("Klutch-Policy-Packet-KIC-MD-123456.pdf");
  expect(name(["dec","end"],{pn:"../../private?bad"})).toBe("Klutch-Policy-Packet.pdf");
 });
 it("clearly distinguishes a draft filename from final output",()=>expect(name(["end"],{},true)).toBe("Klutch-END-002-DRAFT.pdf"));
 it("offers incomplete print only as a marked draft before any policy persistence or immutable audit",()=>{
  const flow=html.slice(html.indexOf("  async function durablePrint("),html.indexOf('  document.addEventListener("click", async event =>'));
  expect(flow.indexOf('Continue with DRAFT')).toBeLessThan(flow.indexOf('persistTermIfNeeded()'));
  const draft=flow.slice(flow.indexOf('if(issues.length)'),flow.indexOf('const issued='));
  expect(draft).toContain('markDraft(');expect(draft).toContain('return;');expect(draft).not.toContain('recordDocumentForSource(');
  expect(flow).not.toContain('candidates.filter(');expect(flow).toContain('for(const item of printItems)if(item.rendered.err||item.rendered.miss.length)');
  expect(html).toContain('DRAFT — INCOMPLETE / NOT ISSUED — DO NOT USE AS COVERAGE OR SIGNATURE CONFIRMATION');
 });
 it("keeps final denial claimant-addressed and attributed to Klutch, with reviewed TNC facts",()=>{
  expect(html).toContain('Klutch Insurance Company’s denial letter to the claimant / named insured');
  expect(html).toContain('reviewed TNC activity and exclusion applicability');
  expect(html).toContain('${P("Dear "+esc(nm)+":")}');expect(html).toContain('${hand()}${G}${L("cc:  Metrocars Leasing Corp")}');
  expect(html).toContain('if(["dol","tnc","period","pn","member","vin","st"].includes(k)){F.tncEvidenceConfirmed=false');
 });
});
