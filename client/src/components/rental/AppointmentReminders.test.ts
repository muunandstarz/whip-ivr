// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ data: {} as any, config: {} as any, save: vi.fn(), refetch: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { rentalHandoff: {
  reminders: { useQuery: () => ({ data: mocks.data, refetch: mocks.refetch }) },
  reminderConfig: { useQuery: () => ({ data: mocks.config }) },
  saveReminders: { useMutation: () => ({ mutateAsync: mocks.save }) },
} } }));
import { AppointmentReminders } from "./AppointmentReminders";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).React = React;
let container: HTMLDivElement, root: Root;
const actor = { key: "claims:1", name: "Claims", role: "claims" as const, locationIds: [] };
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === name)!;
const mount = async (role: "claims" | "shop" = "claims") => { await act(async () => { root.render(React.createElement(AppointmentReminders, { id: 8, actor: { ...actor, role }, beforeSave: mocks.flush })); }); };
beforeEach(() => {
  vi.clearAllMocks(); mocks.save.mockResolvedValue({}); mocks.flush.mockResolvedValue(1); mocks.refetch.mockResolvedValue({});
  mocks.config = { ready: false };
  mocks.data = { preview: "Total Recon Rockville, 101 Example Street, Rockville, MD. Call 301-555-0123.", eligible: false, suppressed: false, phoneValid: true, consentMatchesPhone: false, slots: [{ kind: "24h", dueAt: 1794614400000, expired: false }, { kind: "2h", dueAt: 1794693600000, expired: false }], subscription: { enabled: false, canceled: false, consentAt: null, consentBy: null }, logs: [] };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe("Customer appointment reminder consent", () => {
  it("renders location/phone and both scheduled reminder times but never sends or saves on mount", async () => {
    await mount(); expect(container.textContent).toContain("Live SMS is not active"); expect(container.textContent).toContain("Day before (24 hours)"); expect(container.textContent).toContain("Appointment day (2 hours before)"); expect(container.textContent).toContain("301-555-0123"); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.flush).not.toHaveBeenCalled();
  });
  it("requires express optional consent and flushes the saved mobile/appointment before enabling", async () => {
    await mount(); expect(button("Save consent & enable reminders").disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(button("Save consent & enable reminders").disabled).toBe(false);
    await act(async () => button("Save consent & enable reminders").click());
    expect(mocks.save).toHaveBeenCalledWith({ id: 8, settings: { enabled: true, canceled: false, confirmedConsent: true } });
    expect(mocks.flush.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]);
  });
  it("never saves consent when the rental's autosave failed", async () => {
    mocks.flush.mockRejectedValue(new Error("Save failed")); await mount();
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => button("Save consent & enable reminders").click());
    expect(mocks.save).not.toHaveBeenCalled(); expect(container.textContent).toContain("Save failed");
  });
  it("blocks an opted-out phone and labels acceptance honestly rather than claiming delivery", async () => {
    mocks.data.suppressed = true; mocks.data.logs = [{ id: 1, kind: "24h", state: "accepted", updatedAt: 1794614400000 }];
    await mount(); expect(button("Save consent & enable reminders")).toBeUndefined(); expect(container.textContent).toContain("Customer opted out"); expect(container.textContent).toContain("delivery unconfirmed");
  });
  it("shows shop staff the scoped preview without consent or cancellation write controls", async () => {
    await mount("shop"); expect(container.textContent).toContain("Customer message preview"); expect(container.querySelectorAll("button")).toHaveLength(0); expect(container.querySelector("input")).toBeNull();
  });
  it("does not enable reminders with an invalid phone or missing location preview", async () => {
    mocks.data.phoneValid = false; mocks.data.preview = null; await mount();
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(button("Save consent & enable reminders").disabled).toBe(true);
  });
});
