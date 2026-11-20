export const ACORD_STATES = ["MD", "VA", "FL", "GA", "IL", "MA", "PA", "TX"] as const;
export type AcordState = typeof ACORD_STATES[number];
export type AcordPreset = "klutch-fl-uber-black" | "klutch-minimum" | "metrocars-minimum";
export type AcordLimitBasis = "" | "csl" | "split" | "both";
export type AcordScope = "any" | "owned" | "scheduled" | "hired" | "nonOwned";
export const ACORD_PRESETS: Record<AcordPreset, string> = {
  "klutch-fl-uber-black": "Klutch Florida — Uber Black",
  "klutch-minimum": "Klutch — Minimum limits",
  "metrocars-minimum": "MetroCars — Minimum limits (self-insured)",
};

export interface AcordDraft {
  preset: AcordPreset; state: AcordState; issueDate: string;
  producerName: string; producerAddress: string; contactName: string; phone: string; fax: string; email: string;
  insuredOrganization: string; insuredOrganizationAddress: string; namedOperator: string; operatorAddress: string;
  certificateNumber: string; revisionNumber: string; policyNumber: string; effectiveDate: string; expirationDate: string;
  limitBasis: AcordLimitBasis; combinedSingleLimit: string; biPerson: string; biAccident: string; propertyDamage: string;
  autoScopes: AcordScope[]; additionalInsured: boolean; subrogationWaived: boolean;
  endorsementReference: string; coverageReference: string; description: string;
  vehicleYear: string; vehicleMake: string; vehicleModel: string; vin: string; plate: string;
  holderName: string; holderAddress: string; metrocarsRepresentative: string; metrocarsRepresentativeTitle: string;
}
export interface MinimumLimitReference { biPerson: number; biAccident: number; propertyDamage: number; effectiveDate: string; note: string; sources: string[] }
// These are reference starting points, not evidence of coverage. Date and commercial/rental/TNC
// applicability are verified against the actual issued policy or self-insurance record before final output.
export const ACORD_MINIMUM_REFERENCES: Record<AcordState, MinimumLimitReference> = {
  MD: {biPerson:30000,biAccident:60000,propertyDamage:15000,effectiveDate:"2011-01-01",note:"Verify policy, rental and commercial applicability.",sources:["https://mva.maryland.gov/title-registration/auto-insurance-requirements", "https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gtr&section=18-102"]},
  VA: {biPerson:50000,biAccident:100000,propertyDamage:25000,effectiveDate:"2025-01-01",note:"Newer policies use the increased limits; historical periods require the issued-policy limits.",sources:["https://www.dmv.virginia.gov/vehicles/insurance-requirements", "https://law.lis.virginia.gov/vacode/title46.2/chapter3/section46.2-472/"]},
  FL: {biPerson:10000,biAccident:20000,propertyDamage:10000,effectiveDate:"",note:"10/20/10 is a financial-responsibility reference, NOT the ordinary Florida registration minimum. Ordinary registration generally requires $10,000 PIP and $10,000 PD, not BI; rental/lessor rules are separate and can involve 100/300/50 or other conditions. Verify actual self-insurance or commercial policy and use; this reference does not prove rental or TNC compliance. PIP is not certified by this auto-liability row.",sources:["https://www.flhsmv.gov/insurance/", "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0324/Sections/0324.021.html"]},
  GA: {biPerson:25000,biAccident:50000,propertyDamage:25000,effectiveDate:"",note:"Verify policy, rental and commercial applicability.",sources:["https://oci.georgia.gov/insurance-resources/auto"]},
  IL: {biPerson:25000,biAccident:50000,propertyDamage:20000,effectiveDate:"",note:"Verify policy, rental and commercial applicability.",sources:["https://www.ilga.gov/documents/legislation/ilcs/documents/062500050K7-203.htm", "https://www.ilsos.gov/departments/vehicles/mandatory-insurance.html"]},
  MA: {biPerson:25000,biAccident:50000,propertyDamage:30000,effectiveDate:"2025-07-01",note:"Increased new/renewal policy limits apply from July 1, 2025; historical periods require issued-policy limits.",sources:["https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXIV/Chapter90/Section34A", "https://www.mass.gov/doc/2025-a-new-motor-vehicle-mandatory-coverage-limits/download"]},
  PA: {biPerson:15000,biAccident:30000,propertyDamage:5000,effectiveDate:"",note:"Verify policy, rental and commercial applicability.",sources:["https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/75/00.017.002.000..HTM"]},
  TX: {biPerson:30000,biAccident:60000,propertyDamage:25000,effectiveDate:"2011-01-01",note:"Verify policy, rental and commercial applicability.",sources:["https://statutes.capitol.texas.gov/GetStatute.aspx?Code=TN&Value=601"]},
};
export function emptyAcordDraft(today = ""): AcordDraft {
  return {preset:"klutch-fl-uber-black",state:"FL",issueDate:today,producerName:"Whip Claims Management",producerAddress:"14670 Southlawn Ln\nRockville, MD 20850",contactName:"Jasmine Lane Acosta",phone:"(855) 906-5949",fax:"(877) 890-0531",email:"claims@drivewhip.com",insuredOrganization:"Sunbeam Fleet",insuredOrganizationAddress:"7901 4th St N, Suite 300\nSt. Petersburg, FL 33702",namedOperator:"",operatorAddress:"",certificateNumber:"",revisionNumber:"",policyNumber:"",effectiveDate:"",expirationDate:"",limitBasis:"split",combinedSingleLimit:"300000",biPerson:"125000",biAccident:"250000",propertyDamage:"50000",autoScopes:["scheduled"],additionalInsured:false,subrogationWaived:false,endorsementReference:"",coverageReference:"",description:"",vehicleYear:"",vehicleMake:"",vehicleModel:"",vin:"",plate:"",holderName:"Uber Technologies, Inc.",holderAddress:"1515 3rd Street\nSan Francisco, CA 94158",metrocarsRepresentative:"",metrocarsRepresentativeTitle:""};
}
export function applyAcordPreset(draft: AcordDraft, preset: AcordPreset, state: AcordState = draft.state): AcordDraft {
  const uber = preset === "klutch-fl-uber-black";
  const resolvedState = uber ? "FL" : state;
  const limits = ACORD_MINIMUM_REFERENCES[resolvedState];
  return {...draft,preset,state:resolvedState,limitBasis:"split",combinedSingleLimit:uber?"300000":"",biPerson:uber?"125000":String(limits.biPerson),biAccident:uber?"250000":String(limits.biAccident),propertyDamage:uber?"50000":String(limits.propertyDamage),insuredOrganization:uber?"Sunbeam Fleet":"Metrocars Leasing Corp.",insuredOrganizationAddress:uber?"7901 4th St N, Suite 300\nSt. Petersburg, FL 33702":"P.O. Box 10622\nRockville, MD 20850",holderName:uber?"Uber Technologies, Inc.":"",holderAddress:uber?"1515 3rd Street\nSan Francisco, CA 94158":"",autoScopes:["scheduled"],additionalInsured:false,subrogationWaived:false,endorsementReference:""};
}
export function restoreAcordDraft(raw: unknown, today=""): AcordDraft {
  const initial = emptyAcordDraft(today);
  if(!raw || typeof raw!=="object") return initial;
  const data=raw as Record<string,unknown>;
  const result={...initial};
  for(const key of Object.keys(initial) as (keyof AcordDraft)[]) {
    if(typeof initial[key]==="string" && typeof data[key]==="string") (result as unknown as Record<string,unknown>)[key]=(data[key] as string).slice(0,10000);
  }
  if(!(result.preset in ACORD_PRESETS)) result.preset=initial.preset;
  if(!ACORD_STATES.includes(result.state)) result.state=initial.state;
  if(result.preset==="klutch-fl-uber-black") result.state="FL";
  if(!["","csl","split","both"].includes(result.limitBasis)) result.limitBasis="";
  result.autoScopes=Array.isArray(data.autoScopes)?data.autoScopes.filter((s):s is AcordScope=>typeof s==="string" && ["any","owned","scheduled","hired","nonOwned"].includes(s)):[];
  // Endorsement assertions are restored as inputs only, never as fresh certification.
  result.additionalInsured=data.additionalInsured===true;result.subrogationWaived=data.subrogationWaived===true;
  return result;
}
export function validAcordDate(value:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d=new Date(`${value}T12:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===value;
}
export function acordAmount(value:string):number|null {
  const cleaned=value.trim().replace(/[$,]/g,"");
  if(!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const n=Number(cleaned);return Number.isFinite(n)&&n>0&&n<=1000000000?n:null;
}
export function validateAcordDraft(d:AcordDraft):string[] {
  const errors:string[]=[];
  for(const [field,label] of [["producerName","Producer name"],["insuredOrganization","Named insured organization"],["insuredOrganizationAddress","Named insured address"],["namedOperator","Named operator"],["operatorAddress","Operator address"],["policyNumber","Policy / self-insurance certificate number"],["holderName","Certificate holder"],["holderAddress","Certificate holder address"],["coverageReference","Verified policy / self-insurance source reference"]] as const) if(!d[field].trim()) errors.push(label);
  for(const [field,label] of [["issueDate","Certificate date"],["effectiveDate","Policy effective date"],["expirationDate","Policy expiration date"]] as const) if(!validAcordDate(d[field])) errors.push(`${label} (valid date required)`);
  if(validAcordDate(d.effectiveDate)&&validAcordDate(d.expirationDate)&&d.expirationDate<=d.effectiveDate) errors.push("Expiration must be after effective date");
  if(d.preset==="klutch-fl-uber-black") {
    if(d.state!=="FL") errors.push("Uber Black preset is Florida-only");
    if(!/\bsunbeam\b/i.test(d.insuredOrganization)) errors.push("Uber Black named insured must identify Sunbeam");
    if(validAcordDate(d.issueDate)&&validAcordDate(d.effectiveDate)&&validAcordDate(d.expirationDate)&&(d.effectiveDate>d.issueDate||d.expirationDate<=d.issueDate)) errors.push("Uber Black coverage must be active on the certificate date");
    if(d.limitBasis==="split"||d.limitBasis==="both") {
      const person=acordAmount(d.biPerson), accident=acordAmount(d.biAccident),pd=acordAmount(d.propertyDamage);
      if(person===null||person<125000) errors.push("Uber Black BI per person must be at least $125,000");
      if(accident===null||accident<250000) errors.push("Uber Black BI per accident must be at least $250,000");
      if(pd===null||pd<50000) errors.push("Uber Black property damage must be at least $50,000");
      // The separate split caps are NOT printed as a CSL. Eligibility confirmation belongs
      // to documented issuer review, not adding two numbers and asserting equivalence.
      if(accident!==null&&pd!==null&&accident+pd<300000) errors.push("Uber Black BI / PD limits must support at least $300,000 in combined capacity");
    }
    if((d.limitBasis==="csl"||d.limitBasis==="both")&&(acordAmount(d.combinedSingleLimit)??0)<300000) errors.push("Uber Black actual combined single limit must be at least $300,000");
  }
  if(!d.limitBasis) errors.push("Select one verified limit format");
  if(["csl","both"].includes(d.limitBasis) && acordAmount(d.combinedSingleLimit)===null) errors.push("Combined single limit (positive USD amount required)");
  if(["split","both"].includes(d.limitBasis)) {
    for(const [field,label] of [["biPerson","Bodily injury per person"],["biAccident","Bodily injury per accident"],["propertyDamage","Property damage"]] as const) if(acordAmount(d[field])===null) errors.push(`${label} (positive USD amount required)`);
    if(acordAmount(d.biPerson)!==null&&acordAmount(d.biAccident)!==null&&acordAmount(d.biAccident)!<acordAmount(d.biPerson)!) errors.push("BI per accident cannot be below per person");
  }
  if(!d.autoScopes.length) errors.push("Covered-auto scope");
  if(d.autoScopes.includes("any")&&d.autoScopes.length>1) errors.push("Any auto cannot be combined with narrower scope selections");
  if(d.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(d.vin.trim())) errors.push("VIN (17 valid characters required)");
  if(!d.vin.trim()) errors.push("Vehicle VIN");
  if(!d.vehicleYear.trim()||!d.vehicleMake.trim()||!d.vehicleModel.trim()) errors.push("Vehicle year / make / model");
  if((d.additionalInsured||d.subrogationWaived)&&!d.endorsementReference.trim()) errors.push("Actual provision / endorsement reference for additional-insured or waiver status");
  if(d.preset==="metrocars-minimum" && (!d.metrocarsRepresentative.trim()||!d.metrocarsRepresentativeTitle.trim())) errors.push("MetroCars authorized representative name and title");
  return errors;
}
/** One operator entry, with all supplied address lines; no address is attributed to an unnamed driver. */
export function acordOperatorDescription(d: Pick<AcordDraft, "namedOperator" | "operatorAddress">): string {
  const name = d.namedOperator.trim().replace(/\s+/g, " ");
  if (!name) return "";
  const address = d.operatorAddress.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(", ");
  return `Driver: ${name}${address ? `; ${address}` : ""}`;
}
export function acordDescription(d:AcordDraft):string {
  return [acordOperatorDescription(d),[d.vehicleYear,d.vehicleMake,d.vehicleModel].filter(Boolean).join(" "),d.vin?`VIN: ${d.vin.toUpperCase()}`:"",d.plate?`Plate: ${d.plate}`:"",d.preset==="metrocars-minimum"?"MetroCars self-insured auto liability. This certificate does not represent a policy issued by an insurance carrier; evidence is subject to the self-insurance authorization and applicable agreement.":"",d.description,d.endorsementReference?`Provision / endorsement reference: ${d.endorsementReference}`:""].filter(Boolean).join("\n");
}
export function acordFilename(d:AcordDraft,draft=false):string {
  const prefix=d.preset==="metrocars-minimum"?"MetroCars":"Klutch";
  const id=(d.certificateNumber||d.policyNumber||"Certificate").replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,70);
  return `${prefix}-ACORD-25-${id}${draft?"-DRAFT":""}.pdf`;
}
