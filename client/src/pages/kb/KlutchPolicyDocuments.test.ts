// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ loading: true, preview: false, install: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/components/WhipLayout", () => ({ default: ({ children }: any) => h.loading ? null : children }));
vi.mock("@/contexts/ImpersonationContext", () => ({ useImpersonation: () => ({ isImpersonating: h.preview }) }));
vi.mock("@/lib/klutchPdfExport", () => ({ installKlutchPdfBridge: (frame: HTMLIFrameElement) => { h.install(frame); return h.cleanup; } }));
import KlutchPolicyDocuments from "./KlutchPolicyDocuments";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  if ((window as any).happyDOM) (window as any).happyDOM.settings.disableIframePageLoading = true;
  h.loading = true; h.preview = false; h.install.mockClear(); h.cleanup.mockClear();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("Klutch PDF bridge authentication lifecycle", () => {
  it("does not install against a missing iframe during initial login loading", async () => {
    await act(async () => root.render(React.createElement(KlutchPolicyDocuments)));
    expect(host.querySelector("iframe")).toBeNull(); expect(h.install).not.toHaveBeenCalled();
  });
  it("installs when the real iframe appears after loading finishes", async () => {
    await act(async () => root.render(React.createElement(KlutchPolicyDocuments))); h.loading = false;
    await act(async () => root.render(React.createElement(KlutchPolicyDocuments)));
    expect(h.install).toHaveBeenCalledTimes(1); expect(h.install).toHaveBeenCalledWith(host.querySelector('iframe[title="Klutch Policy Documents"]'));
  });
  it("disposes the previous listener when authenticated content disappears", async () => {
    h.loading = false; await act(async () => root.render(React.createElement(KlutchPolicyDocuments))); expect(h.install).toHaveBeenCalledOnce();
    h.loading = true; await act(async () => root.render(React.createElement(KlutchPolicyDocuments))); expect(h.cleanup).toHaveBeenCalledOnce();
  });
  it("refreshes owner permissions on both entry and exit from handler preview", async () => {
    h.loading = false; await act(async () => root.render(React.createElement(KlutchPolicyDocuments)));
    const frame = host.querySelector("iframe")!; const message = vi.fn();
    Object.defineProperty(frame, "contentWindow", { configurable: true, value: { postMessage: message } });
    h.preview = true; await act(async () => root.render(React.createElement(KlutchPolicyDocuments)));
    expect(message).toHaveBeenCalledWith({ type: "klutch-permission-refresh" }, window.location.origin);
    h.preview = false; await act(async () => root.render(React.createElement(KlutchPolicyDocuments)));
    expect(message).toHaveBeenCalledTimes(2); expect(h.install).toHaveBeenCalledTimes(1);
  });
});
