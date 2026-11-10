// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableIframePageLoading":true}}}
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyRentalDraft,
  DEFAULT_RENTAL_RATES,
  type RentalDraft,
} from "@shared/rentalHandoff";
const mocks = vi.hoisted(() => ({
  session: {
    data: undefined as unknown,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  },
  list: { data: [] as unknown[], error: null, isLoading: false },
  get: {
    data: undefined as unknown,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  },
  save: vi.fn(),
  create: vi.fn(),
  complete: vi.fn(),
  signIn: vi.fn(),
  activate: vi.fn(),
  connectSender: vi.fn(),
  disconnectSender: vi.fn(),
  navigate: vi.fn(),
  routeId: "",
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    rentalHandoff: new Proxy(
      {},
      {
        get: (_, key: string) => ({
          useQuery: () =>
            key === "session"
              ? mocks.session
              : key === "list"
                ? mocks.list
                : key === "get"
                  ? mocks.get
                  : { data: [], isLoading: false, refetch: vi.fn() },
          useMutation: () => ({
            isPending: false,
            mutateAsync:
              (mocks as unknown as Record<string, unknown>)[key] ||
              vi.fn().mockResolvedValue({}),
          }),
        }),
      }
    ),
  },
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/rental-handoff", mocks.navigate],
  useRoute: () => [
    !!mocks.routeId,
    mocks.routeId ? { id: mocks.routeId } : null,
  ],
}));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
import RentalHandoff from "./RentalHandoff";
import { Protection, Signatures, Details } from "@/components/rental/Steps";
import { useRentalAutosave } from "@/components/rental/useRentalAutosave";
let root: Root;
let container: HTMLDivElement;
const settings = {
  counselApproved: false,
  registrationConfirmed: false,
  financialResponsibilityReference: "",
  omitFinancialReference: false,
  retentionYears: 7,
  senderEmail: "",
  emailProviderReady: false,
  rates: DEFAULT_RENTAL_RATES,
  rateVersion: 1,
};
const session = (role = "claims") => ({
  actor: { key: "test-actor", name: "Test staff", role, locationIds: [1] },
  settings,
  locations: [],
  vehicles: [],
  launchGaps: ["Launch approval pending"],
});
const button = (text: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b =>
    b.textContent?.includes(text)
  )!;
