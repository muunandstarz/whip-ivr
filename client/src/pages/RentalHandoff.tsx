import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  Car,
  FileText,
  LayoutList,
  Settings2,
  Moon,
  Sun,
  Menu,
  LogOut,
  Plus,
  Search,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { createReceiptRequestKey } from "@/lib/receiptBrowser";
import {
  emptyRentalDraft,
  handoffMissing,
  type RentalDraft,
} from "@shared/rentalHandoff";
import {
  Card,
  Empty,
  ErrorNotice,
  Field,
  PacketLinks,
  dateDisplay,
  errorMessage,
} from "@/components/rental/Controls";
import {
  Details,
  Pickup,
  Protection,
  Signatures,
  Summary,
  hasExplicitReturnTime,
  rentalDateDisplay,
  type ManualRentalVehicle,
  type UploadRentalSupport,
} from "@/components/rental/Steps";
import { Admin } from "@/components/rental/Admin";
import { ReturnFlow } from "@/components/rental/ReturnFlow";
import { useRentalAutosave } from "@/components/rental/useRentalAutosave";
import type { UploadAsset } from "@/components/rental/Media";
import type {
  RentalRecord,
  RentalSession,
  RentalRow,
} from "@/components/rental/types";
import "@/components/rental/rental.css";

type View = "Rentals" | "Vehicles" | "Documents" | "Settings";
const RENTAL_LOGO = "/manus-storage/metrocars-leasing-original_0b89b3d7.webp";
const stepNames = [
  "Details",
  "Vehicle & pickup",
  "Protection",
  "Signatures",
  "Packet",
];
export default function RentalHandoff() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ id: string }>("/rental-handoff/:id");
  const id = params?.id ? Number(params.id) : 0;
  const session = trpc.rentalHandoff.session.useQuery(undefined, {
    retry: false,
  });
  const signOut = trpc.rentalHandoff.signOut.useMutation();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<View>(() => params?.id === "admin" ? "Settings" : "Rentals");
  const [mobileNav, setMobileNav] = useState(false);
  const [newRental, setNewRental] = useState(false);
  const [error, setError] = useState("");
  const data = session.data as RentalSession | undefined;
  const move = (next: View) => {
    setView(next);
    setMobileNav(false);
    setNewRental(false);
    navigate("/rental-handoff");
  };
  const logout = async () => {
    try {
      await signOut.mutateAsync();
      await session.refetch();
      navigate("/rental-handoff");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className={`rental-app ${theme === "dark" ? "r-dark" : ""}`}>
      <aside className={`r-sidebar ${mobileNav ? "r-mobile-open" : ""}`}>
        <a
          className="r-wordmark"
          href="/rental-handoff"
          onClick={e => {
            e.preventDefault();
            move("Rentals");
          }}
        >
          <img src={RENTAL_LOGO} alt="MetroCars Leasing" />
        </a>
        <p className="r-nav-label">RENTAL OPERATIONS</p>
        <nav aria-label="Rental navigation">
          {(
            [
              ["Rentals", LayoutList],
              ["Vehicles", Car],
              ["Documents", FileText],
              ...(data?.actor?.role === "admin"
                ? [["Settings", Settings2]]
                : []),
            ] as [View, typeof Car][]
          ).map(([name, Icon]) => (
            <button
              type="button"
              key={name}
              className={view === name ? "r-nav-active" : ""}
              onClick={() => move(name)}
            >
              <Icon size={19} />
              {name}
            </button>
          ))}
        </nav>
        <div className="r-sidebar-bottom">
          <div className="r-sidebar-note">
            <ShieldCheck size={18} />
            <p>
              Secure rental records
              <br />
              <span>Metrocars Leasing Corp.</span>
            </p>
          </div>
          {data?.actor && (
            <div className="r-user">
              <span className="r-avatar">
                {data.actor.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{data.actor.name}</strong>
                <small>
                  {data.actor.role === "shop"
                    ? "Shop staff"
                    : data.actor.role === "admin"
                      ? "Administrator"
                      : "Claims team"}
                </small>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="r-workspace">
        <header className="r-topbar">
          <button
            type="button"
            className="r-icon-button r-menu"
            aria-label="Toggle rental navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={21} />
          </button>
          <a
            className="r-mobile-brand"
            href="/rental-handoff"
            onClick={e => {
              e.preventDefault();
              move("Rentals");
            }}
          >
            <img src={RENTAL_LOGO} alt="MetroCars Leasing" />
          </a>
          <span className="r-topbar-label">
            Rental operations{" "}
            <span>/ {id || newRental ? "Handoff" : view}</span>
          </span>
          <div className="r-actions">
            <button
              type="button"
              className="r-icon-button"
              aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            {data?.actor?.role === "shop" && (
              <button
                type="button"
                className="r-icon-button"
                aria-label="Sign out"
                disabled={signOut.isPending}
                onClick={() => void logout()}
              >
                <LogOut size={19} />
              </button>
            )}
          </div>
        </header>
        <main className="r-main">
          <ErrorNotice message={error} />
          {data?.actor && <SharedSenderStatus session={data} />}
          {session.isLoading ? (
            <div className="r-loading" role="status">
              Loading secure rental session…
            </div>
          ) : session.error ? (
            <Card title="Unable to load rental session">
              <ErrorNotice message={session.error.message} />
              <button
                type="button"
                className="r-button"
                onClick={() => void session.refetch()}
              >
                Try again
              </button>
            </Card>
          ) : !data?.actor ? (
            <ShopLogin
              onAuthenticated={async () => {
                await session.refetch();
              }}
            />
          ) : id ? (
            <ExistingRental
              key={id}
              id={id}
              session={data}
              onHome={() => move("Rentals")}
            />
          ) : newRental ? (
            <NewRental
              session={data}
              onCreated={async createdId => {
                await session.refetch();
                setNewRental(false);
                navigate(`/rental-handoff/${createdId}`);
              }}
              onCancel={() => setNewRental(false)}
            />
          ) : view === "Vehicles" ? (
            <Fleet session={data} onAdmin={() => move("Settings")} />
          ) : view === "Settings" && data.actor.role === "admin" ? (
            <Admin
              locations={data.locations}
              vehicles={data.vehicles}
              settings={data.settings}
              refresh={() => session.refetch()}
            />
          ) : (
            <RentalList
              session={data}
              documents={view === "Documents"}
              onNew={() => setNewRental(true)}
              onOpen={rentalId => navigate(`/rental-handoff/${rentalId}`)}
            />
          )}
        </main>
        <footer className="r-legal">
          Metrocars Leasing Corp. · Private rental operations
        </footer>
      </div>
    </div>
  );
}
function SharedSenderStatus({ session }: { session: RentalSession }) {
  const ready = session.sender
    ? session.sender.configured === true && session.sender.connected
    : session.settings.emailProviderReady === true &&
      !!session.settings.senderEmail;
  return (
    <div
      className={`r-sender-status ${ready ? "" : "r-sender-pending"}`}
      role="status"
    >
      <Mail size={15} aria-hidden="true" />
      <span>
        {ready
          ? "Packet copies go to renter + claim email"
          : "Shared email is not configured."}
        {!ready && (
          <small>
            {session.actor?.role === "admin"
              ? " Administrator: arrange shared sender setup before packet delivery."
              : " Ask your rental administrator to set up packet delivery."}
          </small>
        )}
      </span>
    </div>
  );
}
function ShopLogin({
  onAuthenticated,
}: {
  onAuthenticated: () => Promise<void>;
}) {
  const signIn = trpc.rentalHandoff.signIn.useMutation();
  const activate = trpc.rentalHandoff.activate.useMutation();
  const [token, setToken] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("activate") ||
      new URLSearchParams(window.location.search).get("activate") ||
      ""
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (token) window.history.replaceState({}, "", "/rental-handoff");
  }, [token]);
  const submit = async () => {
    setError("");
    try {
      if (token) {
        if (password !== confirm)
          throw new Error("The passwords do not match.");
        await activate.mutateAsync({ token, password });
        window.history.replaceState({}, "", "/rental-handoff");
        setToken("");
      } else await signIn.mutateAsync({ email, password });
      setPassword("");
      setConfirm("");
      await onAuthenticated();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="r-login">
      <div className="r-page-heading">
        <div>
          <div className="r-login-brand">
            <img src={RENTAL_LOGO} alt="MetroCars Leasing" />
          </div>
          <h1>
            {token
              ? "Activate your shop account"
              : "Welcome to rental operations"}
          </h1>
          <p>Secure access for the people handling each handoff.</p>
        </div>
      </div>
      <Card
        title={token ? "Create your password" : "Shop sign-in"}
        detail={
          token
            ? "This private invitation belongs to one individual. Use a unique password with at least 12 characters."
            : "Use your individually invited shop account. No separate platform account is required."
        }
      >
        <form
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <ErrorNotice message={error} />
          {!token && (
            <Field
              label="Work email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          )}
          <Field
            label="Password"
            type="password"
            required
            minLength={token ? 12 : undefined}
            autoComplete={token ? "new-password" : "current-password"}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {token && (
            <Field
              label="Confirm password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
          )}
          <button
            type="submit"
            className="r-button r-primary"
            disabled={signIn.isPending || activate.isPending}
          >
            {signIn.isPending || activate.isPending
              ? "Signing in…"
              : token
                ? "Activate account"
                : "Sign in"}
          </button>
        </form>
        <div className="r-login-divider">Claims team</div>
        <button
          type="button"
          className="r-button"
          onClick={() => {
            try {
              window.location.href = getLoginUrl();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Claims sign-in
        </button>
        {!token && (
          <p className="r-guidance">
            Need access or a password reset? Ask your rental administrator for
            individual account assistance.
          </p>
        )}
      </Card>
    </div>
  );
}
function RentalList({
  session,
  documents,
  onNew,
  onOpen,
}: {
  session: RentalSession;
  documents: boolean;
  onNew: () => void;
  onOpen: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const records = trpc.rentalHandoff.list.useQuery({
    search,
    ...(status ? { status: status as RentalRow["status"] } : {}),
  });
  const rows = ((records.data || []) as RentalRow[]).filter(
    row => !documents || row.status !== "Scheduled"
  );
  return (
    <>
      <div className="r-page-heading">
        <div>
          <p className="r-eyebrow">RENTAL OPERATIONS</p>
          <h1>{documents ? "Rental documents" : "Rentals"}</h1>
          <p>
            {documents
              ? "Find a rental to view, print, download or resend its saved packets."
              : "Schedule rentals and keep every handoff moving."}
          </p>
        </div>
        {!documents && session.actor?.role !== "shop" && (
          <button type="button" className="r-button r-primary" onClick={onNew}>
            <Plus size={18} />
            New rental
          </button>
        )}
      </div>
      {session.launchGaps.length > 0 && (
        <div className="r-launch-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Launch setup is still pending</strong>
            <p>{session.launchGaps.join(" ")}</p>
            <small>
              Draft preparation is available. Handoff completion remains
              blocked.
            </small>
          </div>
        </div>
      )}
      <Card title={documents ? "Saved rental packets" : "All rentals"}>
        <div className="r-search">
          <Search size={19} />
          <input
            aria-label="Search rentals"
            placeholder="Search renter, claim, plate or last six of either VIN"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="r-filters" aria-label="Rental status filter">
          {["", "Scheduled", "Out", "Returned", "Closed"].map(value => (
            <button
              type="button"
              key={value}
              aria-pressed={status === value}
              className={`r-chip ${status === value ? "r-chip-active" : ""}`}
              onClick={() => setStatus(value)}
            >
              {value || "All statuses"}
            </button>
          ))}
        </div>
        <ErrorNotice message={records.error?.message} />
        {records.isLoading ? (
          <p role="status">Loading rentals…</p>
        ) : !rows.length ? (
          <Empty
            title={
              search || status
                ? "No matching rentals"
                : documents
                  ? "No completed packets yet"
                  : "No rentals yet"
            }
          >
            {search || status
              ? "Try a different name, claim number or last six VIN digits."
              : session.actor?.role === "shop"
                ? "Claims will schedule rentals for your assigned locations. Only your location’s records are shown."
                : "Create a rental using a real location and available vehicle. If inventory is empty, ask an administrator to configure it first."}
          </Empty>
        ) : (
          <div className="r-rental-list">
            {rows.map(row => {
              const v = session.vehicles.find(v => v.id === row.vehicleId);
              return (
                <button
                  type="button"
                  className="r-rental-row"
                  key={row.id}
                  onClick={() => onOpen(row.id)}
                >
                  <div className="r-row-name">
                    <span className="r-avatar">
                      <Car size={20} />
                    </span>
                    <div>
                      <strong>{row.draft.renterName}</strong>
                      <span>
                        Claim {row.draft.claimNumber || "Not entered"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <strong>{v?.ymm || "Vehicle not assigned"}</strong>
                    <span>
                      Rental VIN …{v?.vin.slice(-6) || "—"} · {v?.plate || "—"}
                    </span>
                    <span>
                      Renter VIN …{row.draft.renterVehicleVin.slice(-6) || "—"}
                    </span>
                  </div>
                  <div>
                    <strong>
                      {session.locations.find(l => l.id === row.locationId)
                        ?.name || "No location"}
                    </strong>
                    <span>{dateDisplay(row.draft.scheduledPickup)}</span>
                  </div>
                  <div>
                    <span
                      className={`r-status r-status-${row.status.toLowerCase()}`}
                    >
                      {row.status}
                    </span>
                    <span>
                      {row.draft.election
                        ? `Option ${row.draft.election}`
                        : "Protection pending"}
                    </span>
                  </div>
                  <ArrowRight size={18} />
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
function Fleet({
  session,
  onAdmin,
}: {
  session: RentalSession;
  onAdmin: () => void;
}) {
  return (
    <>
      <div className="r-page-heading">
        <div>
          <p className="r-eyebrow">LIVE INVENTORY</p>
          <h1>Rental vehicles</h1>
          <p>Actual fleet availability at your accessible locations.</p>
        </div>
        {session.actor?.role === "admin" && (
          <button
            type="button"
            className="r-button r-primary"
            onClick={onAdmin}
          >
            <Plus size={18} />
            Manage inventory
          </button>
        )}
      </div>
      {!session.vehicles.length ? (
        <Card title="Vehicle inventory">
          <Empty title="No vehicles configured">
            An administrator must add real locations and vehicles in Settings
            before a rental can be scheduled.
          </Empty>
        </Card>
      ) : (
        <div className="r-fleet-grid">
          {session.vehicles.map(v => (
            <Card key={v.id} title={v.ymm}>
              <div className="r-fleet-car">
                <Car size={68} strokeWidth={1.25} />
              </div>
              <span
                className={`r-status ${v.status === "Out" ? "r-status-out" : "r-status-returned"}`}
              >
                {v.status}
              </span>
              <dl>
                <dt>Location</dt>
                <dd>
                  {session.locations.find(l => l.id === v.locationId)?.name ||
                    "—"}
                </dd>
                <dt>VIN</dt>
                <dd>{v.vin}</dd>
                <dt>Plate</dt>
                <dd>{v.plate}</dd>
                <dt>Last odometer</dt>
                <dd>{v.lastOdometer.toLocaleString()} mi</dd>
                {v.renterName && (
                  <>
                    <dt>Renter</dt>
                    <dd>{v.renterName}</dd>
                  </>
                )}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
function NewRental({
  session,
  onCreated,
  onCancel,
}: {
  session: RentalSession;
  onCreated: (id: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(emptyRentalDraft);
  const [vehicleMode, setVehicleMode] = useState<"inventory" | "manual">(
    "manual"
  );
  const [manualVehicle, setManualVehicle] = useState<ManualRentalVehicle>({
    ymm: "",
    vin: "",
    plate: "",
    lastOdometer: 0,
  });
  const [error, setError] = useState("");
  const create = trpc.rentalHandoff.create.useMutation();
  const vehicleReady =
    vehicleMode === "manual"
      ? /^(?:19|20)\d{2}\s+\S+\s+\S.*$/.test(manualVehicle.ymm.trim()) &&
        /^[A-HJ-NPR-Z0-9]{17}$/.test(manualVehicle.vin) &&
        !!manualVehicle.plate.trim() &&
        Number.isInteger(manualVehicle.lastOdometer) &&
        manualVehicle.lastOdometer >= 0 &&
        manualVehicle.lastOdometer <= 2000000
      : draft.vehicleId > 0;
  const ready =
    !!draft.renterName.trim() && draft.locationId > 0 && vehicleReady;
  return (
    <>
      <HandoffHeading draft={draft} session={session} />
      <Stepper step={1} onChange={() => {}} disabled />
      <div className="r-two-column">
        <div>
          <p className="r-guidance">
            New setup is not yet saved. Enter at least renter name, location and
            an available or manually entered vehicle, then select Schedule
            rental. All subsequent changes autosave.
          </p>
          <ErrorNotice message={error} />
          <Details
            draft={draft}
            update={next => {
              if (
                next.locationId !== draft.locationId &&
                !session.vehicles.some(
                  v =>
                    v.locationId === next.locationId && v.status === "Available"
                )
              )
                setVehicleMode("manual");
              setDraft(next);
            }}
            locations={session.locations}
            vehicles={session.vehicles}
            vehicleMode={vehicleMode}
            onVehicleModeChange={mode => {
              setVehicleMode(mode);
              if (mode === "manual") setDraft({ ...draft, vehicleId: 0 });
            }}
            manualVehicle={manualVehicle}
            onManualVehicleChange={setManualVehicle}
          />
        </div>
        <Summary
          draft={draft}
          locations={session.locations}
          vehicles={session.vehicles}
        />
      </div>
      <div className="r-sticky-footer">
        <span className="r-save-status">Not scheduled yet</span>
        <div className="r-actions">
          <button type="button" className="r-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="r-button r-primary"
            disabled={!ready || create.isPending}
            onClick={async () => {
              setError("");
              try {
                const result = await create.mutateAsync({
                  draft,
                  ...(vehicleMode === "manual"
                    ? { vehicle: manualVehicle }
                    : {}),
                });
                await onCreated(result.id);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {create.isPending ? "Scheduling…" : "Schedule rental"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
function ExistingRental({
  id,
  session,
  onHome,
}: {
  id: number;
  session: RentalSession;
  onHome: () => void;
}) {
  const record = trpc.rentalHandoff.get.useQuery({ id }, { retry: false });
  if (record.isLoading) return <p role="status">Loading rental…</p>;
  if (record.error || !record.data)
    return (
      <Card title="Rental unavailable">
        <ErrorNotice
          message={
            record.error?.message ||
            "This record is not available to your account."
          }
        />
        <button type="button" className="r-button" onClick={onHome}>
          Back to rentals
        </button>
      </Card>
    );
  return (
    <RentalEditor
      key={`${id}-${record.data.activePacketId || "draft"}-${record.data.status}`}
      record={record.data as RentalRecord}
      session={session}
      refresh={() => record.refetch()}
      onHome={onHome}
    />
  );
}
function RentalEditor({
  record,
  session,
  refresh,
  onHome,
}: {
  record: RentalRecord;
  session: RentalSession;
  refresh: () => Promise<unknown>;
  onHome: () => void;
}) {
  const save = trpc.rentalHandoff.save.useMutation();
  const uploadMutation = trpc.rentalHandoff.upload.useMutation();
  const supportMutation = trpc.rentalHandoff.uploadSupport.useMutation();
  const complete = trpc.rentalHandoff.complete.useMutation();
  const version = trpc.rentalHandoff.newVersion.useMutation();
  const locked =
    !!(record.status === "Out" && record.activePacketId) ||
    record.status === "Returned" ||
    record.status === "Closed";
  const autosave = useRentalAutosave({
    id: record.id,
    initialDraft: record.draft,
    initialRevision: record.revision,
    locked,
    save: async input => {
      const result = await save.mutateAsync(input);
      await refresh();
      return result;
    },
  });
  const [step, setStep] = useState(
    session.actor?.role === "shop" && !locked ? 2 : locked ? 5 : 1
  );
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [localAssetCutoff, setLocalAssetCutoff] = useState(0);
  const requestId = useRef<string | null>(null);
  const d = autosave.draft;
  const returnTimeState = useRef(hasExplicitReturnTime(
    record.draft,
    session.locations.find(l => l.id === record.draft.locationId)?.timezone || "America/New_York"
  ));
  const assetCutoff = Math.max(
    localAssetCutoff,
    0,
    ...record.audit
      .filter(event =>
        ["version.open", "signature.invalidate"].includes(event.action || "")
      )
      .map(event =>
        Number(
          (event.detail as { assetCutoffId?: number } | undefined)
            ?.assetCutoffId || 0
        )
      )
  );
  const currentAssets = record.assets.filter(
    asset =>
      !(
        (asset.kind.endsWith("Signature") ||
          ["signedPayment", "coverageConfirmation"].includes(asset.kind)) &&
        asset.id <= assetCutoff
      )
  );
  const missing = handoffMissing(
    d,
    currentAssets,
    Date.now(),
    session.locations.find(l => l.id === d.locationId)?.timezone ||
      "America/New_York",
    session.settings.forceInkForRenter || false
  );
  const change = (next: RentalDraft) => {
    requestId.current = null;
    const materiallyChanged = Object.keys(next).some(
      key =>
        !["staffNote", "claimEmail"].includes(key) &&
        JSON.stringify(next[key as keyof RentalDraft]) !==
          JSON.stringify(d[key as keyof RentalDraft])
    );
    if (
      materiallyChanged &&
      record.assets.some(
        asset =>
          asset.kind.endsWith("Signature") || asset.kind === "signedPayment"
      )
    )
      setLocalAssetCutoff(Math.max(0, ...record.assets.map(asset => asset.id)));
    autosave.update(next);
  };
  const upload: UploadAsset = async (kind, base64, signerName) => {
    if (!locked || kind.startsWith("return")) {
      if (!locked) await autosave.flush();
      await uploadMutation.mutateAsync({
        id: record.id,
        kind,
        base64,
        ...(signerName
          ? { signerName }
          : kind === "signedPayment"
            ? { signerName: d.payment.cardholderName }
            : kind === "coverageConfirmation"
              ? { signerName: d.insurance.verifiedBy }
              : {}),
      });
      await refresh();
    }
  };
  const uploadSupport: UploadRentalSupport = async (kind, base64, fileName) => {
    if (["Returned", "Closed"].includes(record.status)) return;
    if (!locked) await autosave.flush();
    await supportMutation.mutateAsync({
      id: record.id,
      kind,
      base64,
      fileName,
    });
    await refresh();
  };
  const props = {
    draft: d,
    update: change,
    disabled: locked || busy,
    locations: session.locations,
    vehicles: session.vehicles,
    assets: currentAssets,
    forceInkForRenter: session.settings.forceInkForRenter || false,
    upload,
    returnTimeState,
  };
  const move = async (target: number) => {
    if (target === step) return;
    setError("");
    try {
      if (!locked) await autosave.flush();
      setStep(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const done = async () => {
    setBusy(true);
    setError("");
    try {
      const revision = await autosave.flush();
      requestId.current ||= createReceiptRequestKey();
      const result = await complete.mutateAsync({
        id: record.id,
        revision,
        requestId: requestId.current,
      });
      setNotice(
        `Packet saved and locked. Email delivery: ${result.emailStatus}.`
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (returning)
    return (
      <ReturnFlow
        record={record}
        session={session}
        upload={upload}
        refresh={refresh}
        onBack={() => setReturning(false)}
      />
    );
  return (
    <>
      <HandoffHeading draft={d} session={session} />
      <div className="r-handoff-meta">
        <span className={`r-status r-status-${record.status.toLowerCase()}`}>
          {record.status}
        </span>
        <span>
          Rental #{record.id} · Revision {autosave.revision.current}
        </span>
        <button
          type="button"
          className="r-text-button"
          onClick={async () => {
            try {
              if (!locked) await autosave.flush();
              onHome();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Back to rentals
        </button>
      </div>
      <Stepper step={step} onChange={target => void move(target)} />
      <ErrorNotice message={error} />
      <ErrorNotice message={autosave.error} />
      {autosave.state === "conflict" && (
        <div className="r-actions">
          <p>
            Another user changed this record. Your local edits have not
            overwritten their changes. Reload the latest record before editing
            again.
          </p>
          <button
            type="button"
            className="r-button"
            onClick={() => {
              if (
                window.confirm(
                  "Discard your unsaved local edits and reload the latest record?"
                )
              )
                window.location.reload();
            }}
          >
            Reload latest record
          </button>
        </div>
      )}
      {autosave.state === "error" && (
        <button
          type="button"
          className="r-button"
          onClick={() => void autosave.retry().catch(() => {})}
        >
          Retry saving draft
        </button>
      )}
      {notice && (
        <p className="r-success" role="status">
          {notice}
        </p>
      )}
      {locked && (
        <div className="r-lock-note">
          <ShieldCheck size={19} />
          <p>
            The signed record is locked. Original packets are never overwritten.
            {session.actor?.role !== "shop" && record.status === "Out"
              ? " To correct it, open an audited replacement version below."
              : ""}
          </p>
        </div>
      )}
      <div className="r-two-column">
        <div className="r-form-stack">
          {step === 1 && (
            <Details
              {...props}
              disabled={locked || busy || session.actor?.role === "shop"}
              supportAssets={record.assets}
              uploadSupport={uploadSupport}
              supportDisabled={
                busy || ["Returned", "Closed"].includes(record.status)
              }
            />
          )}
          {step === 2 && <Pickup {...props} />}
          {step === 3 && <Protection {...props} />}
          {step === 4 && <Signatures {...props} />}
          {step === 5 && (
            <>
              <Card
                title="Handoff readiness"
                detail="Every required item is checked before the signed packet can be issued."
              >
                {locked ? (
                  <p className="r-success">
                    <CheckCircle2 size={18} />
                    The packet is saved. Use the existing PDF actions below.
                  </p>
                ) : (
                  <>
                    {missing.length ? (
                      <ul className="r-missing">
                        {missing.map((item, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => void move(item.step)}
                            >
                              Step {item.step} · {item.message}
                              <ArrowRight size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="r-success">
                        Required handoff fields and evidence are ready.
                      </p>
                    )}
                    {session.launchGaps.length > 0 && (
                      <div className="r-launch-note">
                        <div>
                          <strong>Administrator launch requirements</strong>
                          <ul>
                            {session.launchGaps.map(gap => (
                              <li key={gap}>{gap}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      className="r-button r-primary"
                      disabled={
                        busy ||
                        !!missing.length ||
                        !!session.launchGaps.length ||
                        autosave.state === "conflict" ||
                        autosave.state === "error"
                      }
                      onClick={() => void done()}
                    >
                      {busy
                        ? "Issuing packet…"
                        : "Complete handoff & email packet"}
                    </button>
                    <p className="r-guidance">
                      Completion saves and locks the signed packet, generates
                      the printable PDF and attempts actual email delivery. A
                      failed email does not unlock or regenerate the packet.
                    </p>
                  </>
                )}
              </Card>
              <PacketHistory record={record} refresh={refresh} />
              {record.status === "Out" && record.activePacketId && (
                <Card title="Process vehicle return">
                  <p>
                    Compare pickup and return values, capture return evidence
                    and generate the return copy.
                  </p>
                  <button
                    type="button"
                    className="r-button r-primary"
                    onClick={() => setReturning(true)}
                  >
                    Start return
                    <ArrowRight size={16} />
                  </button>
                </Card>
              )}
              {["Returned", "Closed"].includes(record.status) && (
                <button
                  type="button"
                  className="r-button"
                  onClick={() => setReturning(true)}
                >
                  View return & charges
                </button>
              )}
              {record.status === "Out" &&
                record.activePacketId &&
                session.actor?.role !== "shop" && (
                  <Card
                    title="Create an audited correction"
                    detail="The original PDF is retained. Replacement versions require new signatures and evidence."
                  >
                    <Field
                      label="Reason for correction"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                    />
                    <button
                      type="button"
                      className="r-button"
                      disabled={busy || !reason.trim()}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await version.mutateAsync({
                            id: record.id,
                            revision: record.revision,
                            reason,
                          });
                          await refresh();
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Open replacement version
                    </button>
                  </Card>
                )}
              <AuditHistory record={record} />
            </>
          )}
        </div>
        <Summary
          draft={d}
          locations={session.locations}
          vehicles={session.vehicles}
        />
      </div>
      <div className="r-sticky-footer">
        <span
          className={`r-save-status ${autosave.state === "error" || autosave.state === "conflict" ? "r-save-error" : ""}`}
          role="status"
        >
          {locked
            ? "Signed packet locked"
            : {
                saved: "All changes saved",
                unsaved: "Unsaved changes…",
                saving: "Saving changes…",
                error: "Save failed — retry needed",
                conflict: "Save conflict — reload needed",
              }[autosave.state]}
        </span>
        <div className="r-actions">
          <button
            type="button"
            className="r-button"
            disabled={step === 1 || busy}
            onClick={() => void move(step - 1)}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          {step < 5 && (
            <button
              type="button"
              className="r-button r-primary"
              disabled={
                busy ||
                autosave.state === "conflict" ||
                autosave.state === "error"
              }
              onClick={() => void move(step + 1)}
            >
              Continue
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
function HandoffHeading({
  draft,
  session,
}: {
  draft: RentalDraft;
  session: RentalSession;
}) {
  const location = session.locations.find(l => l.id === draft.locationId);
  return (
    <div className="r-page-heading r-handoff-heading">
      <div>
        <h1>Rental handoff</h1>
        <p className="r-handoff-context">
          <strong>{draft.renterName || "New rental"}</strong>
          {" | "}Claim {draft.claimNumber || "not entered"}
          {" | "}
          {location?.name || "Choose pickup location"}
          {" | "}Pickup {rentalDateDisplay(draft.scheduledPickup, location?.timezone || "America/New_York")}
        </p>
      </div>
    </div>
  );
}
function Stepper({
  step,
  onChange,
  disabled = false,
}: {
  step: number;
  onChange: (step: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="r-stepper">
      <div className="r-mobile-progress">
        <span>
          Step {step} of 5 • {stepNames[step - 1]}
        </span>
        <progress max={5} value={step} aria-label="Rental handoff progress" />
      </div>
      <ol>
        {stepNames.map((name, i) => (
          <li
            key={name}
            className={
              i + 1 < step
                ? "r-step-done"
                : i + 1 === step
                  ? "r-step-current"
                  : ""
            }
          >
            <button
              type="button"
              aria-current={i + 1 === step ? "step" : undefined}
              aria-label={`Step ${i + 1} · ${name}`}
              disabled={disabled && i > 0}
              onClick={() => onChange(i + 1)}
            >
              <span>{i + 1 < step ? <CheckCircle2 size={18} /> : i + 1}</span>
              {name}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
function PacketHistory({
  record,
  refresh,
}: {
  record: RentalRecord;
  refresh: () => Promise<unknown>;
}) {
  const resend = trpc.rentalHandoff.resend.useMutation();
  const requests = useRef<Record<number, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const deliveryUncertain = record.emails.some(
    email =>
      /uncertain|pending/i.test(email.status) ||
      /uncertain|reconcile before resend/i.test(email.error || "")
  );
  return (
    <Card
      title="Saved packets & delivery"
      detail="View, print and download the already-issued version. These actions never create a new packet."
    >
      <ErrorNotice message={error} />
      {deliveryUncertain && (
        <div className="r-error" role="alert">
          A previous email delivery has an uncertain result. Ask your rental
          administrator to reconcile the delivery before requesting another
          send, to avoid duplicate emails.
        </div>
      )}
      {notice && (
        <p role="status" className="r-success">
          {notice}
        </p>
      )}
      {!record.packets.length ? (
        <Empty title="No packet issued yet">
          Complete the handoff to generate the signed rental packet.
        </Empty>
      ) : (
        record.packets.map(packet => (
          <div className="r-packet" key={packet.id}>
            <div>
              <strong>
                {packet.kind === "return" ? "Return copy" : "Pickup packet"} ·
                Version {packet.version}
              </strong>
              <p>{dateDisplay(packet.createdAt)}</p>
            </div>
            <PacketLinks url={packet.url} />
            <button
              type="button"
              className="r-button"
              disabled={resend.isPending || deliveryUncertain}
              onClick={async () => {
                setError("");
                try {
                  requests.current[packet.id] ||= createReceiptRequestKey();
                  const result = await resend.mutateAsync({
                    packetId: packet.id,
                    requestId: requests.current[packet.id],
                  });
                  if (result.status !== "pending")
                    delete requests.current[packet.id];
                  setNotice(`Email delivery: ${result.status}.`);
                  await refresh();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Resend email
            </button>
          </div>
        ))
      )}
      {record.emails.length > 0 && (
        <div className="r-email-log">
          <h3>Email delivery log</h3>
          {record.emails.map((email, i) => (
            <div key={email.id || i}>
              <span className={email.status === "sent" ? "r-teal" : ""}>
                {email.status}
              </span>
              {email.recipient && <span>{email.recipient}</span>}
              <span>{dateDisplay(email.sentAt || email.createdAt)}</span>
              {email.error && <span>{email.error}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
function AuditHistory({ record }: { record: RentalRecord }) {
  return (
    <Card title="Record audit log">
      <details>
        <summary>
          Show who changed this record and when ({record.audit.length})
        </summary>
        <div className="r-audit">
          {record.audit.map((event, i) => (
            <div key={event.id || i}>
              <strong>{event.action || event.what || "Record update"}</strong>
              <span>
                {event.actorName || event.actorKey || "Recorded user"} ·{" "}
                {dateDisplay(event.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
