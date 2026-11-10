// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableIframePageLoading":true}}}
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRentalDraft, CONDITION_AREAS, DEFAULT_RENTAL_RATES } from "@shared/rentalHandoff";
const mocks = vi.hoisted(() => ({ saveReturn: vi.fn(), confirmSettlement: vi.fn(), close: vi.fn(), returnComplete: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { rentalHandoff: new Proxy({}, { get: (_, key: string) => ({ useMutation: () => ({ isPending: false, mutateAsync: (mocks as any)[key] || vi.fn().mockResolvedValue({}) }) }) }) } }));
import { ReturnFlow } from "./ReturnFlow";
let root: Root, container: HTMLDivElement;
const returned = () => ({ returnedAt: "2026-11-10T21:00:00Z", odometer: 10010, fuel: "Full" as const, condition: CONDITION_AREAS.map(area => ({ area, ok: true, note: "" })), noticeAt: "", tolls: 0, parking: 0, fines: 0, researchEvents: 0, cleaning: 0, roadside: 0, lossOfUseDays: 0, lossOfUseResponsible: false, damageNoticeNotes: "", notes: "", chargesSettled: false, representativeName: "Test staff" });
const record = (status = "Out") => ({ id: 77, revision: 2, status, activePacketId: 88, draft: { ...emptyRentalDraft(), renterName: "Sample renter", pickupAt: "2026-11-09T21:00:00Z", odometerOut: 10000, election: "B" }, rates: DEFAULT_RENTAL_RATES, returnData: returned(), assets: ["returnFront", "returnRear", "returnDriver", "returnPassenger", "returnDashboard", "returnRenterSignature", "returnRepresentativeSignature"].map((kind, i) => ({ id: 100 + i, kind, url: "/test-image" })), packets: [], emails: [], audit: [] });
const session = (role = "claims") => ({ actor: { key: "test", name: "Test", role, locationIds: [1] }, locations: [{ id: 1, timezone: "America/New_York" }], vehicles: [], settings: {}, launchGaps: [] });
const button = (text: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.includes(text))!;
const field = (label: string) => Array.from(container.querySelectorAll("label")).find(l => l.querySelector("span")?.textContent === label)?.querySelector("input")!;
async function mount(status = "Out", role = "claims", onBack = vi.fn(), refresh = vi.fn().mockResolvedValue({}), override: Record<string, unknown> = {}, upload = vi.fn()) {
  await act(async () => root.render(React.createElement(ReturnFlow, { record: { ...record(status), ...override } as any, session: session(role) as any, upload, refresh, onBack })));
  return { onBack, refresh, upload };
}
async function click(el: HTMLElement) { await act(async () => el.click()); }
async function input(label: string, value: string) {
  const el = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.saveReturn.mockResolvedValue({ revision: 3 });
  mocks.confirmSettlement.mockResolvedValue({ revision: 3 });
  mocks.close.mockResolvedValue({});
  mocks.returnComplete.mockResolvedValue({ emailStatus: "sent" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Return workflow completion", () => {
  it("autosaves return edits with the current revision and disables completion until signatures are recaptured", async () => {
    vi.useFakeTimers(); await mount(); await input("Return odometer (miles)", "10020");
    expect(container.textContent).toContain("Unsaved changes");
    expect(button("Complete return & email copy").disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(mocks.saveReturn).toHaveBeenCalledWith(expect.objectContaining({ id: 77, revision: 2, data: expect.objectContaining({ odometer: 10020 }) }));
    expect(container.textContent).toContain("All changes saved");
    expect(field("Miles driven").value).toBe("20");
  });
  it("flushes a pending return edit before navigating away", async () => {
    vi.useFakeTimers(); const { onBack } = await mount(); await input("Return odometer (miles)", "10030");
    await click(button("Back to rental")); expect(mocks.saveReturn).toHaveBeenCalledTimes(1); expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("requires a separate explicit settlement confirmation before closing an unpaid returned record", async () => {
    await mount("Returned");
    expect(button("Confirm charges posted and settled").disabled).toBe(true);
    expect(button("Mark charges posted & close").disabled).toBe(true);
    const label = Array.from(container.querySelectorAll("label")).find(l => l.textContent?.includes("I confirm charges were posted"))!;
    await click(label.querySelector("input")!); await click(button("Confirm charges posted and settled"));
    expect(mocks.confirmSettlement).toHaveBeenCalledWith({ id: 77, revision: 2, confirmed: true });
    expect(mocks.close).not.toHaveBeenCalled(); expect(container.textContent).toContain("signed return PDF remains unchanged");
  });
  it("does not expose settlement or close controls to shop staff", async () => {
    await mount("Returned", "shop"); expect(button("Confirm charges posted and settled")).toBeUndefined();
    expect(button("Mark charges posted & close")).toBeUndefined(); expect(mocks.saveReturn).not.toHaveBeenCalled();
  });
  it("requires the dedicated dashboard photo even when exterior views, signatures and extra photos exist", async () => {
    const assets = [...record().assets.filter(a => a.kind !== "returnDashboard"), { id: 120, kind: "returnExtra", url: "/extra" }];
    await mount("Out", "claims", undefined, undefined, { assets });
    expect(container.textContent).toContain("Add the required return dashboard photo (odometer, fuel and warning lights).");
    expect(button("Complete return & email copy").disabled).toBe(true);
    expect(mocks.returnComplete).not.toHaveBeenCalled();
  });
  it("allows completion only with all required return evidence", async () => {
    await mount(); expect(button("Complete return & email copy").disabled).toBe(false);
    await click(button("Complete return & email copy"));
    expect(mocks.returnComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 77, revision: 2, data: expect.objectContaining({ odometer: 10010, fuel: "Full" }) }));
  });
  it("shows a dedicated dashboard upload with exact parked-vehicle guidance and separate camera/file controls", async () => {
    await mount();
    const dashboard = [...container.querySelectorAll(".r-photo")].find(p => p.querySelector("strong")?.textContent === "Return dashboard (required)")!;
    expect(dashboard.textContent).toContain("While parked, turn ignition on and capture entire instrument cluster clearly: odometer, fuel and warning lights.");
    expect(dashboard.querySelectorAll('input[type="file"]')).toHaveLength(2);
    expect(dashboard.querySelector('input[capture="environment"]')).not.toBeNull();
    expect(dashboard.querySelector("img")?.getAttribute("src")).toBe("/test-image");
    const chooser = dashboard.querySelector<HTMLInputElement>('input[aria-label="Choose file: Return dashboard (required)"]')!;
    expect(document.getElementById(chooser.getAttribute("aria-describedby")!)?.textContent).toContain("While parked");
  });
  it("autosaves exact return fuel values and invalidates previous signatures", async () => {
    vi.useFakeTimers(); await mount();
    const radio = container.querySelector<HTMLInputElement>('input[type="radio"][value="3/4"]')!;
    await click(radio); expect(radio.checked).toBe(true);
    expect(button("Complete return & email copy").disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(mocks.saveReturn).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, data: expect.objectContaining({ fuel: "3/4" }) }));
  });
  it.each(["Returned", "Closed"])("locks the gauge, readings and dashboard uploads for %s returns", async status => {
    await mount(status);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].every(r => r.disabled)).toBe(true);
    expect(field("Return odometer (miles)").closest("fieldset")?.disabled).toBe(true);
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="file"]')].every(r => r.disabled)).toBe(true);
    await click(container.querySelector<HTMLInputElement>('input[type="radio"][value="Empty"]')!);
    expect(mocks.saveReturn).not.toHaveBeenCalled();
  });
});
describe("Explicit return odometer measurement", () => {
  it("leaves a new return blank instead of copying pickup and holds other draft edits until measurement", async () => {
    vi.useFakeTimers(); await mount("Out", "claims", undefined, undefined, { returnData: null });
    expect(field("Return odometer (miles)").value).toBe("");
    expect(field("Miles driven").value).toBe("");
    expect(field("Miles driven").readOnly).toBe(true);
    expect(container.textContent).toContain("Enter the measured return odometer (miles).");
    await click(container.querySelector<HTMLInputElement>('input[type="radio"][value="1/4"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(mocks.saveReturn).not.toHaveBeenCalled();
    expect(button("Complete return & email copy").disabled).toBe(true);
    await input("Return odometer (miles)", "10025");
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(mocks.saveReturn).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ odometer: 10025, fuel: "1/4" }) }));
    expect(field("Miles driven").value).toBe("25");
  });
  it.each(["", "9999", "2000001", "-1"])("rejects invalid or unentered reading %s without a fabricated save", async value => {
    vi.useFakeTimers(); await mount(); await input("Return odometer (miles)", value);
    await input("Return representative full name", "Changed staff");
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(mocks.saveReturn).not.toHaveBeenCalled();
    expect(field("Return odometer (miles)").getAttribute("aria-invalid")).toBe("true");
    expect(field("Miles driven").value).toBe("");
    expect(button("Complete return & email copy").disabled).toBe(true);
  });
  it("preserves saved zero at pickup and return and displays zero miles driven", async () => {
    await mount("Out", "claims", undefined, undefined, { draft: { ...record().draft, odometerOut: 0 }, returnData: { ...returned(), odometer: 0 } });
    expect(container.textContent).toContain("0 miles"); expect(field("Return odometer (miles)").value).toBe("0");
    expect(field("Miles driven").value).toBe("0"); expect(button("Complete return & email copy").disabled).toBe(false);
  });
  it("accepts explicitly entered zero for a new return when pickup is zero", async () => {
    vi.useFakeTimers(); await mount("Out", "claims", undefined, undefined, { draft: { ...record().draft, odometerOut: 0 }, returnData: null });
    await input("Return odometer (miles)", "0");
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    expect(mocks.saveReturn).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ odometer: 0 }) }));
    expect(field("Miles driven").value).toBe("0");
  });
  it("leaves miles driven blank if the pickup odometer was not recorded", async () => {
    await mount("Out", "claims", undefined, undefined, { draft: { ...record().draft, odometerOut: null } });
    expect(field("Miles driven").value).toBe(""); expect(container.textContent).toContain("Not recorded miles");
  });
});
