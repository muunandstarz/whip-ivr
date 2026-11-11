// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoRentals } from "./DemoRentals";

let node: HTMLDivElement, root: Root;
beforeEach(() => { (globalThis as any).React = React; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; node = document.createElement("div"); document.body.append(node); root = createRoot(node); act(() => root.render(React.createElement(DemoRentals))); });
afterEach(() => { act(() => root.unmount()); node.remove(); vi.restoreAllMocks(); });
const button = (label: string) => Array.from(node.querySelectorAll("button")).find(b => b.textContent === label)!;
const click = (label: string) => act(() => button(label).click());

describe("Isolated rental demonstrations", () => {
  it("has exactly the two requested fictional scenarios and an explicit no-delivery boundary", () => {
    expect(button("Open awaiting-pickup demo")).toBeTruthy(); expect(button("Open completed demo")).toBeTruthy();
    expect(node.textContent).toContain("Nothing here can email, text, charge a card");
  });
  it("keeps unmeasured pickup and return readings blank in the pending scenario", () => {
    click("Open awaiting-pickup demo"); expect(node.textContent).toContain("To be assigned at pickup by Total Recon");
    click("Pickup"); expect(node.textContent).toContain("Must be measured at pickup"); expect(node.querySelectorAll(".r-demo-gallery button")).toHaveLength(0);
    click("Return"); expect(node.textContent).toContain("No return reading, return photos or return signatures are pre-filled");
  });
  it("loads simulated pickup locally and resets without making any network mutation", () => {
    const fetch = vi.spyOn(globalThis, "fetch"); click("Open awaiting-pickup demo"); click("Pickup"); click("Load simulated pickup evidence");
    expect(node.querySelectorAll(".r-demo-gallery button")).toHaveLength(11); expect(fetch).not.toHaveBeenCalled();
    click("Back to demo rentals"); click("Open awaiting-pickup demo"); click("Pickup"); expect(node.querySelectorAll(".r-demo-gallery button")).toHaveLength(0);
  });
  it("shows eleven dedicated views in each phase and the matching mileage delta", () => {
    click("Open completed demo"); click("Pickup"); expect(node.querySelectorAll(".r-demo-gallery button")).toHaveLength(11);
    click("Return"); expect(node.querySelectorAll(".r-demo-gallery button")).toHaveLength(11); expect(node.textContent).toContain("124 miles");
    expect(node.textContent).toContain("42,610 miles"); expect(node.textContent).toContain("42,734 miles");
    expect(Array.from(node.querySelectorAll('input[type="radio"]')).every(e => (e as HTMLInputElement).disabled)).toBe(true);
  });
  it("enlarges fictional evidence and closes on Escape without leaving the review", () => {
    click("Open completed demo"); click("Return"); act(() => (node.querySelector('.r-demo-gallery button') as HTMLButtonElement).click());
    expect(node.querySelector('[role="dialog"]')).toBeTruthy(); act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(node.querySelector('[role="dialog"]')).toBeNull(); expect(node.textContent).toContain("124 miles");
  });
  it("separates renter-safe packet samples from the private Claims-review and unissued leadership draft", () => {
    click("Open completed demo"); click("Packets"); expect(node.querySelectorAll(".r-demo-documents > div")).toHaveLength(4);
    expect(node.textContent).toContain("separate fictional private appendix"); expect(node.textContent).toContain("minimal additions review");
    act(() => (node.querySelector('.r-demo-documents button') as HTMLButtonElement).click()); expect(node.querySelector("iframe")?.title).toContain("Fictional");
    for (const a of node.querySelectorAll('.r-demo-documents a')) expect(a.getAttribute("href")).toMatch(/^\/manus-storage\//);
  });
});
