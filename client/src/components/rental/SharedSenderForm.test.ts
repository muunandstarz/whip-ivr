// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SharedSenderForm } from "./SharedSenderForm";
const mocked = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { rentalHandoff: { saveSharedSender: { useMutation: () => ({ mutateAsync: mocked.save }) } } } }));
let host: HTMLElement, root: Root;
const refresh = vi.fn(async () => undefined);
beforeEach(async () => {
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocked.save.mockReset(); refresh.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(createElement(SharedSenderForm, { refresh })); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function enterSecret() {
  const input = host.querySelector<HTMLInputElement>('input[type="password"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "synthetic-secret-not-a-real-key");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
async function submit() {
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
describe("shared rental sender setup", () => {
  it("does not fetch or send credentials on mount and requires explicit secret entry", () => {
    expect(mocked.save).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(host.textContent).toContain("No technician Gmail connection");
  });
  it("uses the admin endpoint, clears the secret after success and never renders it in confirmation", async () => {
    mocked.save.mockResolvedValue({ success: true, sender: { configured: true, connected: true, provider: "mailgun" } });
    const input = await enterSecret(); await submit();
    expect(mocked.save).toHaveBeenCalledWith(expect.objectContaining({ domain: "mail.whipflow.drivewhip.com", region: "US", apiKey: "synthetic-secret-not-a-real-key" }));
    expect(input.value).toBe(""); expect(refresh).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("nothing was sent during setup");
    expect(host.textContent).not.toContain("synthetic-secret-not-a-real-key");
  });
  it("reports permission failure without pretending email is ready", async () => {
    mocked.save.mockRejectedValue(new Error("Mailgun domain access was denied."));
    await enterSecret(); await submit();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("domain access was denied");
    expect(refresh).not.toHaveBeenCalled(); expect(host.querySelector('[role="status"]')).toBeNull();
  });
});
