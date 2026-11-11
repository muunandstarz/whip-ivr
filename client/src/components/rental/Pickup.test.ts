// @vitest-environment happy-dom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRentalDraft, PICKUP_EVIDENCE_KINDS, RETURN_EVIDENCE_KINDS, type RentalDraft } from "@shared/rentalHandoff";
vi.mock("@/lib/trpc", () => ({ trpc: { rentalHandoff: new Proxy({}, { get: () => ({ useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) }) }) } }));
import { Pickup } from "./Steps";
let root: Root, container: HTMLDivElement;
async function mount(draft: RentalDraft = emptyRentalDraft(), disabled = false, assets: any[] = []) {
  const update = vi.fn();
  await act(async () => root.render(React.createElement(Pickup, { draft, update, disabled, assets, upload: vi.fn(), vehicles: [], locations: [] })));
  return update;
}
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const odometer = () => [...container.querySelectorAll("label")].find(l => l.querySelector("span")?.textContent === "Pickup odometer (miles)")!.querySelector("input")!;
describe("Pickup readings and dashboard evidence", () => {
  it("shows the shared gauge and sends the exact pickup fuel enum through the draft update", async () => {
    const update = await mount({ ...emptyRentalDraft(), odometerOut: 0, fuelOut: "1/2" });
    expect(container.querySelector(".r-fuel-gauge legend")?.textContent).toBe("Fuel at pickup");
    expect(container.querySelector('select[aria-label="Fuel out"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value).toBe("1/2");
    await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"][value="Empty"]')!.click());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ fuelOut: "Empty", odometerOut: 0 }));
  });
  it("preserves zero pickup mileage and permits clearing to the existing nullable schema", async () => {
    const update = await mount({ ...emptyRentalDraft(), odometerOut: 0 });
    expect(odometer().value).toBe("0");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(odometer(), "");
      odometer().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ odometerOut: null }));
  });
  it("renders a mandatory dedicated dashboard upload that extra photos cannot satisfy", async () => {
    await mount(emptyRentalDraft(), false, [{ id: 5, kind: "extra", url: "/extra-photo" }]);
    const photos = [...container.querySelectorAll(".r-pickup-card .r-photo")];
    expect(photos).toHaveLength(PICKUP_EVIDENCE_KINDS.length + 1);
    const dashboard = photos.find(p => p.querySelector("strong")?.textContent === "Pickup dashboard (required)")!;
    expect(dashboard.querySelector("img")).toBeNull();
    expect(dashboard.textContent).toContain("While parked, turn ignition on and capture entire instrument cluster clearly: odometer, fuel and warning lights.");
    expect(dashboard.querySelectorAll('input[type="file"]')).toHaveLength(2);
    expect(dashboard.querySelector('input[capture="environment"]')).not.toBeNull();
    expect(dashboard.querySelector('input[aria-label="Choose file: Pickup dashboard (required)"]')).not.toBeNull();
    expect(container.textContent).toContain("extras do not replace the dashboard photo");
  });
  it("renders each dedicated view with separate camera and file controls and rejects opposite-phase previews", async () => {
    await mount(emptyRentalDraft(), false, RETURN_EVIDENCE_KINDS.map((kind,i)=>({id:i+1,kind,url:`/api/rental-handoff/files/asset/${i+1}`})));
    const labels=["Front","Rear","Driver side","Passenger side","Front-driver corner (required)","Front-passenger corner (required)","Rear-driver corner (required)","Rear-passenger corner (required)","Pickup windshield (required)","Pickup VIN plate (required)","Pickup dashboard (required)"];
    expect(labels).toHaveLength(PICKUP_EVIDENCE_KINDS.length);
    for(const label of labels){
      expect(container.querySelector(`input[aria-label="Take photo: ${label}"]`)).not.toBeNull();
      expect(container.querySelector(`input[aria-label="Choose file: ${label}"]`)).not.toBeNull();
    }
    expect(container.querySelectorAll(".r-pickup-photos img")).toHaveLength(0);
    expect(container.textContent).toContain("All 11 dedicated pickup photos are required");
  });
  it("leaves staff observed warning-light notes blank until manually entered", async () => {
    const update=await mount();
    const label=[...container.querySelectorAll("label")].find(l=>l.querySelector("span")?.textContent==="Pickup observed dashboard warning lights — staff manual notes (optional)")!;
    const textarea=label.querySelector("textarea")!;expect(textarea.value).toBe("");
    expect(container.textContent).toContain("it does not mean no warning lights");
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(textarea,"ABS lamp observed");
      textarea.dispatchEvent(new Event("input",{bubbles:true}));
    });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({dashboardAlertsOut:"ABS lamp observed"}));
  });
  it("displays the saved dedicated dashboard photo", async () => {
    await mount(emptyRentalDraft(), false, [{ id: 5, kind: "dashboard", url: "/pickup-dashboard" }]);
    expect(container.querySelector('img[alt="Pickup dashboard (required)"]')?.getAttribute("src")).toBe("/pickup-dashboard");
  });
  it("locks pickup fuel and dashboard controls alongside the existing readings", async () => {
    const update = await mount(emptyRentalDraft(), true);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].every(r => r.disabled)).toBe(true);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="file"]')].every(r => r.disabled)).toBe(true);
    expect(odometer().closest("fieldset")?.disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"][value="Empty"]')!.click());
    expect(update).not.toHaveBeenCalled();
  });
});
