// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableIframePageLoading":true}}}
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAcordPreset, emptyAcordDraft, type AcordDraft } from "@shared/acordPresets";

const mocks = vi.hoisted(() => ({ pdf: vi.fn(), fresh: vi.fn(), refetch: vi.fn(), hook: vi.fn(), ready: true, revision: 7, identityKey: "staff" }));
vi.mock("@/lib/acordCertificatePdf", () => ({ renderAcordCertificatePdf: mocks.pdf }));
vi.mock("@/hooks/useKlutchSignoff", () => ({ useKlutchSignoff: (enabled: boolean) => {
  mocks.hook(enabled);
  return { ready: mocks.ready, revision: mocks.revision, identityKey: mocks.identityKey,
    signoff: mocks.ready ? { name: "Approved Representative", title: "Approved Title", revision: mocks.revision } : undefined,
    requireApprovedSignoff: mocks.fresh, refetch: mocks.refetch };
} }));
import AcordCertificateBuilder from "./AcordCertificateBuilder";

let root: Root;
let container: HTMLDivElement;
const saved = vi.fn();
const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(element => element.textContent === label)!;
const input = (name: string) => container.querySelector<HTMLInputElement>(`#acord-${name}`)!;
const checkbox = (name: string) => input(`confirm-${name}`);
const click = async (element: HTMLElement) => { await act(async () => { element.click(); }); };
async function change(id: string, value: string) {
  await act(async () => {
    const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#acord-${id}`)!;
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function complete(preset: AcordDraft["preset"] = "klutch-minimum"): AcordDraft {
  return { ...applyAcordPreset(emptyAcordDraft("2026-11-19"), preset, "MD"),
    issueDate: "2026-11-19", effectiveDate: "2026-01-01", expirationDate: "2027-01-01",
    contactName: "TEST PRODUCER CONTACT",
    namedOperator: "TEST OPERATOR", operatorAddress: "TEST ADDRESS", policyNumber: "TEST-POLICY",
    certificateNumber: "TEST-CERT", holderName: "TEST HOLDER", holderAddress: "TEST ADDRESS",
    vehicleYear: "2026", vehicleMake: "TEST", vehicleModel: "MODEL", vin: "1HGCM82633A000001",
    coverageReference: "TEST ACTUAL RECORD", metrocarsRepresentative: "TEST METRO AUTHORITY", metrocarsRepresentativeTitle: "TEST TITLE" };
}
async function mount(initialDraft?: unknown, sampleMode = false) {
  await act(async () => { root.render(React.createElement(AcordCertificateBuilder, { initialDraft, onDraftChange: saved, sampleMode })); });
}
async function confirmAll() {
  for (const name of ["source", "scope", "inForce", "authority", "uberCombined", "csl", "both"]) {
    if (checkbox(name) && !checkbox(name).checked) await click(checkbox(name));
  }
}
async function draftPreview() {
  await click(button("Preview draft"));
  const continueButton = button("Preview watermarked draft");
  if (continueButton) await click(continueButton);
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.setSystemTime(new Date("2026-11-19T17:00:00Z"));
  const consoleError = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (args[0] instanceof DOMException && args[0].message.includes("Iframe page loading is disabled")) return;
    consoleError(...args);
  });
  for (const mock of [mocks.pdf, mocks.fresh, mocks.refetch, mocks.hook, saved]) mock.mockReset();
  mocks.ready = true; mocks.revision = 7; mocks.identityKey = "staff";
  mocks.fresh.mockImplementation(async () => ({ name: "Approved Representative", title: "Approved Title", revision: mocks.revision }));
  mocks.refetch.mockResolvedValue({});
  mocks.pdf.mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70]), warnings: [], filename: "unused.pdf", pageCount: 1 });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:certificate-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("ACORD certificate builder", () => {
  it("uses editable corporate defaults without personal sample data and no automatic endorsements", async () => {
    await mount();
    expect(input("insuredOrganization").value).toBe("Sunbeam Fleet");
    expect(input("namedOperator").value).toBe("");
    expect(input("additionalInsured").checked).toBe(false);
    expect(input("subrogationWaived").checked).toBe(false);
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(saved.mock.calls.at(-1)?.[0]).not.toHaveProperty("consent");
    await change("producerName", "EDITED PRODUCER");
    await change("insuredOrganization", "EDITED ORGANIZATION");
    expect(saved.mock.calls.at(-1)?.[0].producerName).toBe("EDITED PRODUCER");
    expect(saved.mock.calls.at(-1)?.[0].insuredOrganization).toBe("EDITED ORGANIZATION");
  });
  it("locks canonical Klutch attribution and freshly checks before a watermarked incomplete preview", async () => {
    await mount({ ...complete(), handlerName: "FORGED LOGIN", representativeName: "FORGED" });
    expect(input("klutch-name").readOnly).toBe(true);
    expect(input("klutch-name").value).toBe("Approved Representative");
    await draftPreview();
    expect(mocks.fresh).toHaveBeenCalledOnce();
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ representativeName: "Approved Representative", representativeTitle: "Approved Title", naic: "17966" }), expect.objectContaining({ draft: true, missingDetails: expect.arrayContaining([expect.stringContaining("Confirm")]) }));
    expect(container.querySelector("iframe")?.getAttribute("title")).toBe("Klutch ACORD 25 PDF preview");
  });
  it("offers a missing-list watermarked draft when final is incomplete, without a manager gate", async () => {
    await mount();
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Vehicle VIN");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("no manager approval");
    expect(mocks.pdf).not.toHaveBeenCalled();
    await click(button("Download watermarked draft"));
    expect(mocks.pdf.mock.calls[0][1].draft).toBe(true);
    expect(container.textContent).toContain("Klutch-ACORD-25-Certificate-DRAFT.pdf");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });
  it("requires all confirmations for final and clears them and the PDF on any input edit", async () => {
    await mount(complete());
    await confirmAll();
    await click(button("Download final PDF"));
    expect(mocks.pdf.mock.calls[0][1].draft).toBe(false);
    expect(container.querySelector("iframe")).not.toBeNull();
    await change("plate", "EDITED");
    expect(checkbox("source").checked).toBe(false);
    expect(checkbox("scope").checked).toBe(false);
    expect(checkbox("inForce").checked).toBe(false);
    expect(checkbox("authority").checked).toBe(false);
    expect(container.querySelector("iframe")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:certificate-test");
    await click(button("Download final PDF"));
    expect(mocks.pdf).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it("resets preset assertions, preserves editable facts, and limits state selection to eight states", async () => {
    await mount({ ...complete(), additionalInsured: true, subrogationWaived: true, endorsementReference: "TEST ENDORSEMENT" });
    await confirmAll();
    await change("preset", "metrocars-minimum");
    expect(checkbox("source").checked).toBe(false);
    expect(input("additionalInsured").checked).toBe(false);
    expect(input("subrogationWaived").checked).toBe(false);
    expect(input("endorsementReference").value).toBe("");
    expect(input("namedOperator").value).toBe("TEST OPERATOR");
    expect(container.querySelector<HTMLSelectElement>("#acord-state")?.options.length).toBe(8);
    await change("state", "TX");
    expect(input("biPerson").value).toBe("30000");
    expect(input("biAccident").value).toBe("60000");
    expect(input("propertyDamage").value).toBe("25000");
  });
  it("uses explicit manual MetroCars authority, no login autofill, no NAIC and no MVA insurer", async () => {
    const metro = complete("metrocars-minimum");
    await mount({ ...metro, metrocarsRepresentative: "", metrocarsRepresentativeTitle: "" });
    expect(input("metrocarsRepresentative").value).toBe("");
    expect(mocks.hook).toHaveBeenLastCalledWith(false);
    await change("metrocarsRepresentative", "TEST AUTHORITY");
    await change("metrocarsRepresentativeTitle", "TEST ROLE");
    await confirmAll();
    await click(button("Download final PDF"));
    const data = mocks.pdf.mock.calls[0][0];
    expect(data.representativeName).toBe("TEST AUTHORITY");
    expect(data.representativeTitle).toBe("TEST ROLE");
    expect(data.naic).toBeUndefined();
    expect(data.insurerName).toContain("Self-insured");
    expect(data.selfInsured).toBe(true);
    expect(data.insurerName).not.toContain("MVA");
    expect(mocks.fresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("MetroCars-ACORD-25-TEST-CERT.pdf");
  });
  it("requires actual endorsement references without creating requested additional-insured or waiver status", async () => {
    await mount(complete());
    await click(input("additionalInsured"));
    await click(input("subrogationWaived"));
    await confirmAll();
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Actual provision / endorsement reference");
    await click(button("Download watermarked draft"));
    expect(mocks.pdf.mock.calls[0][0].additionalInsured).toBe(false);
    expect(mocks.pdf.mock.calls[0][0].subrogationWaived).toBe(false);
  });
  it("requires explicit documentation for both limit formats and never prints unconfirmed redundant limits", async () => {
    await mount({ ...complete(), limitBasis: "both", combinedSingleLimit: "300000" });
    for (const name of ["source", "scope", "inForce", "authority"]) await click(checkbox(name));
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("must confirm both CSL and split");
    await click(button("Download watermarked draft"));
    expect(mocks.pdf.mock.calls[0][0].bothLimitsConfirmed).toBe(false);
    expect(mocks.pdf.mock.calls[0][0].combinedSingleLimit).toBeUndefined();
    expect(mocks.pdf.mock.calls[0][0].biPerson).toBeUndefined();
    await click(checkbox("both"));
    await click(button("Download final PDF"));
    expect(mocks.pdf.mock.calls[1][0].bothLimitsConfirmed).toBe(true);
  });
  it("adds sample mode to renderer options without removing draft protection", async () => {
    await mount(complete(), true);
    await draftPreview();
    expect(mocks.pdf.mock.calls[0][1]).toEqual(expect.objectContaining({ sample: true, draft: true }));
    expect(container.textContent).toContain("SAMPLE — NOT VALID");
  });
  it("ignores a late async PDF after editing and keeps a single busy guard", async () => {
    let finish!: (value: unknown) => void;
    mocks.pdf.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount(complete());
    await confirmAll();
    await click(button("Download final PDF"));
    expect(button("Download final PDF").disabled).toBe(true);
    await click(button("Download final PDF"));
    expect(mocks.pdf).toHaveBeenCalledOnce();
    await change("certificateNumber", "REPLACED");
    await act(async () => { finish({ bytes: new Uint8Array([1]), warnings: [], filename: "old.pdf", pageCount: 1 }); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBeNull();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
  it("ignores a late fresh signoff response after a field edit", async () => {
    let finish!: (value: unknown) => void;
    mocks.fresh.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount(complete()); await confirmAll();
    await click(button("Download final PDF"));
    await change("phone", "EDITED");
    await act(async () => { finish({ name: "Approved Representative", title: "Approved Title", revision: 7 }); });
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBeNull();
  });
  it("revokes consent and PDF on signoff revisions and blocks a changed fresh signoff", async () => {
    const draft = complete();
    await mount(draft); await confirmAll(); await click(button("Download final PDF"));
    mocks.revision = 8;
    await mount(draft);
    expect(checkbox("authority").checked).toBe(false);
    expect(container.querySelector("iframe")).toBeNull();
    await confirmAll();
    mocks.fresh.mockResolvedValueOnce({ name: "NEW AUTHORITY", title: "NEW TITLE", revision: 9 });
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("sign-off changed");
    expect(checkbox("source").checked).toBe(false);
    expect(mocks.pdf).toHaveBeenCalledOnce();
  });
  it("never restores confirmations or locked attribution, and clear pushes only blank inputs to parent", async () => {
    const draft = complete();
    await mount({ ...draft, consent: { source: true, authority: true }, representativeName: "FORGED" });
    expect(checkbox("source").checked).toBe(false);
    await confirmAll(); await click(button("Download final PDF"));
    await mount({ ...draft, certificateNumber: "RESTORED" });
    expect(input("certificateNumber").value).toBe("RESTORED");
    expect(checkbox("source").checked).toBe(false);
    expect(container.querySelector("iframe")).toBeNull();
    await click(button("Clear certificate"));
    expect(input("namedOperator").value).toBe("");
    expect(input("producerName").value).toBe("");
    expect(input("effectiveDate").value).toBe("");
    expect(input("coverageReference").value).toBe("");
    expect(saved.mock.calls.at(-1)?.[0].namedOperator).toBe("");
    expect(saved.mock.calls.at(-1)?.[0]).not.toHaveProperty("consent");
    expect(input("klutch-name").value).toBe("Approved Representative");
  });
  it("does not treat parent save feedback as a restore or revoke confirmations", async () => {
    await mount(complete());
    const emitted = saved.mock.calls.at(-1)![0];
    await confirmAll();
    await mount(emitted);
    expect(checkbox("source").checked).toBe(true);
  });
  it("handles renderer failures cleanly and permits retry without leaving a stale PDF", async () => {
    mocks.pdf.mockRejectedValueOnce(new Error("Unable to load blank ACORD template. Please retry."));
    await mount(complete()); await confirmAll();
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load blank ACORD template");
    expect(container.querySelector("iframe")).toBeNull();
    expect(button("Download final PDF").disabled).toBe(false);
    await click(button("Download final PDF"));
    expect(container.querySelector("iframe")).not.toBeNull();
  });
  it("requires ready Klutch signoff even for incomplete drafts", async () => {
    mocks.ready = false;
    await mount();
    await click(button("Preview draft"));
    expect(button("Preview watermarked draft").disabled).toBe(true);
    expect(mocks.fresh).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("requires a separate documented Uber combined requirement, not an assumed CSL", async () => {
    await mount({ ...complete("klutch-fl-uber-black"), limitBasis: "split" });
    for (const name of ["source", "scope", "inForce", "authority"]) await click(checkbox(name));
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("combined BI + PD requirement");
    await click(button("Return to editing"));
    await click(checkbox("uberCombined"));
    await click(button("Download final PDF"));
    expect(mocks.pdf.mock.calls[0][0]).toEqual(expect.objectContaining({ limitBasis: "split", biPerson: "125000", biAccident: "250000", propertyDamage: "50000" }));
    expect(mocks.pdf.mock.calls[0][0].combinedSingleLimit).toBeUndefined();
  });
  it("does not print latent CSL or split amounts after the format selection is cleared", async () => {
    await mount({ ...complete(), combinedSingleLimit: "300000", limitBasis: "" });
    await draftPreview();
    const data = mocks.pdf.mock.calls[0][0];
    expect(data.combinedSingleLimit).toBeUndefined();
    expect(data.biPerson).toBeUndefined();
    expect(data.biAccident).toBeUndefined();
    expect(data.propertyDamage).toBeUndefined();
  });
  it("requires explicit actual-policy CSL documentation rather than using split arithmetic", async () => {
    await mount({ ...complete(), limitBasis: "csl", combinedSingleLimit: "300000" });
    for (const name of ["source", "scope", "inForce", "authority"]) await click(checkbox(name));
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("expressly states a combined single limit");
    await click(button("Download watermarked draft"));
    expect(mocks.pdf.mock.calls[0][0].combinedSingleLimit).toBeUndefined();
    await click(checkbox("csl"));
    await click(button("Download final PDF"));
    expect(mocks.pdf.mock.calls[1][0].combinedSingleLimit).toBe("300000");
  });
  it("blocks expired-current-day Uber coverage even when the certificate date was within coverage", async () => {
    await mount({ ...complete("klutch-fl-uber-black"), issueDate: "2026-03-01", expirationDate: "2026-10-01" });
    await confirmAll();
    await click(button("Download final PDF"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("currently active in Florida");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("passes a single vehicle/VIN and single endorsement note with approved RRG branding", async () => {
    await mount({ ...complete(), description: "TEST MANUAL PIP NOTE", endorsementReference: "TEST ENDORSEMENT" });
    await confirmAll(); await click(button("Download final PDF"));
    const data = mocks.pdf.mock.calls[0][0];
    expect(data.insurerName).toBe("Klutch Risk Retention Group");
    expect(data.vin).toBe("1HGCM82633A000001");
    expect(data.vehicle).toBe("2026 TEST MODEL");
    expect(data.description).toContain("TEST MANUAL PIP NOTE");
    expect(data.description).not.toContain(data.vin);
    expect(data.description).not.toContain(data.vehicle);
    expect(data.description).not.toContain("TEST ENDORSEMENT");
    expect(data.endorsementNotes).toBe("TEST ENDORSEMENT");
  });
});
