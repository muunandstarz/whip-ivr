import { useState } from "react";
import { Copy, Mail, Plus, Settings2, UserX } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ReminderSettings } from "./ReminderSettings";
import { SharedSenderForm } from "./SharedSenderForm";
import {
  DEFAULT_RENTAL_RATES,
  type LaunchSettings,
  type RentalLocation,
  type RentalVehicle,
} from "@shared/rentalHandoff";
import {
  Card,
  Check,
  ErrorNotice,
  Field,
  Select,
  Empty,
  errorMessage,
  dateDisplay,
} from "./Controls";
const blankLocation = () => ({
  name: "",
  address: "",
  phone: "",
  timezone: "America/New_York",
  active: true,
});
const blankVehicle = () => ({
  locationId: 0,
  ymm: "",
  vin: "",
  plate: "",
  lastOdometer: 0,
});
export function Admin({
  locations,
  vehicles,
  settings,
  refresh,
}: {
  locations: RentalLocation[];
  vehicles: RentalVehicle[];
  settings: LaunchSettings;
  refresh: () => Promise<unknown>;
}) {
  const saveLocation = trpc.rentalHandoff.saveLocation.useMutation();
  const saveVehicle = trpc.rentalHandoff.saveVehicle.useMutation();
  const saveSettings = trpc.rentalHandoff.saveSettings.useMutation();
  const invite = trpc.rentalHandoff.inviteShop.useMutation();
  const deactivate = trpc.rentalHandoff.deactivateShop.useMutation();
  const staff = trpc.rentalHandoff.listShop.useQuery();
  const [location, setLocation] = useState<
    ReturnType<typeof blankLocation> & { id?: number }
  >(blankLocation);
  const [vehicle, setVehicle] = useState<
    ReturnType<typeof blankVehicle> & { id?: number }
  >(blankVehicle);
  const [config, setConfig] = useState(settings);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [scope, setScope] = useState<number[]>([]);
  const [activation, setActivation] = useState<{
    link: string;
    expires: number | string | Date;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="r-admin">
      <div className="r-page-heading">
        <div>
          <p className="r-eyebrow">ADMINISTRATION</p>
          <h1>Rental settings</h1>
          <p>Manage real locations, vehicles and individual shop access.</p>
        </div>
        <Settings2 size={28} />
      </div>
      <ErrorNotice message={error} />
      {notice && (
        <p className="r-success" role="status">
          {notice}
        </p>
      )}
      <Card
        title="Locations"
        detail="Location phone numbers are printed for payment questions. Use the actual business address and time zone."
      >
        <div className="r-record-list">
          {locations.map(l => (
            <button
              type="button"
              className="r-list-button"
              key={l.id}
              onClick={() =>
                setLocation({
                  id: l.id,
                  name: l.name,
                  address: l.address,
                  phone: l.phone,
                  timezone: l.timezone,
                  active: l.active,
                })
              }
            >
              <strong>{l.name}</strong>
              <span>
                {l.address} · {l.phone} · {l.active ? "Active" : "Inactive"}
              </span>
            </button>
          ))}
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            void run(async () => {
              await saveLocation.mutateAsync(location);
              setLocation(blankLocation());
            }, "Location saved.");
          }}
        >
          <fieldset disabled={busy} className="r-grid">
            <Field
              label="Location name"
              required
              value={location.name}
              onChange={e => setLocation({ ...location, name: e.target.value })}
            />
            <Field
              label="Street address"
              required
              value={location.address}
              onChange={e =>
                setLocation({ ...location, address: e.target.value })
              }
            />
            <Field
              label="Location phone"
              required
              type="tel"
              value={location.phone}
              onChange={e =>
                setLocation({ ...location, phone: e.target.value })
              }
            />
            <Field
              label="IANA time zone"
              required
              value={location.timezone}
              onChange={e =>
                setLocation({ ...location, timezone: e.target.value })
              }
            />
            <Check
              label="Location is active"
              checked={location.active}
              onChange={active => setLocation({ ...location, active })}
            />
          </fieldset>
          <div className="r-actions">
            <button
              type="submit"
              className="r-button r-primary"
              disabled={busy}
            >
              {location.id ? "Save location" : "Add location"}
            </button>
            <button
              type="button"
              className="r-button"
              onClick={() => setLocation(blankLocation())}
            >
              New location
            </button>
          </div>
        </form>
      </Card>
      <Card
        title="Vehicle inventory"
        detail="New rentals add vehicles automatically. You can optionally manage saved vehicles here; no preloaded inventory is required."
      >
        <div className="r-record-list">
          {vehicles.map(v => (
            <button
              type="button"
              className="r-list-button"
              key={v.id}
              onClick={() =>
                setVehicle({
                  id: v.id,
                  locationId: v.locationId,
                  ymm: v.ymm,
                  vin: v.vin,
                  plate: v.plate,
                  lastOdometer: v.lastOdometer,
                })
              }
            >
              <strong>{v.ymm}</strong>
              <span>
                VIN {v.vin} · {v.plate} · {v.status}
              </span>
            </button>
          ))}
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            void run(async () => {
              await saveVehicle.mutateAsync(vehicle);
              setVehicle(blankVehicle());
            }, "Vehicle saved.");
          }}
        >
          <fieldset disabled={busy} className="r-grid">
            <Select
              label="Vehicle location"
              required
              value={vehicle.locationId || ""}
              onChange={e =>
                setVehicle({ ...vehicle, locationId: Number(e.target.value) })
              }
            >
              <option value="">Choose location</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Field
              label="Year, make and model"
              required
              value={vehicle.ymm}
              onChange={e => setVehicle({ ...vehicle, ymm: e.target.value })}
            />
            <Field
              label="Actual vehicle VIN"
              required
              pattern="[A-HJ-NPR-Za-hj-npr-z0-9]{17}"
              maxLength={17}
              value={vehicle.vin}
              onChange={e =>
                setVehicle({ ...vehicle, vin: e.target.value.toUpperCase() })
              }
            />
            <Field
              label="License plate (optional)"
              value={vehicle.plate}
              onChange={e => setVehicle({ ...vehicle, plate: e.target.value })}
            />
            <Field
              label="Last odometer (miles)"
              required
              type="number"
              min="0"
              max="2000000"
              value={vehicle.lastOdometer}
              onChange={e =>
                setVehicle({ ...vehicle, lastOdometer: Number(e.target.value) })
              }
            />
          </fieldset>
          <div className="r-actions">
            <button
              type="submit"
              disabled={busy}
              className="r-button r-primary"
            >
              {vehicle.id ? "Save vehicle" : "Add vehicle"}
            </button>
            <button
              type="button"
              className="r-button"
              onClick={() => setVehicle(blankVehicle())}
            >
              New vehicle
            </button>
          </div>
        </form>
      </Card>
      <Card
        title="Shop staff"
        detail="Invite named individuals. Each account can access only its assigned locations."
      >
        <ErrorNotice message={staff.error?.message} />
        {staff.isLoading ? (
          <p>Loading staff…</p>
        ) : !staff.data?.length ? (
          <Empty title="No shop accounts yet">
            Create an individual invitation below. Do not share accounts.
          </Empty>
        ) : (
          <div className="r-record-list">
            {staff.data.map(person => (
              <div className="r-staff-row" key={person.id}>
                <div>
                  <strong>{person.name}</strong>
                  <p>{person.email}</p>
                  <small>
                    {person.active ? "Active" : "Inactive"} ·{" "}
                    {person.locationIds
                      .map(
                        (id: number) =>
                          locations.find(l => l.id === id)?.name || id
                      )
                      .join(", ")}
                  </small>
                </div>
                <button
                  type="button"
                  className="r-button"
                  disabled={busy || !person.active}
                  onClick={() => {
                    if (window.confirm(`Deactivate access for ${person.name}?`))
                      void run(async () => {
                        await deactivate.mutateAsync({ id: person.id });
                        await staff.refetch();
                      }, "Staff access deactivated.");
                  }}
                >
                  <UserX size={16} />
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          onSubmit={e => {
            e.preventDefault();
            setActivation(null);
            void run(async () => {
              const result = await invite.mutateAsync({
                name: inviteName,
                email: inviteEmail,
                locationIds: scope,
              });
              setActivation({
                link: `${window.location.origin}/rental-handoff#activate=${encodeURIComponent(result.activationToken)}`,
                expires: result.activationExpires,
              });
              setInviteName("");
              setInviteEmail("");
              setScope([]);
              await staff.refetch();
            }, "Invitation created. Deliver the private activation link securely to this individual.");
          }}
        >
          <fieldset disabled={busy}>
            <div className="r-grid">
              <Field
                label="Staff full name"
                required
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
              />
              <Field
                label="Staff email"
                required
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
              />
            </div>
            <h3>Assigned locations · choose at least one</h3>
            {!locations.some(l => l.active) && (
              <p className="r-guidance" role="status">Add an active Total Recon location above before inviting a technician.</p>
            )}
            {locations
              .filter(l => l.active)
              .map(l => (
                <Check
                  key={l.id}
                  label={l.name}
                  checked={scope.includes(l.id)}
                  onChange={v =>
                    setScope(
                      v ? [...scope, l.id] : scope.filter(id => id !== l.id)
                    )
                  }
                />
              ))}
          </fieldset>
          {locations.some(l => l.active) && !scope.length && (
            <p className="r-guidance" role="status">Select Rockville, Laurel, or both to enable this invitation.</p>
          )}
          <button
            type="submit"
            className="r-button r-primary"
            disabled={busy || !scope.length}
          >
            <Mail size={16} />
            Create private invitation
          </button>
        </form>
        {activation && (
          <div className="r-callout">
            <div>
              <strong>Activation link — shown only in this session</strong>
              <p>
                Expires {dateDisplay(activation.expires)}. Send securely to the
                named staff member only. Do not give the link to other users.
              </p>
              <input
                aria-label="Private activation link"
                className="r-link-input"
                readOnly
                value={activation.link}
              />
              <div className="r-actions">
                <button
                  type="button"
                  className="r-button"
                  onClick={() =>
                    void run(
                      () => navigator.clipboard.writeText(activation.link),
                      "Activation link copied. Share securely with the invited individual only."
                    )
                  }
                >
                  <Copy size={16} />
                  Copy link
                </button>
                <button
                  type="button"
                  className="r-button"
                  onClick={() => setActivation(null)}
                >
                  Dismiss link
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
      <ReminderSettings />
      <SharedSenderForm refresh={refresh} sender={{ connected: settings.emailProviderReady === true, email: settings.senderEmail }} />
      <Card
        title="Launch approvals & delivery"
        detail="Only the owner administrator may intentionally confirm these items. Pending prerequisites block completed handoffs."
      >
        <form
          onSubmit={e => {
            e.preventDefault();
            void run(
              () => saveSettings.mutateAsync({ settings: config }),
              "Settings saved with a versioned rate record."
            );
          }}
        >
          <fieldset disabled={busy}>
            <Check
              label="Owner has approved the rental terms and fees, including the e1 electronic-renter authorization"
              checked={config.counselApproved}
              onChange={v => setConfig({ ...config, counselApproved: v })}
            />
            <Check
              label="Owner has approved the insurance / vehicle notice wording"
              checked={config.registrationConfirmed}
              onChange={v => setConfig({ ...config, registrationConfirmed: v })}
            />
            <div className="r-grid">
              <Field
                label="Financial responsibility reference"
                value={config.financialResponsibilityReference}
                onChange={e =>
                  setConfig({
                    ...config,
                    financialResponsibilityReference: e.target.value,
                  })
                }
              />
              <Check
                label="Owner explicitly authorizes omission of the financial responsibility reference"
                checked={config.omitFinancialReference}
                onChange={v =>
                  setConfig({ ...config, omitFinancialReference: v })
                }
              />
              <Field
                label="Connected shared Gmail sender"
                type="email"
                value={settings.senderEmail}
                readOnly
                placeholder="Connect the shared Gmail account above"
              />
              <Field
                label="Retention period (years)"
                type="number"
                min="1"
                max="100"
                value={config.retentionYears}
                onChange={e =>
                  setConfig({
                    ...config,
                    retentionYears: Number(e.target.value),
                  })
                }
              />
            </div>
            <p className="r-guidance">
              Email provider:{" "}
              {settings.emailProviderReady
                ? "Shared Gmail connected"
                : "Shared Gmail not connected"}
              . One shared Gmail account sends packets to the renter and the
              claim-specific email. Technicians do not connect personal email accounts.
              The From address comes from the authorized Google account and cannot be overwritten here.
            </p>
            <p className="r-guidance">
              Retention is metadata only. Records are retained for the life of
              the claim plus this period; there is no automatic deletion or
              retention job.
            </p>
            <h3>Rates · version {settings.rateVersion}</h3>
            <p>
              The current v7 terms fix these amounts. Different rates require an
              approved template update before this app can offer them.
            </p>
            <div className="r-grid">
              {Object.entries(DEFAULT_RENTAL_RATES).map(([key, value]) => (
                <Field
                  key={key}
                  label={
                    {
                      optionA: "Option A / day",
                      optionB: "Option B / day",
                      hold: "Security hold",
                      late: "Late / day",
                      lossOfUse: "Loss of use / day",
                      research: "Research / event",
                    }[key] || key
                  }
                  type="number"
                  disabled
                  value={value}
                />
              ))}
            </div>
            <Check
              label="Require original ink payment authorization even when the cardholder is the renter"
              checked={config.forceInkForRenter || false}
              onChange={v => setConfig({ ...config, forceInkForRenter: v })}
            />
            <p className="r-guidance">
              The owner-approved revision permits the renter/cardholder to sign
              electronically. A different cardholder must always sign the
              original paper in person, with a staff witness and photo-ID check.
            </p>
          </fieldset>
          <button type="submit" className="r-button r-primary" disabled={busy}>
            Save launch settings
          </button>
        </form>
      </Card>
    </div>
  );
}
