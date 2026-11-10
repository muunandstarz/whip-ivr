// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SharedSenderForm } from "./SharedSenderForm";
const mocked = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { rentalHandoff: {
  connectSharedGmail: { useMutation: () => ({ mutateAsync: mocked.connect }) },
  disconnectSharedGmail: { useMutation: () => ({ mutateAsync: mocked.disconnect }) },
} } }));
let host: HTMLElement, root: Root;
const refresh = vi.fn(async () => undefined);
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;
async function render(connected = false) {
  await act(async () => { root.render(createElement(SharedSenderForm, { refresh, sender: { connected, email: connected ? "shared@example.test" : null } })); });
}
async function click(node: HTMLElement) { await act(async () => { node.click(); }); }
beforeEach(async () => {
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.connect.mockReset(); mocked.disconnect.mockReset(); refresh.mockClear();
  window.history.replaceState({}, "", "/rental-handoff/admin");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
describe("shared rental Gmail setup", () => {
  it("does nothing on mount and removes all Mailgun secret-entry controls", () => {
    expect(mocked.connect).not.toHaveBeenCalled(); expect(mocked.disconnect).not.toHaveBeenCalled();
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(host.textContent).toContain("Technicians do not connect their own accounts");
    expect(host.textContent).not.toMatch(/Mailgun|API key/);
    expect(host.textContent).toContain("No shared Gmail account is connected yet");
  });
  it("uses the shared endpoint only after explicit click and navigates to Google's consent page", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    mocked.connect.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-state" });
    await click(button("Connect shared Gmail"));
    expect(mocked.connect).toHaveBeenCalledWith();
    expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=synthetic-state");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("does not navigate to an unexpected authorization host", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    mocked.connect.mockResolvedValue({ url: "https://invalid.example/authorize" });
    await click(button("Connect shared Gmail"));
    expect(assign).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not be opened");
  });
  it("reports permission/setup failures without claiming the shared mailbox is connected", async () => {
    mocked.connect.mockRejectedValue(new Error("Register the rental callback on the existing Google client."));
    await click(button("Connect shared Gmail"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Register the rental callback");
    expect(refresh).not.toHaveBeenCalled();
    expect(button("Connect shared Gmail").disabled).toBe(false);
  });
  it("requires explicit shared-disconnect confirmation and never alters rental records", async () => {
    await render(true); mocked.disconnect.mockResolvedValue({ success: true });
    expect(host.textContent).toContain("shared@example.test");
    expect(button("Disconnect shared Gmail").disabled).toBe(true);
    await click(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    await click(button("Disconnect shared Gmail"));
    expect(mocked.disconnect).toHaveBeenCalledWith(); expect(refresh).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Rental records and PDFs were not changed");
  });
  it("refreshes without authorizing or sending and shows exact one-time setup instructions", async () => {
    await click(button("Refresh connection status"));
    expect(refresh).toHaveBeenCalledOnce(); expect(mocked.connect).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Nothing was sent");
    expect(host.textContent).toContain("https://whipclaimsivr.com/api/rental-handoff/gmail/callback");
    expect(host.textContent).toContain("Keep every existing redirect entry");
    expect(host.textContent).toContain("not inbox access");
  });
  it("shows a safe callback error without reflecting OAuth query data", async () => {
    window.history.replaceState({}, "", "/rental-handoff/admin?gmail=error&code=do-not-show&state=private-query");
    await act(async () => root.render(createElement(SharedSenderForm, { key: "callback-error", refresh, sender: { connected: false } })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("connection was not completed");
    expect(host.textContent).not.toMatch(/do-not-show|private-query/);
    expect(mocked.connect).not.toHaveBeenCalled();
  });
  it("shows connection success only with an actually connected shared sender", async () => {
    window.history.replaceState({}, "", "/rental-handoff/admin?gmail=connected");
    await act(async () => root.render(createElement(SharedSenderForm, { key: "unconnected-result", refresh, sender: { connected: false } })));
    expect(host.textContent).not.toContain("Shared Gmail connected.");
    await act(async () => root.render(createElement(SharedSenderForm, { key: "connected-result", refresh, sender: { connected: true, email: "shared@example.test" } })));
    expect(host.textContent).toContain("Shared Gmail connected. No email was sent during setup.");
  });
});
