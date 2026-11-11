// @vitest-environment happy-dom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoUpload } from "./Media";
let root: Root, container: HTMLDivElement;
const photos = [
  { id: 1, kind: "cornerFrontDriver" as const, url: "/api/rental-handoff/files/asset/1" },
  { id: 2, kind: "cornerFrontDriver" as const, url: "/api/rental-handoff/files/asset/2" },
  { id: 3, kind: "returnCornerFrontDriver" as const, url: "/api/rental-handoff/files/asset/3" },
];
const gallery = () => document.querySelector<HTMLElement>('[role="dialog"]');
const galleryButton = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(disabled = false) {
  await act(async () => root.render(React.createElement(PhotoUpload, { kind: "cornerFrontDriver", label: "Front-driver corner", assets: photos, upload: vi.fn(), disabled })));
}
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
describe("Protected rental in-app photo gallery", () => {
  it("expands the newest matching photo in a labeled gallery and navigates retained originals without opposite phase", async () => {
    await mount();
    expect(container.querySelector("a[target='_blank']")).toBeNull();
    const trigger = galleryButton("Expand photo: Front-driver corner");
    trigger.focus(); await click(trigger);
    expect(gallery()).not.toBeNull();
    expect(document.getElementById(gallery()!.getAttribute("aria-labelledby")!)?.textContent).toBe("Front-driver corner — photo gallery");
    expect(document.getElementById(gallery()!.getAttribute("aria-describedby")!)?.textContent).toContain("Photo 2 of 2");
    expect(gallery()!.querySelector("img")?.getAttribute("src")).toBe("/api/rental-handoff/files/asset/2");
    expect(galleryButton("Next photo").disabled).toBe(true);
    await click(galleryButton("Previous photo"));
    expect(gallery()!.querySelector("img")?.getAttribute("src")).toBe("/api/rental-handoff/files/asset/1");
    expect(galleryButton("Previous photo").disabled).toBe(true);
    await click(galleryButton("Next photo"));
    expect(gallery()!.querySelector("img")?.getAttribute("src")).toBe("/api/rental-handoff/files/asset/2");
    expect(gallery()!.innerHTML).not.toMatch(/https?:|storageKey|s3/i);
    await click(galleryButton("Close photo gallery"));
    expect(gallery()).toBeNull();
    await act(async () => { await vi.waitFor(() => expect(document.activeElement).toBe(trigger)); });
  });
  it("lets staff inspect locked evidence, closes safely with Escape, and uses a responsive contained image", async () => {
    await mount(true);
    const trigger = galleryButton("Expand photo: Front-driver corner");
    expect(trigger.disabled).toBe(false);trigger.focus();await click(trigger);
    expect(gallery()!.className).toContain("max-h-[90dvh]");
    expect(gallery()!.querySelector("img")?.className).toContain("object-contain");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(gallery()).toBeNull();
    await act(async () => { await vi.waitFor(() => expect(document.activeElement).toBe(trigger)); });
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="file"]')].every(input => input.disabled)).toBe(true);
  });
});
