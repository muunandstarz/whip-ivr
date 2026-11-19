import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync("client/public/klutch-policy-documents.html", "utf8");
const logo = html.match(/const LOGO="([^"]+)"/)![1];
const issuer = "Klutch Risk Retention Group";
const context = vm.createContext({
  LOGO: logo,
  RULES: { TX: { pip: false } },
  PERIODS: { 1: "available for a request", 2: "en route to a pickup", 3: "transporting a passenger" },
  klutchSignoffAccess: { signoff: { name: "Morgan Ellis", title: "Liability Claims Specialist" } },
  esc: (value: unknown) => String(value ?? ""),
  ld: (value: unknown) => String(value ?? ""),
  today: () => "2026-11-19",
  money: (value: number) => `$${value.toFixed(2)}`,
  total: () => 100,
});
vm.runInContext(html.slice(html.indexOf("const FOOT="), html.indexOf("function ask(")), context);
const state = {
  pn: "KIC-TX-999991", st: "TX", member: "Fictional Member", mno: "SAMPLE-001",
  address: "123 Sample Street", city: "Austin", cst: "TX", zip: "78701",
  vehicle: "2024 Sample Vehicle", vin: "SAMPLEVIN000000001", dol: "2026-11-01",
  period: "2", tnc: "Sample TNC", tncEvidenceConfirmed: true, cdate: "2026-11-15",
  hn: "Forged Signer", ht: "Forged Title", carrier: "Example Carrier", attn: "Example Adjuster",
  caddr: "456 Example Street", ccity: "Austin, TX 78701", cclm: "SAMPLE-CLAIM",
  cdt: "2026-11-01", rec: "Synthetic reviewed record",
};
const policy = {
  number: state.pn, member: state.member, address: state.address, city: "Austin, TX 78701",
  vehicle: state.vehicle, vin: state.vin,
  terms: [{ eff: "2026-07-01", exp: "2027-07-01", cov: {
    bi: "$30,000 / $60,000", pd: "$25,000", um: "$30,000 / $60,000", uim: "$30,000 / $60,000",
    compD: "$500", collD: "$500",
  } }],
};
const render = (kind: string) => context.buildDoc(kind, policy, null, state).html as string;

describe("Active Klutch Risk Retention Group branding", () => {
  it("uses the exact new name in the upper-right declaration company block", () => {
    const declaration = render("dec");
    expect(declaration).toContain(`<b>${issuer}</b><br>NAIC 17966`);
    expect(declaration).toContain('alt="Klutch Risk Retention Group"');
    expect(declaration).toContain("424 Church Street, Suite 800");
    expect(declaration).toContain("Nashville, Tennessee 37219");
    expect(declaration).toContain("claims@klutchinsurance.com");
    expect((declaration.match(/class="sheet /g) ?? []).length).toBe(2);
  });
  it.each(["dec", "end", "den", "car", "can"])("prints the new issuer consistently on %s without obsolete issuer wording", kind => {
    const output = render(kind);
    expect(output).toContain(issuer);
    expect(output).not.toMatch(/Klutch Insurance Company|Klutch Insurance/);
    expect(output).toContain("Morgan Ellis");
    expect(output).toContain("Liability Claims Specialist");
    expect(output).not.toContain("Forged Signer");
  });
  it("uses the approved logo and retains all non-branding identifiers and contact data", () => {
    expect(logo).toMatch(/^data:image\/png;base64,/);
    const png = Buffer.from(logo.split(",")[1], "base64");
    expect(png.readUInt32BE(16)).toBe(1056);
    expect(png.readUInt32BE(20)).toBe(372);
    expect(png[25]).toBe(6);
    expect(html).toContain("/manus-storage/klutch-risk-retention-group-print_94cb75e0.png");
    expect(html).not.toMatch(/Klutch Insurance Company|KLUTCH INSURANCE COMPANY|alt="Klutch Insurance"/);
    expect(render("end")).toContain("KIC-END-002");
    expect(render("den")).toContain("Dear Fictional Member:");
    expect(render("can")).toContain("2026-11-15 at 11:59 p.m.");
    expect(html).toContain("readonly aria-readonly=\"true\"");
    expect(html).toContain("DRAFT — INCOMPLETE / NOT ISSUED");
    expect(html).toContain("Metrocars Leasing Corp");
  });
});
