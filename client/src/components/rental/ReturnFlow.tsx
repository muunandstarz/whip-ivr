import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { createReceiptRequestKey } from "@/lib/receiptBrowser";
import {
  CONDITION_AREAS,
  calculateRentalCharges,
  type RentalReturn,
} from "@shared/rentalHandoff";
import {
  Card,
  Check,
  ErrorNotice,
  Field,
  Note,
  money,
  dateDisplay,
  errorMessage,
  isoDateTime,
  localDateTime,
} from "./Controls";
import { PhotoUpload, SignaturePad, type UploadAsset } from "./Media";
import { FuelGauge } from "./FuelGauge";
import { Walkaround } from "./Steps";
import type { RentalRecord, RentalSession } from "./types";
import { useRentalAutosave } from "./useRentalAutosave";
export function ReturnFlow({
  record,
  session,
  upload,
  refresh,
  onBack,
}: {
  record: RentalRecord;
  session: RentalSession;
  upload: UploadAsset;
  refresh: () => Promise<unknown>;
  onBack: () => void;
}) {
  const complete = trpc.rentalHandoff.returnComplete.useMutation();
  const close = trpc.rentalHandoff.close.useMutation();
  const saveReturn = trpc.rentalHandoff.saveReturn.useMutation();
  const settle = trpc.rentalHandoff.confirmSettlement.useMutation();
  const locked = record.status === "Closed" || record.status === "Returned";
  const [initialData] = useState<RentalReturn>(
    record.returnData || {
      returnedAt: new Date().toISOString(),
      odometer: 0,
      fuel: record.draft.fuelOut,
      condition: CONDITION_AREAS.map(area => ({ area, ok: false, note: "" })),
      noticeAt: "",
      tolls: 0,
      parking: 0,
      fines: 0,
      researchEvents: 0,
      cleaning: 0,
      roadside: 0,
      lossOfUseDays: 0,
      lossOfUseResponsible: false,
      damageNoticeNotes: "",
      notes: "",
      chargesSettled: false,
      representativeName: "",
    }
  );
  // The API remains numeric; a new return must not present pickup mileage as measured.
  const [odometerInput, setOdometerInput] = useState(
    record.returnData ? String(record.returnData.odometer) : ""
  );
  const pickupOdometer = record.draft.odometerOut;
  const measuredOdometer = odometerInput.trim() === "" ? null : Number(odometerInput);
  const odometerError = measuredOdometer === null
    ? "Enter the measured return odometer (miles)."
    : !Number.isFinite(measuredOdometer) || measuredOdometer < 0 || measuredOdometer > 2000000
      ? "Enter a valid return odometer between 0 and 2,000,000 miles."
      : pickupOdometer !== null && measuredOdometer < pickupOdometer
        ? "Return odometer cannot be lower than pickup."
        : "";
  const milesDriven = !odometerError && pickupOdometer !== null && Number.isFinite(pickupOdometer)
    ? measuredOdometer! - pickupOdometer
    : null;
  const autosave = useRentalAutosave<RentalReturn>({
    id: record.id,
    initialDraft: initialData,
    initialRevision: record.revision,
    locked,
    validationError: odometerError,
    save: async input => {
      const result = await saveReturn.mutateAsync({ id: input.id, revision: input.revision, data: input.draft });
      await refresh();
      return result;
    },
  });
  const data = autosave.draft;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadReturnSignature: UploadAsset = async (...args) => {
    if (odometerError) throw new Error(odometerError);
    await autosave.flush();
    return upload(...args);
  };
  const [signatureCutoff, setSignatureCutoff] = useState(0);
  const [settlementConfirmed, setSettlementConfirmed] = useState(false);
  const requestId = useRef<string | null>(null);
  const currentAssets = record.assets.filter(a => !a.kind.endsWith("Signature") || a.id > signatureCutoff);
  const set = <K extends keyof RentalReturn>(
    key: K,
    value: RentalReturn[K],
    forceSave = false
  ) => {
    if (locked) return;
    requestId.current = null;
    setSignatureCutoff(Math.max(signatureCutoff, ...record.assets.filter(a => a.kind.startsWith("return") && a.kind.endsWith("Signature")).map(a => a.id), 0));
    autosave.update({ ...data, [key]: value }, forceSave);
  };
  const zone =
    session.locations.find(l => l.id === record.draft.locationId)?.timezone ||
    "America/New_York";
  let charges: ReturnType<typeof calculateRentalCharges> | undefined;
  let calculationError = "";
  try {
    charges = calculateRentalCharges(record.draft, data, record.rates, zone);
  } catch (e) {
    calculationError = errorMessage(e);
  }
  const requiredKinds = [
    "returnFront",
    "returnRear",
    "returnDriver",
    "returnPassenger",
    "returnDashboard",
    "returnRenterSignature",
    "returnRepresentativeSignature",
  ] as const;
  const evidenceLabels = {
    returnFront: "the return front photo",
    returnRear: "the return rear photo",
    returnDriver: "the return driver-side photo",
    returnPassenger: "the return passenger-side photo",
    returnDashboard: "the required return dashboard photo (odometer, fuel and warning lights)",
    returnRenterSignature: "the renter return signature",
    returnRepresentativeSignature: "the representative return signature",
  };
  const missing = [
    ...requiredKinds
      .filter(kind => !currentAssets.some(a => a.kind === kind))
      .map(kind => `Add ${evidenceLabels[kind]}.`),
    ...(!data.representativeName.trim()
      ? ["Enter the representative’s full name."]
      : []),
    ...(odometerError ? [odometerError] : []),
    ...(data.condition.some(c => !c.ok && !c.note.trim())
      ? ["Complete every return walkaround area."]
      : []),
    ...(calculationError ? [calculationError] : []),
  ];
  const finish = async () => {
    if (locked || busy || missing.length) return;
    setBusy(true);
    setError("");
    try {
      const revision = await autosave.flush();
      requestId.current ||= createReceiptRequestKey();
      const result = await complete.mutateAsync({
        id: record.id,
        revision,
        requestId: requestId.current,
        data,
      });
      setNotice(
        `Return recorded. Email delivery: ${result.emailStatus}. Open the saved packet below to print.`
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="r-page-heading">
        <div>
          <p className="r-eyebrow">RENTAL #{record.id}</p>
          <h1>Vehicle return</h1>
          <p>
            {record.draft.renterName} · {record.status}
          </p>
        </div>
        <button type="button" className="r-button" disabled={busy} onClick={async () => {
          try { if (!locked) await autosave.flush(); onBack(); } catch (e) { setError(errorMessage(e)); }
        }}>
          Back to rental
        </button>
      </div>
      <ErrorNotice message={error} />
      <ErrorNotice message={autosave.error} />
      {!locked && <p role="status" className="r-guidance">Return draft: {autosave.state === "saved" ? "All changes saved" : autosave.state === "saving" ? "Saving changes…" : autosave.state === "unsaved" ? "Unsaved changes…" : "Save failed — review before continuing"}</p>}
      {!locked && odometerError && <p className="r-guidance">Enter a valid measured return odometer to save this draft. Other edits remain on this page until then.</p>}
      {autosave.state === "error" && <button type="button" className="r-button" onClick={() => void autosave.retry().catch(e => setError(errorMessage(e)))}>Retry return save</button>}
      {autosave.state === "conflict" && <p className="r-guidance">Another user changed this rental. Your edits have not overwritten their work. Reload the latest record before continuing.</p>}
      {notice && (
        <p className="r-success" role="status">
          {notice}
        </p>
      )}
      {locked && (
        <p className="r-guidance">
          This completed return is locked. The signed packet remains unchanged.
        </p>
      )}
      <Card
        title="Return readings"
        detail={`Pickup: ${dateDisplay(record.draft.pickupAt)} · ${pickupOdometer?.toLocaleString() ?? "Not recorded"} miles · ${record.draft.fuelOut} fuel`}
      >
        <fieldset disabled={locked || busy} className="r-grid">
          <Field
            label="Actual return date & time"
            type="datetime-local"
            value={localDateTime(data.returnedAt)}
            onChange={e => set("returnedAt", isoDateTime(e.target.value))}
          />
          <Field
            label="Return odometer (miles)"
            type="number"
            min={pickupOdometer ?? 0}
            max="2000000"
            value={odometerInput}
            required
            aria-invalid={!!odometerError}
            hint={odometerError || "Enter the reading shown on the return dashboard."}
            onChange={e => {
              setOdometerInput(e.target.value);
              const reading = Number(e.target.value);
              set("odometer", e.target.value !== "" && Number.isFinite(reading) ? reading : data.odometer, !record.returnData);
            }}
          />
          <Field
            label="Miles driven"
            value={milesDriven === null ? "" : milesDriven.toLocaleString()}
            readOnly
            hint="Calculated from valid pickup and return odometer readings."
          />
          <FuelGauge
            label="Fuel at return"
            value={data.fuel}
            onChange={value => set("fuel", value)}
            disabled={locked || busy}
          />
          <Field
            label="Actual return notice date & time"
            type="datetime-local"
            value={localDateTime(data.noticeAt)}
            onChange={e => set("noticeAt", isoDateTime(e.target.value))}
            hint="Record the notice that was actually given. Late fees start only after that notice plus 24 hours."
          />
        </fieldset>
      </Card>
      <Card
        title="Return photos"
        detail="Four exterior views and a dedicated dashboard photo are required for the return copy. Extra photos do not replace the dashboard photo."
      >
        <div className="r-grid">
          {(
            [
              "returnFront",
              "returnRear",
              "returnDriver",
              "returnPassenger",
              "returnDashboard",
              "returnExtra",
            ] as const
          ).map(kind => (
            <PhotoUpload
              key={kind}
              kind={kind}
              label={
                {
                  returnFront: "Return front",
                  returnRear: "Return rear",
                  returnDriver: "Return driver side",
                  returnPassenger: "Return passenger side",
                  returnDashboard: "Return dashboard (required)",
                  returnExtra: "Additional return photos",
                }[kind]
              }
              guidance={kind === "returnDashboard" ? "While parked, turn ignition on and capture entire instrument cluster clearly: odometer, fuel and warning lights." : undefined}
              assets={record.assets}
              upload={upload}
              disabled={locked || busy}
            />
          ))}
        </div>
      </Card>
      <Card title="Pickup / return comparison">
        <Walkaround
          condition={data.condition}
          comparison={record.draft.condition}
          onChange={value => set("condition", value)}
          disabled={locked || busy}
        />
      </Card>
      <Card
        title="Return charges"
        detail="Recorded amounts are a calculation, not a payment transaction. No damage is automatically charged."
      >
        <fieldset disabled={locked || busy}>
          <div className="r-grid">
            {(
              ["tolls", "parking", "fines", "cleaning", "roadside"] as const
            ).map(key => (
              <Field
                key={key}
                label={
                  {
                    tolls: "Tolls ($)",
                    parking: "Parking ($)",
                    fines: "Citations / fines ($)",
                    cleaning: "Actual cleaning cost ($)",
                    roadside: "Actual roadside cost ($)",
                  }[key]
                }
                type="number"
                min="0"
                step=".01"
                value={data[key]}
                onChange={e => set(key, Number(e.target.value))}
              />
            ))}
            <Field
              label="Research / processing events"
              type="number"
              min="0"
              max="100"
              step="1"
              value={data.researchEvents}
              onChange={e => set("researchEvents", Number(e.target.value))}
            />
            <Field
              label="Loss-of-use days"
              type="number"
              min="0"
              max="3660"
              step="1"
              value={data.lossOfUseDays}
              onChange={e => set("lossOfUseDays", Number(e.target.value))}
            />
          </div>
          <Check
            label="Renter is responsible for loss of use"
            checked={data.lossOfUseResponsible}
            onChange={v => set("lossOfUseResponsible", v)}
          />
          <Note
            label="Damage: written notice amount, basis and delivery record (not auto-charged)"
            value={data.damageNoticeNotes}
            onChange={v => set("damageNoticeNotes", v)}
          />
          <Note
            label="Return notes"
            value={data.notes}
            onChange={v => set("notes", v)}
          />
          <p className="r-guidance">Claims confirms posted and settled charges separately after the signed return is completed. This draft does not process a payment or release the hold.</p>
        </fieldset>
        {charges && (
          <div className="r-charge-summary">
            <dl>
              <dt>
                Protection · {charges.days} days at {money(charges.daily)}
              </dt>
              <dd>{money(charges.protection)}</dd>
              <dt>Late · {charges.lateDays} calendar days</dt>
              <dd>{money(charges.late)}</dd>
              <dt>Research / processing</dt>
              <dd>{money(charges.research)}</dd>
              <dt>Loss of use</dt>
              <dd>{money(charges.lossOfUse)}</dd>
              <dt>Tolls, parking, fines, cleaning & roadside</dt>
              <dd>
                {money(
                  charges.tolls +
                    charges.parking +
                    charges.fines +
                    charges.cleaning +
                    charges.roadside
                )}
              </dd>
              <dt className="r-total">Total recorded charges</dt>
              <dd className="r-total">{money(charges.total)}</dd>
            </dl>
            <p>
              Security hold: {money(charges.securityHold)}. Release in the
              payment system only after the return and settlement. This app does
              not release the hold or process any charge.
            </p>
          </div>
        )}
      </Card>
      <Card title="Return acknowledgment signatures">
        <Field
          label="Return representative full name"
          value={data.representativeName}
          disabled={locked || busy}
          onChange={e => set("representativeName", e.target.value)}
        />
        <div className="r-grid">
          <SignaturePad
            kind="returnRenterSignature"
            label="Renter return signature"
            name={record.draft.renterName}
            assets={currentAssets}
            upload={uploadReturnSignature}
            disabled={locked || busy}
          />
          <SignaturePad
            kind="returnRepresentativeSignature"
            label="Representative return signature"
            name={data.representativeName}
            assets={currentAssets}
            upload={uploadReturnSignature}
            disabled={locked || busy}
          />
        </div>
      </Card>
      {!locked && (
        <Card title="Complete the return">
          {missing.length ? (
            <ul className="r-missing">
              {missing.map(m => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <p>Required return evidence is ready.</p>
          )}
          <button
            type="button"
            className="r-button r-primary"
            disabled={busy || !!missing.length || autosave.state === "error" || autosave.state === "conflict"}
            onClick={() => void finish()}
          >
            {busy ? "Recording return…" : "Complete return & email copy"}
          </button>
        </Card>
      )}
      {record.status === "Returned" && session.actor?.role !== "shop" && (
        <Card
          title="Close the rental"
          detail="Claims or Admin may close after charges have been confirmed settled."
        >
          {!record.returnData?.chargesSettled && <>
            <Check label="I confirm charges were posted and settled in the separate payment system" checked={settlementConfirmed} onChange={setSettlementConfirmed} />
            <button type="button" className="r-button" disabled={busy || !settlementConfirmed} onClick={async () => {
              setBusy(true); setError("");
              try { await settle.mutateAsync({ id: record.id, revision: record.revision, confirmed: true }); await refresh(); setNotice("Settlement confirmation recorded. The signed return PDF remains unchanged."); }
              catch (e) { setError(errorMessage(e)); }
              finally { setBusy(false); }
            }}>Confirm charges posted and settled</button>
          </>}
          <button
            type="button"
            className="r-button r-primary"
            disabled={busy || !record.returnData?.chargesSettled}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await close.mutateAsync({
                  id: record.id,
                  revision: record.revision,
                });
                await refresh();
                setNotice("Rental closed.");
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark charges posted & close
          </button>
          {!record.returnData?.chargesSettled && (
            <p className="r-guidance">
              Charges must be confirmed settled in the return record before
              closing.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