async function mount(component: React.ReactNode) {
  await act(async () => {
    root.render(component);
  });
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}
async function input(label: string, value: string) {
  const el = Array.from(container.querySelectorAll<HTMLLabelElement>("label"))
    .find(l => l.querySelector("span")?.textContent === label)
    ?.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.session.data = session();
  mocks.list.data = [];
  mocks.get.data = undefined;
  mocks.routeId = "";
  for (const fn of [
    mocks.save,
    mocks.create,
    mocks.complete,
    mocks.signIn,
    mocks.activate,
    mocks.connectSender,
    mocks.disconnectSender,
    mocks.navigate,
  ])
    fn.mockReset();
  mocks.save.mockResolvedValue({ revision: 2 });
  window.history.replaceState({}, "", "/rental-handoff");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Standalone MetroCars rental interface", () => {
  it("shows Gmail setup errors with the required OAuth callback URI", async () => {
    mocks.connectSender.mockRejectedValueOnce(
      Error("Gmail OAuth is not configured")
    );
    await mount(React.createElement(RentalHandoff));
    await click(button("Connect Gmail"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "not configured"
    );
    expect(container.textContent).toContain(
      "/api/rental-handoff/gmail/callback"
    );
  });
  it("exposes real administrative configuration only to an admin", async () => {
    mocks.session.data = session("admin");
    await mount(React.createElement(RentalHandoff));
    await click(button("Settings"));
    expect(container.textContent).toContain("No shop accounts yet");
    expect(button("Add location")).toBeDefined();
    expect(button("Add vehicle")).toBeDefined();
    expect(button("Create private invitation")).toBeDefined();
    expect(container.textContent).toContain("no automatic deletion");
  });
  it("opens an existing packet without issuing a replacement and blocks uncertain delivery retries", async () => {
    mocks.routeId = "7";
    mocks.get.data = {
      id: 7,
      status: "Out",
      revision: 2,
      activePacketId: 11,
      draft: emptyRentalDraft(),
      rates: DEFAULT_RENTAL_RATES,
      assets: [],
      packets: [
        {
          id: 11,
          kind: "pickup",
          version: 1,
          createdAt: Date.now(),
          url: "/api/rental-handoff/files/packet/11",
        },
      ],
      emails: [{ status: "uncertain", error: "Reconcile before resend" }],
      audit: [],
      returnData: null,
    };
    await mount(React.createElement(RentalHandoff));
    expect(button("Resend email").disabled).toBe(true);
    const pdf = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a")
    ).find(a => a.textContent?.includes("View PDF"))!;
    expect(pdf.getAttribute("href")).toBe(
      "/api/rental-handoff/files/packet/11"
    );
    expect(pdf.target).toBe("_blank");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("shows an honest empty state and pending launch requirements without seeded records", async () => {
    await mount(React.createElement(RentalHandoff));
    expect(container.textContent).toContain("MetroCars");
    expect(container.textContent).toContain("No rentals yet");
    expect(container.textContent).toContain("Launch approval pending");
    expect(button("New rental")).toBeDefined();
    expect(container.textContent).not.toMatch(
      /Klutch|Whip|self.insurance|risk retention/i
    );
  });
  it("allows Claims to schedule only after actual inventory selection", async () => {
    await mount(React.createElement(RentalHandoff));
    await click(button("New rental"));
    expect(button("Schedule rental").disabled).toBe(true);
    expect(container.textContent).toContain("No sample vehicles are supplied");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("hides create and settings from shop staff", async () => {
    mocks.session.data = session("shop");
    await mount(React.createElement(RentalHandoff));
    expect(button("New rental")).toBeUndefined();
    expect(button("Settings")).toBeUndefined();
    expect(container.textContent).toContain(
      "Only your location’s records are shown"
    );
  });
  it("offers invited-shop password sign-in and functional Claims sign-in", async () => {
    mocks.session.data = { actor: null };
    await mount(React.createElement(RentalHandoff));
    expect(button("Claims sign-in")).toBeDefined();
    await input("Work email", "individual@example.test");
    await input("Password", "secure-personal-password");
    mocks.signIn.mockResolvedValue({});
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "individual@example.test",
      password: "secure-personal-password",
    });
  });
  it("reads a private activation token from the URL and checks matching passwords", async () => {
    mocks.session.data = { actor: null };
    window.history.replaceState(
      {},
      "",
      "/rental-handoff?activate=private-token"
    );
    await mount(React.createElement(RentalHandoff));
    await input("Password", "different-password-a");
    await input("Confirm password", "different-password-b");
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "do not match"
    );
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("keeps Details read-only for a shop handoff and exposes actual read-only VIN", async () => {
    const d = {
      ...emptyRentalDraft(),
      renterName: "Actual renter",
      locationId: 1,
      vehicleId: 1,
    };
    await mount(
      React.createElement(Details, {
        draft: d,
        update: vi.fn(),
        disabled: true,
        locations: [
          {
            id: 1,
            name: "Real location",
            address: "Real address",
            phone: "5551234567",
            timezone: "America/New_York",
            active: true,
          },
        ],
        vehicles: [
          {
            id: 1,
            locationId: 1,
            ymm: "2025 Vehicle",
            vin: "1HGCM82633A004352",
            plate: "ACTUAL",
            lastOdometer: 100,
            status: "Available",
          },
        ],
      })
    );
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(container.textContent).toContain("1HGCM82633A004352");
  });
  it("keeps Complete disabled with missing evidence and links requirements to steps", async () => {
    mocks.routeId = "7";
    mocks.get.data = {
      id: 7,
      status: "Scheduled",
      revision: 1,
      activePacketId: null,
      draft: { ...emptyRentalDraft(), renterName: "Actual renter" },
      rates: DEFAULT_RENTAL_RATES,
      assets: [],
      packets: [],
      emails: [],
      audit: [],
      returnData: null,
    };
    await mount(React.createElement(RentalHandoff));
    await click(button("Packet"));
    expect(button("Complete handoff & email packet").disabled).toBe(true);
    expect(container.textContent).toContain("front condition photo");
    await click(button("Step 2"));
    expect(container.textContent).toContain("Pickup condition photos");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
describe("Protection and payment guardrails", () => {
  it("renders all source agreement sections and the accessible coverage table", async () => {
    await mount(
      React.createElement(Protection, {
        draft: emptyRentalDraft(),
        update: vi.fn(),
        assets: [],
        upload: vi.fn(),
        locations: [],
        vehicles: [],
      })
    );
    expect(container.querySelectorAll(".r-agreement-section")).toHaveLength(13);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(7);
    expect(container.textContent).toContain(
      "Return of the Rental Vehicle and general terms"
    );
  });
  it("permits the approved renter/cardholder electronic path but requires ink evidence for someone else or forced ink", async () => {
    const d = emptyRentalDraft();
    const props = {
      draft: d,
      update: vi.fn(),
      assets: [],
      upload: vi.fn(),
      locations: [],
      vehicles: [],
    };
    await mount(React.createElement(Signatures, props));
    expect(container.textContent).toContain(
      "electronic authorization is permitted"
    );
    expect(container.textContent).not.toContain(
      "Signed paper payment authorization scan"
    );
    await mount(
      React.createElement(Signatures, {
        ...props,
        draft: { ...d, payment: { ...d.payment, isRenter: false } },
      })
    );
    expect(container.textContent).toContain(
      "Signed paper payment authorization scan"
    );
    expect(container.textContent).toContain("Witness — full staff name");
    expect(container.textContent).toContain("may never sign electronically");
    await mount(
      React.createElement(Signatures, { ...props, forceInkForRenter: true })
    );
    expect(container.textContent).toContain(
      "Signed paper payment authorization scan"
    );
  });
  it("only enables Option B with no insurance AND no other liability", async () => {
    const d = emptyRentalDraft();
    const update = vi.fn();
    const props = {
      draft: d,
      update,
      assets: [],
      upload: vi.fn(),
      locations: [],
      vehicles: [],
    };
    await mount(React.createElement(Protection, props));
    let radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]'
    );
    expect([...radios].every(r => r.disabled)).toBe(true);
    await mount(
      React.createElement(Protection, {
        ...props,
        draft: { ...d, insurance: { ...d.insurance, noOtherLiability: true } },
      })
    );
    radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]'
    );
    expect(radios[0].disabled).toBe(true);
    expect(radios[1].disabled).toBe(false);
    expect(radios[2].disabled).toBe(true);
    expect(
      container.querySelector<HTMLAnchorElement>('a[href*="DRAFTv7"]')
    ).not.toBeNull();
  });
  it("rejects full card-number entry and strips non-digits from last four", async () => {
    const update = vi.fn();
    await mount(
      React.createElement(Signatures, {
        draft: emptyRentalDraft(),
        update,
        assets: [],
        upload: vi.fn(),
        locations: [],
        vehicles: [],
      })
    );
    const field = Array.from(container.querySelectorAll("label"))
      .find(l => l.textContent?.includes("Last four digits only"))!
      .querySelector("input")!;
    expect(field.maxLength).toBe(4);
    expect(field.pattern).toBe("[0-9]{4}");
    await input("Last four digits only", "12a34567890");
    expect(update.mock.calls.at(-1)?.[0].payment.lastFour).toBe("1234");
    expect(
      container.querySelector('input[autocomplete="cc-number"]')
    ).toBeNull();
    expect(container.querySelector('input[autocomplete="cc-csc"]')).toBeNull();
  });
});
function SaveHarness({ initial }: { initial: RentalDraft }) {
  const save = useRentalAutosave({
    id: 9,
    initialDraft: initial,
    initialRevision: 1,
    locked: false,
    save: mocks.save,
  });
  return React.createElement(
    "div",
    null,
    React.createElement("input", {
      "aria-label": "Draft name",
      value: save.draft.renterName,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        save.update({ ...save.draft, renterName: e.target.value }),
    }),
    React.createElement("span", { role: "status" }, save.state),
    React.createElement(
      "button",
      { onClick: () => void save.retry().catch(() => {}) },
      "Retry"
    ),
    React.createElement("p", null, save.error)
  );
}
async function changeDraft(value: string) {
  await act(async () => {
    const el = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("Revision-aware autosave", () => {
  it("debounces every change for 600ms and sends the latest revision", async () => {
    vi.useFakeTimers();
    mocks.save
      .mockResolvedValueOnce({ revision: 2 })
      .mockResolvedValueOnce({ revision: 3 });
    await mount(
      React.createElement(SaveHarness, { initial: emptyRentalDraft() })
    );
    await changeDraft("First name");
    await act(async () => {
      vi.advanceTimersByTime(599);
    });
    expect(mocks.save).not.toHaveBeenCalled();
    await changeDraft("Updated name");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        revision: 1,
        draft: expect.objectContaining({ renterName: "Updated name" }),
      })
    );
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "saved"
    );
    await changeDraft("Final name");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mocks.save.mock.calls.at(-1)?.[0].revision).toBe(2);
  });
  it("stops autosaving on revision conflict rather than overwriting someone else", async () => {
    vi.useFakeTimers();
    mocks.save.mockRejectedValueOnce(
      Object.assign(Error("Revision conflict: another user saved"), {
        data: { code: "CONFLICT" },
      })
    );
    await mount(
      React.createElement(SaveHarness, { initial: emptyRentalDraft() })
    );
    await changeDraft("Local edit");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "conflict"
    );
    await changeDraft("Another local edit");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("another user saved");
  });
  it("retains local edits after network failure and retries the same revision", async () => {
    vi.useFakeTimers();
    mocks.save
      .mockRejectedValueOnce(Error("Network unavailable"))
      .mockResolvedValueOnce({ revision: 2 });
    await mount(
      React.createElement(SaveHarness, { initial: emptyRentalDraft() })
    );
    await changeDraft("Keep this name");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "error"
    );
    expect(container.querySelector("input")?.value).toBe("Keep this name");
    await click(button("Retry"));
    expect(mocks.save.mock.calls[1][0].revision).toBe(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "saved"
    );
  });
});
