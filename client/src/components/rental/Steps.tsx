import { useEffect, useRef, useState } from "react";
import { Car, ShieldCheck, FileText, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FUEL_LEVELS,
  eligibleOptions,
  type RentalDraft,
  type RentalLocation,
  type RentalVehicle,
} from "@shared/rentalHandoff";
import {
  rentalAgreementSections,
  rentalAgreementCoverageChart,
} from "@shared/rentalAgreement";
import {
  Card,
  Check,
  Field,
  Note,
  Select,
  dateDisplay,
  localDateTime,
  isoDateTime,
} from "./Controls";
import { ErrorNotice, errorMessage } from "./Controls";
import {
  PhotoUpload,
  SignaturePad,
  type AssetWithUrl,
  type UploadAsset,
} from "./Media";
export const AGREEMENT_PDF =
  "/manus-storage/ClaimantRentalPacket-DRAFTv7_68b8dad8.pdf";
export type ManualRentalVehicle = {
  ymm: string;
  vin: string;
  plate: string;
  lastOdometer: number;
};
export type UploadRentalSupport = (
  kind: "claimEstimate" | "claimPhoto",
  base64: string,
  fileName: string
) => Promise<unknown>;
function RentalSupport({
  assets,
  upload,
  disabled,
}: {
  assets: AssetWithUrl[];
  upload: UploadRentalSupport;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const uploading = useRef(false);
  const choose = async (
    files: File[],
    forcedKind?: "claimEstimate" | "claimPhoto"
  ) => {
    if (uploading.current || disabled || !files.length) return;
    setError("");
    setNotice("");
    if (files.length > 10) {
      setError("Choose up to 10 files at a time.");
      return;
    }
    uploading.current = true;
    setBusy(true);
    let count = 0;
    try {
      for (const file of files) {
        if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
          throw new Error("Choose an estimate PDF or JPEG/PNG vehicle photos.");
        if (forcedKind === "claimPhoto" && file.type === "application/pdf")
          throw new Error("Choose JPEG or PNG for renter vehicle photos.");
        if (file.size > 10 * 1024 * 1024 || !file.size)
          throw new Error("Each file must be between 1 byte and 10 MB.");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("This file could not be opened."));
          reader.readAsDataURL(file);
        });
        await upload(
          forcedKind ||
            (file.type === "application/pdf" ? "claimEstimate" : "claimPhoto"),
          base64,
          file.name
        );
        count++;
      }
      setNotice(
        `${count} original ${count === 1 ? "file" : "files"} saved to this rental.`
      );
    } catch (e) {
      setError(`${count ? `${count} files saved. ` : ""}${errorMessage(e)}`);
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  };
  const support = assets.filter(
    a => a.kind === "claimEstimate" || a.kind === "claimPhoto"
  );
  return (
    <Card
      title="Renter vehicle estimate & photos"
      detail="Original claim files stay on this rental. No automatic analysis or packet inclusion."
    >
      <div
        className="r-support-drop"
        aria-busy={busy}
        onDragOver={e => {
          e.preventDefault();
        }}
        onDrop={e => {
          e.preventDefault();
          void choose(Array.from(e.dataTransfer.files));
        }}
      >
        <p>
          {busy
            ? "Saving original files…"
            : "Drop an estimate PDF or renter vehicle photos here."}
        </p>
        <div className="r-actions">
          {(["claimEstimate", "claimPhoto"] as const).map(kind => (
            <label
              className={`r-button ${disabled || busy ? "r-disabled" : ""}`}
              key={kind}
            >
              {kind === "claimEstimate"
                ? "Upload initial estimate"
                : "Upload renter vehicle photos"}
              <input
                type="file"
                multiple
                accept={
                  kind === "claimEstimate"
                    ? "application/pdf,image/jpeg,image/png"
                    : "image/jpeg,image/png"
                }
                disabled={disabled || busy}
                onChange={e => {
                  void choose(Array.from(e.target.files || []), kind);
                  e.target.value = "";
                }}
              />
            </label>
          ))}
        </div>
        <small>
          PDF, JPEG or PNG · 10 MB per file · up to 10 files at once.
        </small>
      </div>
      <ErrorNotice message={error} />
      {notice && (
        <p className="r-success" role="status">
          {notice}
        </p>
      )}
      {support.length > 0 && (
        <ul className="r-support-list">
          {support.map(asset => (
            <li key={asset.id}>
              <span>
                {asset.kind === "claimEstimate"
                  ? "Initial estimate"
                  : "Renter vehicle photo"}{" "}
                #{asset.id}
              </span>
              <a
                className="r-button"
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View original
              </a>
              <a className="r-button" href={asset.url} download>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
/** Location wall clock, independent of the device's timezone. */
export function rentalWallClock(value: string, zone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function rentalDateDisplay(value: string, zone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not entered";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value));
}
export function rentalInstant(wallClock: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wallClock)) return "";
  const desired = Date.parse(`${wallClock}:00Z`);
  if (!Number.isFinite(desired)) return "";
  let instant = desired;
  for (let i = 0; i < 4; i++) {
    const displayed = rentalWallClock(new Date(instant).toISOString(), zone);
    const difference = desired - Date.parse(`${displayed}:00Z`);
    instant += difference;
    if (!difference) return new Date(instant).toISOString();
  }
  return ""; // Reject nonexistent daylight-saving times instead of moving them.
}
export function hasExplicitReturnTime(draft: RentalDraft, zone: string) {
  const pickup = rentalWallClock(
    draft.pickupAt || draft.scheduledPickup,
    zone
  ).slice(11);
  const due = rentalWallClock(draft.expectedReturn, zone).slice(11);
  return !!due && !!pickup && due !== pickup;
}
export function withPickupTime(
  draft: RentalDraft,
  key: "scheduledPickup" | "pickupAt",
  value: string,
  zone: string,
  returnTimeEdited: boolean
): RentalDraft {
  const pickupClock = rentalWallClock(value, zone).slice(11);
  const dueDay = rentalWallClock(draft.expectedReturn, zone).slice(0, 10);
  return {
    ...draft,
    [key]: value,
    ...(!returnTimeEdited && pickupClock && dueDay
      ? {
          expectedReturn: rentalInstant(`${dueDay}T${pickupClock}`, zone),
        }
      : {}),
  };
}
function VinEntry({
  label,
  vin,
  disabled,
  onChange,
  onDecoded,
}: {
  label: string;
  vin: string;
  disabled?: boolean;
  onChange: (vin: string) => void;
  onDecoded: (ymm: string) => void;
}) {
  const decode = trpc.rentalHandoff.decodeVin.useMutation();
  const [error, setError] = useState("");
  const latestVin = useRef(vin);
  latestVin.current = vin;
  const latestDecoded = useRef(onDecoded);
  latestDecoded.current = onDecoded;
  return (
    <div className="r-vin-entry r-wide">
      <Field
        label={label}
        value={vin}
        maxLength={17}
        autoComplete="off"
        disabled={disabled}
        hint="Enter the actual 17-character VIN. Year, make and model remain editable."
        onChange={e => {
          setError("");
          onChange(e.target.value.toUpperCase());
        }}
      />
      <button
        type="button"
        className="r-button"
        disabled={
          disabled || decode.isPending || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)
        }
        onClick={async () => {
          setError("");
          const requestedVin = vin;
          try {
            const result = await decode.mutateAsync({ vin: requestedVin });
            if (latestVin.current === requestedVin)
              latestDecoded.current(
                `${result.year} ${result.make} ${result.model}`
              );
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      >
        {decode.isPending ? "Decoding…" : "Decode VIN"}
      </button>
      <ErrorNotice message={error} />
    </div>
  );
}
function RentalDateTime({
  label,
  value,
  zone,
  onChange,
}: {
  label: string;
  value: string;
  zone: string;
  onChange: (value: string, part: "date" | "time") => void;
}) {
  const wallClock = rentalWallClock(value, zone);
  const [day, setDay] = useState(wallClock.slice(0, 10));
  const [clock, setClock] = useState(wallClock.slice(11) || "10:00");
  const [invalidTime, setInvalidTime] = useState(false);
  useEffect(() => {
    if (wallClock) {
      setDay(wallClock.slice(0, 10));
      setClock(wallClock.slice(11));
    } else setDay("");
  }, [wallClock]);
  const options = Array.from(
    { length: 96 },
    (_, i) =>
      `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`
  );
  if (!options.includes(clock)) options.push(clock);
  options.sort();
  const apply = (nextDay: string, nextClock: string, part: "date" | "time") => {
    const instant = nextDay
      ? rentalInstant(`${nextDay}T${nextClock}`, zone)
      : "";
    setInvalidTime(!!nextDay && !instant);
    if (instant || !nextDay) onChange(instant, part);
  };
  return (
    <div className="r-date-time">
      <Field
        label={`${label} date`}
        type="date"
        value={day}
        onChange={e => {
          setDay(e.target.value);
          apply(e.target.value, clock, "date");
        }}
      />
      <Select
        label={`${label} time`}
        value={clock}
        onChange={e => {
          setClock(e.target.value);
          apply(day, e.target.value, "time");
        }}
      >
        {options.map(time => {
          const [hour, minute] = time.split(":");
          return (
            <option key={time} value={time}>
              {Number(hour) % 12 || 12}:{minute}{" "}
              {Number(hour) >= 12 ? "PM" : "AM"}
            </option>
          );
        })}
      </Select>
      {invalidTime && (
        <small className="r-date-error" role="alert">
          This time is unavailable due to a daylight-saving change. Choose
          another time.
        </small>
      )}
    </div>
  );
}
export type StepProps = {
  draft: RentalDraft;
  update: (d: RentalDraft) => void;
  disabled?: boolean;
  assets: AssetWithUrl[];
  upload: UploadAsset;
  locations: RentalLocation[];
  vehicles: RentalVehicle[];
  forceInkForRenter?: boolean;
  returnTimeState?: { current: boolean };
};
export function Details({
  draft: d,
  update,
  disabled,
  locations,
  vehicles,
  vehicleMode,
  onVehicleModeChange,
  manualVehicle,
  onManualVehicleChange,
  supportAssets,
  uploadSupport,
  supportDisabled,
  returnTimeState,
}: Pick<
  StepProps,
  "draft" | "update" | "disabled" | "locations" | "vehicles" | "returnTimeState"
> & {
  vehicleMode?: "inventory" | "manual";
  onVehicleModeChange?: (mode: "inventory" | "manual") => void;
  manualVehicle?: ManualRentalVehicle;
  onManualVehicleChange?: (vehicle: ManualRentalVehicle) => void;
  supportAssets?: AssetWithUrl[];
  uploadSupport?: UploadRentalSupport;
  supportDisabled?: boolean;
}) {
  const set = <K extends keyof RentalDraft>(key: K, value: RentalDraft[K]) =>
    update({ ...d, [key]: value });
  const vehicle = vehicles.find(v => v.id === d.vehicleId);
  const zone =
    locations.find(l => l.id === d.locationId)?.timezone || "America/New_York";
  const localReturnTimeEdited = useRef(hasExplicitReturnTime(d, zone));
  const returnTimeEdited = returnTimeState || localReturnTimeEdited;
  return (
    <>
      <Card
        title="Renter & claim"
        detail={
          disabled
            ? "Added by Claims. Contact Claims for a correction to these details."
            : "Set up the rental before the on-site handoff."
        }
      >
        <fieldset disabled={disabled} className="r-grid">
          <Field
            label="Renter full name"
            value={d.renterName}
            autoComplete="off"
            onChange={e => set("renterName", e.target.value)}
          />
          <Field
            label="Claim number"
            value={d.claimNumber}
            onChange={e => set("claimNumber", e.target.value)}
          />
          <Field
            label="Mobile phone"
            type="tel"
            value={d.mobile}
            onChange={e => set("mobile", e.target.value)}
          />
          <Field
            label="Email for packet delivery"
            type="email"
            value={d.email}
            onChange={e => set("email", e.target.value)}
          />
          <Field
            label="Claim-specific email for file copy"
            type="email"
            value={d.claimEmail || ""}
            onChange={e => set("claimEmail", e.target.value)}
            hint="Both the renter and this claim-file address receive the completed packet."
          />
          <Select
            label="Pickup location"
            value={d.locationId || ""}
            onChange={e =>
              update({ ...d, locationId: Number(e.target.value), vehicleId: 0 })
            }
          >
            <option value="">Choose a location</option>
            {locations
              .filter(l => l.active || l.id === d.locationId)
              .map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </Select>
          <RentalDateTime
            label="Scheduled pickup"
            value={d.scheduledPickup}
            zone={zone}
            onChange={value =>
              update(
                withPickupTime(
                  d,
                  "scheduledPickup",
                  value,
                  zone,
                  returnTimeEdited.current
                )
              )
            }
          />
          <RentalDateTime
            label="Expected return"
            value={d.expectedReturn}
            zone={zone}
            onChange={(value, part) => {
              if (part === "time") returnTimeEdited.current = true;
              const next = { ...d, expectedReturn: value };
              update(
                part === "date" && !returnTimeEdited.current
                  ? withPickupTime(
                      next,
                      "scheduledPickup",
                      d.scheduledPickup,
                      zone,
                      false
                    )
                  : next
              );
            }}
          />
        </fieldset>
      </Card>
      <Card
        title="Assigned rental vehicle"
        detail={
          onVehicleModeChange
            ? "Choose inventory or enter the actual rental vehicle to add it when scheduling."
            : "Select a real vehicle from the location inventory."
        }
      >
        {onVehicleModeChange && (
          <div
            className="r-filters r-vehicle-modes"
            aria-label="Vehicle entry method"
          >
            {(["manual", "inventory"] as const).map(mode => (
              <button
                type="button"
                className={`r-chip ${vehicleMode === mode ? "r-chip-active" : ""}`}
                key={mode}
                aria-pressed={vehicleMode === mode}
                disabled={disabled}
                onClick={() => onVehicleModeChange(mode)}
              >
                {mode === "inventory"
                  ? "Choose previously used vehicle"
                  : "Enter rental vehicle"}
              </button>
            ))}
          </div>
        )}
        {vehicleMode === "manual" && manualVehicle && onManualVehicleChange ? (
          <fieldset disabled={disabled} className="r-grid">
            <VinEntry
              label="Rental VIN"
              vin={manualVehicle.vin}
              disabled={disabled}
              onChange={vin => onManualVehicleChange({ ...manualVehicle, vin })}
              onDecoded={ymm =>
                onManualVehicleChange({ ...manualVehicle, ymm })
              }
            />
            <Field
              label="Rental year, make and model"
              value={manualVehicle.ymm}
              maxLength={120}
              required
              onChange={e =>
                onManualVehicleChange({ ...manualVehicle, ymm: e.target.value })
              }
            />
            <Field
              label="Rental license plate"
              value={manualVehicle.plate}
              maxLength={30}
              required
              onChange={e =>
                onManualVehicleChange({
                  ...manualVehicle,
                  plate: e.target.value,
                })
              }
            />
            <Field
              label="Last known odometer (miles)"
              type="number"
              min="0"
              max="2000000"
              value={manualVehicle.lastOdometer}
              onChange={e =>
                onManualVehicleChange({
                  ...manualVehicle,
                  lastOdometer: Number(e.target.value),
                })
              }
            />
          </fieldset>
        ) : (
          <fieldset disabled={disabled} className="r-grid">
            <Select
              label="Rental vehicle"
              value={d.vehicleId || ""}
              onChange={e => set("vehicleId", Number(e.target.value))}
            >
              <option value="">Choose a vehicle</option>
              {vehicles
                .filter(
                  v =>
                    v.locationId === d.locationId &&
                    (v.status === "Available" || v.id === d.vehicleId)
                )
                .map(v => (
                  <option value={v.id} key={v.id}>
                    {v.ymm} · {v.plate} · VIN {v.vin.slice(-6)}
                  </option>
                ))}
            </Select>
          </fieldset>
        )}
        {vehicleMode !== "manual" && vehicle && (
          <div className="r-vehicle-banner">
            <Car size={38} />
            <div>
              <h3>{vehicle.ymm}</h3>
              <p>VIN {vehicle.vin}</p>
              <p>
                Plate {vehicle.plate} · Last odometer{" "}
                {vehicle.lastOdometer.toLocaleString()} mi
              </p>
            </div>
            <span className="r-tag">{vehicle.status}</span>
          </div>
        )}
        {!vehicles.some(v => v.locationId === d.locationId) && (
          <p className="r-guidance">
            {onVehicleModeChange
              ? "No inventory at this location yet. Enter the actual vehicle manually to add it when scheduling. No sample vehicles are supplied."
              : "An administrator needs to configure this location’s vehicle inventory. No sample vehicles are supplied."}
          </p>
        )}
      </Card>
      <Card title="Renter’s own vehicle">
        <fieldset disabled={disabled} className="r-grid">
          <VinEntry
            label="VIN"
            vin={d.renterVehicleVin}
            disabled={disabled}
            onChange={vin => set("renterVehicleVin", vin)}
            onDecoded={ymm => set("renterVehicleYmm", ymm)}
          />
          <Field
            label="Year, make and model"
            value={d.renterVehicleYmm}
            onChange={e => set("renterVehicleYmm", e.target.value)}
          />
          <Field
            label="License plate"
            value={d.renterVehiclePlate}
            onChange={e => set("renterVehiclePlate", e.target.value)}
          />
          <Note
            label="Staff note for the shop"
            value={d.staffNote}
            onChange={value => set("staffNote", value)}
          />
        </fieldset>
      </Card>
      {uploadSupport ? (
        <RentalSupport
          assets={supportAssets || []}
          upload={uploadSupport}
          disabled={supportDisabled}
        />
      ) : (
        <p className="r-guidance">
          Schedule this rental first to attach the initial estimate and renter
          vehicle photos.
        </p>
      )}
    </>
  );
}
export function Walkaround({
  condition,
  onChange,
  disabled = false,
  comparison,
}: {
  condition: RentalDraft["condition"];
  onChange: (value: RentalDraft["condition"]) => void;
  disabled?: boolean;
  comparison?: RentalDraft["condition"];
}) {
  return (
    <div className="r-walkaround">
      <button
        type="button"
        className="r-button"
        disabled={disabled}
        onClick={() => onChange(condition.map(c => ({ ...c, ok: true })))}
      >
        Mark all OK
      </button>
      {condition.map((c, i) => (
        <div className="r-condition" key={c.area}>
          <div>
            <strong>{c.area}</strong>
            {comparison && (
              <small>
                At pickup:{" "}
                {comparison[i]?.ok
                  ? "OK"
                  : comparison[i]?.note || "Not recorded"}
              </small>
            )}
          </div>
          <Check
            label="OK"
            checked={c.ok}
            disabled={disabled}
            onChange={ok =>
              onChange(condition.map((v, j) => (j === i ? { ...v, ok } : v)))
            }
          />
          <Field
            label={`${c.area} damage note`}
            value={c.note}
            disabled={disabled}
            onChange={e =>
              onChange(
                condition.map((v, j) =>
                  j === i
                    ? {
                        ...v,
                        note: e.target.value,
                        ok: e.target.value ? false : v.ok,
                      }
                    : v
                )
              )
            }
          />
        </div>
      ))}
    </div>
  );
}
export function Pickup({
  draft: d,
  update,
  disabled,
  assets,
  upload,
  vehicles,
  locations,
  returnTimeState,
}: StepProps) {
  const set = <K extends keyof RentalDraft>(key: K, value: RentalDraft[K]) =>
    update({ ...d, [key]: value });
  const vehicle = vehicles.find(v => v.id === d.vehicleId);
  const zone =
    locations.find(l => l.id === d.locationId)?.timezone || "America/New_York";
  const localReturnTimeEdited = useRef(hasExplicitReturnTime(d, zone));
  const returnTimeEdited = returnTimeState || localReturnTimeEdited;
  return (
    <>
      <Card title="Vehicle & pickup" className="r-pickup-card">
        <div className="r-vehicle-banner r-pickup-vehicle">
          <Car size={28} aria-hidden="true" />
          <div>
            <h3>{vehicle?.ymm || "No vehicle assigned"}</h3>
            <p>Plate {vehicle?.plate || "Not configured"}</p>
          </div>
        </div>
        <Field
          label="Inventory VIN — read only"
          value={vehicle?.vin || ""}
          readOnly
          hint="Compare with the vehicle. Ask an administrator for VIN corrections."
        />
        <fieldset disabled={disabled} className="r-grid r-pickup-readings">
          <Field
            label="Odometer out (miles)"
            type="number"
            min="0"
            max="2000000"
            value={d.odometerOut ?? ""}
            onChange={e =>
              set(
                "odometerOut",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
          <Select
            label="Fuel out"
            value={d.fuelOut}
            onChange={e =>
              set("fuelOut", e.target.value as RentalDraft["fuelOut"])
            }
          >
            {FUEL_LEVELS.map(f => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </fieldset>
        <section
          className="r-pickup-photos"
          aria-labelledby="pickup-photos-title"
        >
          <h3 id="pickup-photos-title">Pickup condition photos</h3>
          <p>
            Four exterior views required. Add extra photos for gauges, interior
            or damage.
          </p>
          <div className="r-grid r-pickup-photo-grid">
            {(["front", "rear", "driver", "passenger", "extra"] as const).map(
              kind => (
                <PhotoUpload
                  key={kind}
                  kind={kind}
                  label={
                    {
                      front: "Front",
                      rear: "Rear",
                      driver: "Driver side",
                      passenger: "Passenger side",
                      extra: "Additional condition photos",
                    }[kind]
                  }
                  assets={assets}
                  upload={upload}
                  disabled={disabled}
                />
              )
            )}
          </div>
        </section>
        <fieldset disabled={disabled} className="r-grid r-pickup-time">
          <RentalDateTime
            label="Actual pickup"
            value={d.pickupAt}
            zone={zone}
            onChange={value =>
              update(
                withPickupTime(
                  d,
                  "pickupAt",
                  value,
                  zone,
                  returnTimeEdited.current
                )
              )
            }
          />
          <button
            type="button"
            className="r-button r-align-end"
            onClick={() =>
              update(
                withPickupTime(
                  d,
                  "pickupAt",
                  new Date().toISOString(),
                  zone,
                  returnTimeEdited.current
                )
              )
            }
          >
            Use current pickup time
          </button>
          <Field
            label="Keys / fobs handed over"
            type="number"
            min="0"
            max="20"
            value={d.keysOut}
            onChange={e => set("keysOut", Number(e.target.value))}
          />
        </fieldset>
      </Card>
      <Card
        title="Renter identification"
        detail="The renter must be at least 25 at pickup with an unexpired license."
      >
        <fieldset disabled={disabled} className="r-grid">
          <Field
            label="Date of birth"
            type="date"
            value={d.dob}
            onChange={e => set("dob", e.target.value)}
          />
          <Field
            label="Driver license number"
            value={d.license}
            onChange={e => set("license", e.target.value)}
          />
          <Field
            label="License state"
            value={d.licenseState}
            maxLength={10}
            onChange={e => set("licenseState", e.target.value)}
          />
          <Field
            label="License expiration"
            type="date"
            value={d.licenseExpiration}
            onChange={e => set("licenseExpiration", e.target.value)}
          />
        </fieldset>
      </Card>
      <Card
        title="12-area walkaround"
        detail="Mark each area OK or describe existing damage. Notes and photos become part of the condition report."
      >
        <Walkaround
          condition={d.condition}
          onChange={condition => set("condition", condition)}
          disabled={disabled}
        />
      </Card>
    </>
  );
}
export function Protection({
  draft: d,
  update,
  disabled,
  assets,
  upload,
}: StepProps) {
  const [agreementOpen, setAgreementOpen] = useState(false);
  const insurance = <K extends keyof RentalDraft["insurance"]>(
    key: K,
    value: RentalDraft["insurance"][K]
  ) => update({ ...d, insurance: { ...d.insurance, [key]: value } });
  const initialKeys = [
    "election",
    ...(d.election !== "Decline" ? ["5"] : []),
    ...(d.election === "B" ? ["6"] : []),
    "7",
    "8",
    "9",
    "10",
  ];
  return (
    <>
      <Card
        title="ID & coverage documents"
        detail="A declarations page is evidence, not a substitute for insurer verification."
      >
        <div className="r-grid">
          <PhotoUpload
            kind="licenseFront"
            label="License front"
            assets={assets}
            upload={upload}
            disabled={disabled}
          />
          <PhotoUpload
            kind="licenseBack"
            label="License back"
            assets={assets}
            upload={upload}
            disabled={disabled}
          />
          <PhotoUpload
            kind="declarations"
            label="Declarations page"
            assets={assets}
            upload={upload}
            disabled={disabled}
          />
          <Check
            label="No declarations page provided"
            checked={d.insurance.noneProvided}
            onChange={v => insurance("noneProvided", v)}
            disabled={disabled}
          />
          <PhotoUpload
            kind="coverageConfirmation"
            label="Coverage confirmation (optional)"
            assets={assets}
            upload={upload}
            disabled={disabled}
          />
        </div>
      </Card>
      <Card
        title="Coverage verification · MLC-RP-3"
        detail="Ask the insurer to confirm coverage and restrictions. Record the staff member and actual verification time."
      >
        <fieldset disabled={disabled}>
          <div className="r-grid">
            <Select
              label="Renter insurance level"
              value={d.insurance.level}
              onChange={e =>
                update({
                  ...d,
                  election: "",
                  insurance: {
                    ...d.insurance,
                    level: e.target.value as RentalDraft["insurance"]["level"],
                    verified: false,
                  },
                })
              }
            >
              <option value="none">No auto insurance</option>
              <option value="liability">Liability only</option>
              <option value="full">
                Liability + comprehensive & collision
              </option>
            </Select>
            <Field
              label="Insurance company"
              value={d.insurance.insurer}
              onChange={e => insurance("insurer", e.target.value)}
            />
            <Field
              label="Policy number"
              value={d.insurance.policy}
              onChange={e => insurance("policy", e.target.value)}
            />
            <Field
              label="Insurer contact"
              value={d.insurance.contact}
              onChange={e => insurance("contact", e.target.value)}
            />
            <Field
              label="Insurer phone"
              type="tel"
              value={d.insurance.phone}
              onChange={e => insurance("phone", e.target.value)}
            />
            <Field
              label="Liability limits"
              value={d.insurance.limits}
              onChange={e => insurance("limits", e.target.value)}
            />
            <Field
              label="Deductibles"
              value={d.insurance.deductible}
              onChange={e => insurance("deductible", e.target.value)}
            />
          </div>
          <div className="r-check-stack">
            {(
              [
                ["active", "Policy is active for this rental period"],
                ["liability", "Liability coverage applies to this rental"],
                ["comprehensive", "Comprehensive and collision apply"],
                [
                  "additional",
                  "Additional drivers are confirmed on the policy",
                ],
                [
                  "notRestricted",
                  "No rental exclusions or restrictions prevent coverage",
                ],
              ] as const
            ).map(([key, label]) => (
              <Check
                key={key}
                label={label}
                checked={d.insurance.checks[key]}
                onChange={v =>
                  insurance("checks", { ...d.insurance.checks, [key]: v })
                }
              />
            ))}
          </div>
          <div className="r-grid">
            <Field
              label="Verified by — full staff name"
              value={d.insurance.verifiedBy}
              onChange={e => insurance("verifiedBy", e.target.value)}
            />
            <Field
              label="Actual verification date & time"
              type="datetime-local"
              value={localDateTime(d.insurance.verifiedAt)}
              onChange={e =>
                insurance("verifiedAt", isoDateTime(e.target.value))
              }
            />
          </div>
          <Check
            label="Coverage was verified directly with the insurer"
            checked={d.insurance.verified}
            onChange={v => insurance("verified", v)}
          />
          <Check
            label="Renter confirms no other liability insurance applies"
            checked={d.insurance.noOtherLiability}
            onChange={v => insurance("noOtherLiability", v)}
          />
          <Note
            label="Coverage verification notes"
            value={d.insurance.notes}
            onChange={v => insurance("notes", v)}
          />
        </fieldset>
      </Card>
      <Card
        title="Protection agreement · MLC-RP-1"
        detail="Read the complete source agreement before choosing an option or entering initials."
      >
        <div className="r-callout">
          <FileText />
          <div>
            <strong>Complete v7 agreement</strong>
            <p>
              The signed packet uses the exact v7 source wording. The option
              helpers below are not agreement text.
            </p>
            <div className="r-actions">
              <button
                type="button"
                className="r-button"
                onClick={() => setAgreementOpen(true)}
              >
                Read full agreement
              </button>
              <a
                className="r-button"
                href={AGREEMENT_PDF}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open source PDF
              </a>
            </div>
          </div>
        </div>
        <Dialog open={agreementOpen} onOpenChange={setAgreementOpen}>
          <DialogContent className="r-agreement-dialog">
            <DialogHeader>
              <DialogTitle>Complete v7 rental packet</DialogTitle>
              <DialogDescription>
                Read all agreement terms. Use the source PDF link if the
                document is not displayed on your device.
              </DialogDescription>
            </DialogHeader>
            <a href={AGREEMENT_PDF} target="_blank" rel="noopener noreferrer">
              Open complete source PDF in a new tab
            </a>
            <iframe title="Complete v7 agreement source" src={AGREEMENT_PDF} />
          </DialogContent>
        </Dialog>
        <div className="r-options">
          {eligibleOptions(d).map(o => (
            <label
              className={`r-option ${!o.allowed ? "r-option-unavailable" : ""} ${d.election === o.option ? "r-selected" : ""}`}
              key={o.option}
            >
              <input
                type="radio"
                name="protection"
                value={o.option}
                checked={d.election === o.option}
                disabled={disabled || !o.allowed}
                onChange={() =>
                  update({
                    ...d,
                    election: o.option,
                    additionalDrivers:
                      o.option === "B" ? [] : d.additionalDrivers,
                  })
                }
              />
              <div>
                <strong>
                  {o.option === "A"
                    ? "A · Damage Waiver — $20/day"
                    : o.option === "B"
                      ? "B · Damage Waiver + Liability Protection — $40/day"
                      : "Decline — $0/day"}
                </strong>
                <p>{o.reason}</p>
              </div>
            </label>
          ))}
        </div>
        <p className="r-guidance">
          v7 rule: Option B is only available with no auto insurance and no
          other applicable liability insurance. No expanded eligibility is
          offered.
        </p>
        <div className="r-agreement-sections">
          {rentalAgreementSections.map(section => (
            <section className="r-agreement-section" key={section.id}>
              <h3>
                {section.number}. {section.title}
              </h3>
              {section.number === 3 ? (
                <>
                  <div className="r-chart-scroll">
                    <table>
                      <caption>What each option covers</caption>
                      <thead>
                        <tr>
                          {rentalAgreementCoverageChart.headers.map(
                            (heading, i) => (
                              <th key={i} scope="col">
                                {heading || "Coverage"}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rentalAgreementCoverageChart.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) =>
                              j === 0 ? (
                                <th scope="row" key={j}>
                                  {cell}
                                </th>
                              ) : (
                                <td key={j}>{cell}</td>
                              )
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="r-agreement-text">
                    {section.text.slice(section.text.indexOf("Read Sections"))}
                  </p>
                  <details>
                    <summary>View original source chart text</summary>
                    <p className="r-agreement-text">{section.text}</p>
                  </details>
                </>
              ) : (
                <p className="r-agreement-text">{section.text}</p>
              )}
              {(section.number === 2 || initialKeys.includes(section.id)) && (
                <Field
                  label={
                    section.number === 2
                      ? "Election initials"
                      : `Section ${section.id} initials`
                  }
                  value={
                    d.initials[
                      section.number === 2 ? "election" : section.id
                    ] || ""
                  }
                  maxLength={12}
                  disabled={disabled}
                  onChange={e =>
                    update({
                      ...d,
                      initials: {
                        ...d.initials,
                        [section.number === 2 ? "election" : section.id]:
                          e.target.value,
                      },
                    })
                  }
                />
              )}
            </section>
          ))}
        </div>
      </Card>
      <Card
        title="Additional drivers · Section 9"
        detail="Maximum two. Each must have a valid license and be confirmed on the renter’s personal policy. No additional drivers with Option B."
      >
        {d.additionalDrivers.map((driver, i) => {
          const set = <K extends keyof typeof driver>(
            key: K,
            value: (typeof driver)[K]
          ) =>
            update({
              ...d,
              additionalDrivers: d.additionalDrivers.map((v, j) =>
                i === j ? { ...v, [key]: value } : v
              ),
            });
          return (
            <fieldset disabled={disabled} key={i} className="r-driver">
              <div className="r-grid">
                <Field
                  label={`Driver ${i + 1} name`}
                  value={driver.name}
                  onChange={e => set("name", e.target.value)}
                />
                <Field
                  label={`Driver ${i + 1} license number`}
                  value={driver.license}
                  onChange={e => set("license", e.target.value)}
                />
                <Field
                  label={`Driver ${i + 1} license state`}
                  value={driver.state}
                  onChange={e => set("state", e.target.value)}
                />
                <Field
                  label={`Driver ${i + 1} license expiration`}
                  type="date"
                  value={driver.expiration}
                  onChange={e => set("expiration", e.target.value)}
                />
              </div>
              <Check
                label="Named insured or listed on renter’s policy"
                checked={driver.onPolicy}
                onChange={v => set("onPolicy", v)}
              />
              <Check
                label="Insurer verified driver coverage"
                checked={driver.verified}
                onChange={v => set("verified", v)}
              />
              <button
                type="button"
                className="r-button"
                onClick={() =>
                  update({
                    ...d,
                    additionalDrivers: d.additionalDrivers.filter(
                      (_, j) => j !== i
                    ),
                  })
                }
              >
                <Trash2 size={16} />
                Remove driver
              </button>
            </fieldset>
          );
        })}
        <button
          type="button"
          className="r-button"
          disabled={
            disabled || d.election === "B" || d.additionalDrivers.length >= 2
          }
          onClick={() =>
            update({
              ...d,
              additionalDrivers: [
                ...d.additionalDrivers,
                {
                  name: "",
                  license: "",
                  state: "",
                  expiration: "",
                  onPolicy: false,
                  verified: false,
                },
              ],
            })
          }
        >
          <Plus size={16} />
          Add driver
        </button>
      </Card>
    </>
  );
}
export function Signatures({
  draft: d,
  update,
  disabled,
  assets,
  upload,
  forceInkForRenter = false,
}: StepProps) {
  const payment = <K extends keyof RentalDraft["payment"]>(
    key: K,
    value: RentalDraft["payment"][K]
  ) => update({ ...d, payment: { ...d.payment, [key]: value } });
  const inkRequired = !d.payment.isRenter || forceInkForRenter;
  return (
    <>
      <Card
        title="Payment authorization · MLC-RP-2"
        detail="Card information is entered in the separate payment system. This app never takes a full card number or security code."
      >
        <div className="r-saved-return">
          <strong>Owner-approved e1 signature wording</strong>
          <p className="r-agreement-text">
            Renter-cardholders may sign electronically. A different cardholder
            must sign in ink in person and show government photo ID.
          </p>
          <small>
            This is the narrowly authorized revision to the original v7
            signature instruction. All other payment agreement wording remains
            in the complete source PDF.
          </small>
        </div>
        <div className="r-callout">
          <ShieldCheck />
          <div>
            <strong>
              {inkRequired
                ? "Original ink payment authorization is required."
                : "Renter/cardholder electronic authorization is permitted by the owner-approved revision."}
            </strong>
            <p>
              {inkRequired
                ? "Have the cardholder sign the original paper in person, check government photo ID, retain the signed original and upload its scan. A scan records the original; it does not replace the original ink signature. A different cardholder may never sign electronically."
                : "When the renter is also the cardholder, their saved renter signature and explicit payment acknowledgment authorize the payment form. The full names must match. Check the cardholder’s government photo ID. If the cardholder is someone else, original ink authorization in person is required."}
            </p>
            <a href={AGREEMENT_PDF} target="_blank" rel="noopener noreferrer">
              Open original v7 source packet
            </a>
          </div>
        </div>
        <fieldset disabled={disabled}>
          <div className="r-grid">
            <Field
              label="Cardholder full name"
              value={d.payment.cardholderName}
              onChange={e => payment("cardholderName", e.target.value)}
            />
            <Check
              label="Cardholder is the renter"
              checked={d.payment.isRenter}
              onChange={v => payment("isRenter", v)}
            />
            <Field
              label="Billing address"
              value={d.payment.billingAddress}
              onChange={e => payment("billingAddress", e.target.value)}
            />
            <Field
              label="Billing ZIP"
              value={d.payment.zip}
              maxLength={12}
              onChange={e => payment("zip", e.target.value)}
            />
            <Field
              label="Cardholder phone"
              type="tel"
              value={d.payment.phone}
              onChange={e => payment("phone", e.target.value)}
            />
            <Field
              label="Card type"
              value={d.payment.cardType}
              maxLength={30}
              onChange={e => payment("cardType", e.target.value)}
            />
            <Field
              label="Last four digits only"
              inputMode="numeric"
              pattern="[0-9]{4}"
              autoComplete="off"
              maxLength={4}
              value={d.payment.lastFour}
              onChange={e =>
                payment(
                  "lastFour",
                  e.target.value.replace(/\D/g, "").slice(0, 4)
                )
              }
            />
            <Field
              label="Card expiration (MM/YYYY)"
              placeholder="MM/YYYY"
              maxLength={7}
              value={d.payment.expiration}
              onChange={e => payment("expiration", e.target.value)}
            />
            {!d.payment.isRenter && (
              <Field
                label="Relationship to renter"
                value={d.payment.relationship}
                onChange={e => payment("relationship", e.target.value)}
              />
            )}
            <Field
              label="Estimated rental days"
              type="number"
              min="1"
              max="3660"
              value={d.payment.estimatedDays}
              onChange={e => payment("estimatedDays", Number(e.target.value))}
            />
            <Field
              label="When charges will be entered"
              value={d.payment.chargedWhen}
              onChange={e => payment("chargedWhen", e.target.value)}
            />
            {inkRequired && (
              <Field
                label="Witness — full staff name"
                value={d.payment.witness}
                onChange={e => payment("witness", e.target.value)}
              />
            )}
          </div>
          <Check
            label="$50 security hold was entered in the payment system"
            checked={d.payment.holdEntered}
            onChange={v => payment("holdEntered", v)}
          />
          <Check
            label="Cardholder’s government photo ID was checked in person"
            checked={d.payment.photoIdChecked}
            onChange={v => payment("photoIdChecked", v)}
          />
          <Check
            label="Payment authorization and renter acknowledgment confirmed"
            checked={d.payment.authorizationAcknowledged}
            onChange={v => payment("authorizationAcknowledged", v)}
          />
        </fieldset>
        {inkRequired && (
          <PhotoUpload
            kind="signedPayment"
            label="Signed paper payment authorization scan"
            assets={assets}
            upload={upload}
            disabled={disabled}
          />
        )}
        <p className="r-guidance">
          Upload the authorization page with last four only. Do not upload a
          full payment card or government ID image as payment evidence. Checking
          these boxes does not charge or authorize a card.
        </p>
      </Card>
      <Card title="Rental agreement signatures">
        <Field
          label="Total Recon representative full name"
          value={d.representativeName}
          disabled={disabled}
          onChange={e => update({ ...d, representativeName: e.target.value })}
        />
        <div className="r-grid">
          <SignaturePad
            kind="renterSignature"
            label="Renter agreement signature"
            name={d.renterName}
            assets={assets}
            upload={upload}
            disabled={disabled}
          />
          <SignaturePad
            kind="representativeSignature"
            label="Representative agreement signature"
            name={d.representativeName}
            assets={assets}
            upload={upload}
            disabled={disabled}
          />
        </div>
      </Card>
    </>
  );
}
export function Summary({
  draft: d,
  locations,
  vehicles,
}: {
  draft: RentalDraft;
  locations: RentalLocation[];
  vehicles: RentalVehicle[];
}) {
  const location = locations.find(l => l.id === d.locationId);
  const vehicle = vehicles.find(v => v.id === d.vehicleId);
  return (
    <aside className="r-summary">
      <Card title="Summary">
        <span className="r-tag">Added by Claims</span>
        <h3>{d.renterName || "New rental"}</h3>
        <dl>
          <dt>Claim</dt>
          <dd>{d.claimNumber || "Not entered"}</dd>
          <dt>Contact</dt>
          <dd>
            {d.mobile || "Not entered"}
            <br />
            {d.email || ""}
          </dd>
          <dt>Claim-file copy</dt>
          <dd>{d.claimEmail || "Not entered"}</dd>
          <dt>Location</dt>
          <dd>{location?.name || "Not selected"}</dd>
          <dt>Scheduled pickup</dt>
          <dd>{rentalDateDisplay(d.scheduledPickup, location?.timezone || "America/New_York")}</dd>
          <dt>Expected return</dt>
          <dd>{rentalDateDisplay(d.expectedReturn, location?.timezone || "America/New_York")}</dd>
          <dt>Rental vehicle</dt>
          <dd>
            {vehicle?.ymm || "Not assigned"}
            <br />
            {vehicle?.vin || ""}
            <br />
            {vehicle?.plate || ""}
          </dd>
          <dt>Renter vehicle</dt>
          <dd>
            {d.renterVehicleYmm || "Not entered"}
            <br />
            {d.renterVehicleVin}
            <br />
            {d.renterVehiclePlate}
          </dd>
          <dt>Protection</dt>
          <dd>{d.election || "Not selected"}</dd>
        </dl>
        {d.staffNote && (
          <div className="r-staff-note">
            <strong>Staff note</strong>
            <p>{d.staffNote}</p>
          </div>
        )}
      </Card>
      <p className="r-summary-help">
        Accident or theft: (855) 906-5949
        <br />
        Roadside & towing: (855) 861-9875
      </p>
    </aside>
  );
}
