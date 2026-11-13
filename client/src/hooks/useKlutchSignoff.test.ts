// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KLUTCH_SIGNOFF_UNAVAILABLE, normalizeKlutchDocumentSignoff, useKlutchSignoff } from "./useKlutchSignoff";

const h = vi.hoisted(() => ({
  user: { id: 1, role: "admin", name: "Jasmine" } as { id: number; role: string; name: string } | null,
  loading: false,
  impersonating: null as { id: number; name: string } | null,
  query: { data: undefined, isFetching: false, isError: false, error: null } as any,
  refetch: vi.fn(), invalidate: vi.fn(), useQuery: vi.fn(),
}));
const utils = { klutchPolicies: { signoff: { invalidate: h.invalidate } } };
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: h.user, loading: h.loading }) }));
vi.mock("@/contexts/ImpersonationContext", () => ({ useImpersonation: () => ({ impersonating: h.impersonating }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => utils,
  klutchPolicies: { signoff: { useQuery: (...args: unknown[]) => { h.useQuery(...args); return { ...h.query, refetch: h.refetch }; } } },
} }));

let root: Root;
let host: HTMLDivElement;
let value: ReturnType<typeof useKlutchSignoff>;
let enabled = true;
function Probe() { value = useKlutchSignoff(enabled); return null; }
async function render() { await act(async () => root.render(React.createElement(Probe))); }
const approved = { name: "Morgan Ellis", title: "Liability Claims Specialist", revision: 1 };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); enabled = true;
  h.user = { id: 1, role: "admin", name: "Jasmine" }; h.loading = false; h.impersonating = null;
  h.query = { data: { signoff: approved, canEdit: true }, isFetching: false, isError: false, error: null };
  h.invalidate.mockResolvedValue(undefined);
  h.refetch.mockImplementation(async () => ({ data: h.query.data, error: h.query.error }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("approved Klutch sign-off query", () => {
  it("requests immediate/focus refresh and uses the approved name, not logged-in or preview identity", async () => {
    await render();
    expect(h.useQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ staleTime: 0, refetchOnWindowFocus: "always", refetchOnMount: "always", retry: false }));
    expect(value.signoff).toEqual(approved); expect(value.canEdit).toBe(true);
    h.impersonating = { id: 42, name: "Different Handler" }; await render();
    expect(h.invalidate).toHaveBeenCalledTimes(2); expect(value.signoff?.name).toBe("Morgan Ellis");
  });

  it("fails closed when loading, refetching, or when an approved query fails despite cached data", async () => {
    for (const state of [
      { data: undefined, isFetching: true, isError: false, error: null },
      { data: { signoff: approved, canEdit: true }, isFetching: true, isError: false, error: null },
      { data: { signoff: approved, canEdit: true }, isFetching: false, isError: true, error: new Error("Offline") },
    ]) {
      h.query = state; await render();
      expect(value.ready).toBe(false); expect(value.canEdit).toBe(false); expect(value.signoff).toBeUndefined();
      await expect(value.requireApprovedSignoff()).rejects.toThrow(KLUTCH_SIGNOFF_UNAVAILABLE);
    }
    expect(h.refetch).not.toHaveBeenCalled();
  });

  it("revalidates before output and returns the fresh shared revision", async () => {
    await render();
    const changed = { name: "Approved Replacement", title: "Approved Title", revision: 2 };
    h.refetch.mockResolvedValueOnce({ data: { signoff: changed, canEdit: true }, error: null });
    expect(await value.requireApprovedSignoff()).toEqual(changed);
    h.refetch.mockResolvedValueOnce({ data: h.query.data, error: new Error("Refetch failed") });
    await expect(value.requireApprovedSignoff()).rejects.toThrow(KLUTCH_SIGNOFF_UNAVAILABLE);
  });

  it("removes cached owner capability immediately until an identity/impersonation invalidation completes", async () => {
    await render();
    let complete!: () => void;
    h.invalidate.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    h.user = { id: 8, role: "admin", name: "Other Admin" }; await render();
    expect(value.ready).toBe(false); expect(value.canEdit).toBe(false);
    h.query.data = { signoff: approved, canEdit: false };
    await act(async () => complete()); await render();
    expect(value.ready).toBe(true); expect(value.canEdit).toBe(false);
    h.impersonating = { id: 10, name: "Handler" }; await render();
    h.impersonating = null; await render();
    expect(h.invalidate).toHaveBeenCalledTimes(4);
  });

  it("rejects in-flight output when identity changes, and blocks logout/disabled MetroCars mode", async () => {
    await render();
    let complete!: (value: any) => void;
    h.refetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const pending = value.requireApprovedSignoff();
    h.impersonating = { id: 12, name: "Preview" }; await render();
    complete({ data: { signoff: approved }, error: null });
    await expect(pending).rejects.toThrow(KLUTCH_SIGNOFF_UNAVAILABLE);
    h.user = null; await render(); expect(value.ready).toBe(false);
    h.user = { id: 1, role: "admin", name: "Jasmine" }; enabled = false; await render();
    expect(value.ready).toBe(false);
    expect(h.useQuery).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });
});

describe("Klutch document attribution normalization", () => {
  it("normalizes fresh, loaded, and reset drafts without touching MetroCars legal signature identity", () => {
    for (const draft of [
      { handlerName: "", handlerTitle: "", claimNumber: "Fresh" },
      { handlerName: "Legacy Handler", handlerTitle: "Legacy Title", claimNumber: "Loaded" },
      { handlerName: "Forged Owner", handlerTitle: "Per-document override", claimNumber: "Reset" },
    ]) {
      const legal = { ...draft, dopSignerName: "Actual MetroCars Signer", dopSignerTitle: "Fleet Manager", dopSignatureData: "retained-ink", dopSignatureAccepted: true };
      const normalized = normalizeKlutchDocumentSignoff(legal, approved);
      expect(normalized).toEqual({ ...legal, handlerName: approved.name, handlerTitle: approved.title });
      expect(normalizeKlutchDocumentSignoff(legal, undefined)).toEqual({ ...legal, handlerName: "", handlerTitle: "" });
      expect(legal.handlerName).toBe(draft.handlerName);
    }
  });
});
