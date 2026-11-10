// @vitest-environment happy-dom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FUEL_LEVELS } from "@shared/rentalHandoff";
import { FuelGauge, type FuelLevel } from "./FuelGauge";

let root: Root;
let container: HTMLDivElement;
const radios = () => [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
async function render(value: FuelLevel = "Full", onChange = vi.fn(), disabled = false) {
  await act(async () => root.render(React.createElement(FuelGauge, { label: "Fuel at pickup", value, onChange, disabled })));
  return onChange;
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("FuelGauge", () => {
  it("exposes exactly the five persisted values as labeled native radios in one named group", async () => {
    await render("1/2");
    expect(radios().map(r => r.value)).toEqual([...FUEL_LEVELS]);
    expect(new Set(radios().map(r => r.name)).size).toBe(1);
    expect(radios().filter(r => r.checked).map(r => r.value)).toEqual(["1/2"]);
    expect(container.querySelector("legend")?.textContent).toBe("Fuel at pickup");
    for (const radio of radios()) {
      expect(radio.tabIndex).toBe(0); // No custom tabindex blocks native arrow-key/Space behavior.
      expect(container.querySelector(`label[for="${CSS.escape(radio.id)}"]`)?.textContent).toBe(radio.value);
    }
    const fieldset = container.querySelector("fieldset")!;
    for (const id of fieldset.getAttribute("aria-describedby")!.split(" ")) expect(document.getElementById(id)).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([["Full", 100], ["3/4", 75], ["1/2", 50], ["1/4", 25], ["Empty", 0]] as const)(
    "shows %s and its %i%% numeric reading without changing the enum",
    async (value, percent) => {
      await render(value);
      expect(container.querySelector(".r-fuel-reading")?.textContent).toContain(`${value} · ${percent}%`);
      expect(radios().find(r => r.checked)?.value).toBe(value);
      expect(container.querySelector<SVGGElement>(".r-fuel-needle")?.style.getPropertyValue("--fuel-angle")).toBe(`${percent * 1.8 - 180}deg`);
    }
  );

  it("emits the exact value when selecting each option", async () => {
    const onChange = await render();
    for (const value of FUEL_LEVELS.filter(v => v !== "Full")) {
      await act(async () => radios().find(r => r.value === value)!.click());
      expect(onChange).toHaveBeenLastCalledWith(value);
    }
  });

  it("keeps independently mounted pickup and return groups separate", async () => {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(FuelGauge, { label: "Fuel at pickup", value: "Full", onChange: vi.fn() }),
      React.createElement(FuelGauge, { label: "Fuel at return", value: "Empty", onChange: vi.fn() })
    )));
    expect(new Set(radios().map(r => r.name)).size).toBe(2);
    expect(radios().filter(r => r.checked).map(r => r.value)).toEqual(["Full", "Empty"]);
    expect(new Set(radios().map(r => r.id)).size).toBe(10);
  });

  it("disables every native radio and preserves the selected reading when locked", async () => {
    const onChange = await render("1/4", vi.fn(), true);
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(radios().every(r => r.disabled)).toBe(true);
    await act(async () => radios()[0].click());
    expect(onChange).not.toHaveBeenCalled();
    expect(radios().find(r => r.checked)?.value).toBe("1/4");
  });

  it("uses rental theme tokens, minimum touch targets and high-contrast/reduced-motion rules", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/components/rental/FuelGauge.css"), "utf8");
    expect(css).toContain("var(--r-fg)");
    expect(css).toContain("var(--r-input)");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("min-height: 56px");
    expect(css).toContain(":has(input:focus-visible)");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("transition: none !important");
  });
});
