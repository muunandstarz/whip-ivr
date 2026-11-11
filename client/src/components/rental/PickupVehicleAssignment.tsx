import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { RentalVehicle } from "@shared/rentalHandoff";
import { Card, ErrorNotice, Field, Select, errorMessage } from "./Controls";

export function PickupVehicleAssignment({ id, locationId, vehicles, beforeAssign, onAssigned, disabled }: {
  id: number; locationId: number; vehicles: RentalVehicle[]; beforeAssign: () => Promise<number>;
  onAssigned: () => Promise<void>; disabled?: boolean;
}) {
  const assign = trpc.rentalHandoff.assignVehicle.useMutation();
  const decode = trpc.rentalHandoff.decodeVin.useMutation();
  const [mode, setMode] = useState<"inventory" | "manual">(vehicles.some(v => v.locationId === locationId && v.status === "Available") ? "inventory" : "manual");
  const [vehicleId, setVehicleId] = useState(0);
  const [vehicle, setVehicle] = useState({ ymm: "", vin: "", plate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = mode === "inventory" ? vehicleId > 0 : /^(?:19|20)\d{2}\s+\S+\s+\S.*$/.test(vehicle.ymm.trim()) && /^[A-HJ-NPR-Z0-9]{17}$/.test(vehicle.vin);
  return <Card title="Assign the pickup rental vehicle" detail="Claims scheduled the appointment without a vehicle. Assign the actual rental here before completing pickup; license plate is optional.">
    <ErrorNotice message={error} />
    <fieldset disabled={disabled || busy}>
      <div className="r-filters" aria-label="Pickup vehicle assignment method">
        <button type="button" className="r-chip" aria-pressed={mode === "inventory"} onClick={() => setMode("inventory")}>Choose inventory</button>
        <button type="button" className="r-chip" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>Enter pickup vehicle</button>
      </div>
      {mode === "inventory" ? <Select label="Available pickup vehicle" value={vehicleId || ""} onChange={e => setVehicleId(Number(e.target.value))}>
        <option value="">Choose vehicle</option>
        {vehicles.filter(v => v.locationId === locationId && v.status === "Available").map(v => <option key={v.id} value={v.id}>{v.ymm} · VIN {v.vin.slice(-6)}{v.plate ? ` · ${v.plate}` : ""}</option>)}
      </Select> : <div className="r-grid">
        <Field label="Pickup rental VIN" value={vehicle.vin} maxLength={17} onChange={e => setVehicle({ ...vehicle, vin: e.target.value.toUpperCase() })} />
        <button type="button" className="r-button" disabled={decode.isPending || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vehicle.vin)} onClick={async () => {
          setError(""); const vin = vehicle.vin;
          try { const result = await decode.mutateAsync({ vin }); setVehicle(current => current.vin === vin ? { ...current, ymm: `${result.year} ${result.make} ${result.model}` } : current); }
          catch (e) { setError(errorMessage(e)); }
        }}>{decode.isPending ? "Decoding…" : "Decode pickup VIN"}</button>
        <Field label="Pickup rental year, make and model" value={vehicle.ymm} maxLength={120} onChange={e => setVehicle({ ...vehicle, ymm: e.target.value })} />
        <Field label="Pickup rental license plate (optional)" value={vehicle.plate} maxLength={30} onChange={e => setVehicle({ ...vehicle, plate: e.target.value })} />
      </div>}
      <button type="button" className="r-button r-primary" disabled={!ready || busy || disabled} onClick={async () => {
        setError(""); setBusy(true);
        try { const revision = await beforeAssign(); await assign.mutateAsync({ id, revision, ...(mode === "inventory" ? { vehicleId } : { vehicle }) }); await onAssigned(); }
        catch (e) { setError(errorMessage(e)); }
        finally { setBusy(false); }
      }}>{busy ? "Assigning…" : "Assign pickup vehicle"}</button>
    </fieldset>
  </Card>;
}
