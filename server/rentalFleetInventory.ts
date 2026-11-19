import { TRPCError } from "@trpc/server";
import type { RentalActor, RentalInventorySource } from "../shared/rentalHandoff";
import type { RentalRepository, RentalRows } from "./rentalHandoffService";
import { RENTAL_DEMO_VIN, RENTAL_FLEET_CACHE_MS, type FleetSnapshot } from "./rentalFleetSource";

export class RentalFleetInventory {
  status: RentalInventorySource;
  private lastAttempt = 0;
  private running: Promise<RentalInventorySource> | null = null;
  constructor(private read: (() => Promise<FleetSnapshot>) | undefined, private now: () => number) {
    this.status = { enabled: !!read, pending: !!read, updatedAt: null, available: 0, excluded: 0, error: null };
  }
  async fresh(): Promise<FleetSnapshot> {
    try {
      if (!this.read) throw new Error("Fleet reader unavailable");
      const snapshot = await this.read();
      if (!Number.isFinite(snapshot.checkedAt) || snapshot.checkedAt > this.now() + 5000 || snapshot.checkedAt < this.now() - 30000) throw new Error("Fleet verification stale");
      return snapshot;
    } catch {
      this.status = { ...this.status, pending: !this.status.updatedAt, error: "Fleet refresh failed. Sheet vehicles cannot start a new pickup until a fresh read succeeds. Manual inventory remains independent." };
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: this.status.error! });
    }
  }
  async verify(vehicle: RentalRows["vehicles"], snapshot?: FleetSnapshot) {
    if (vehicle.source !== "sheet") return;
    const current = snapshot ?? await this.fresh();
    const matches = current.vehicles.filter(v => v.vin === vehicle.vin);
    if (matches.length !== 1 || !matches[0].usable || current.unsafeVins.includes(vehicle.vin)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This sheet vehicle is no longer exactly Available or has unsafe source data. Reload inventory and choose another vehicle." });
  }
  async refresh(repo: RentalRepository, actor: RentalActor, audit: (repo: RentalRepository, actor: RentalActor, rentalId: number | null, action: string, detail: unknown) => Promise<void>, explicit = false): Promise<RentalInventorySource> {
    if (!this.read) return this.status;
    if (this.running) { await this.running; if (!explicit) return this.status; }
    if (!explicit && this.lastAttempt && this.now() - this.lastAttempt < RENTAL_FLEET_CACHE_MS) return this.status;
    this.lastAttempt = this.now();
    this.running = this.perform(repo, actor, audit, explicit).finally(() => { this.running = null; });
    return this.running;
  }
  private async perform(repo: RentalRepository, actor: RentalActor, audit: (repo: RentalRepository, actor: RentalActor, rentalId: number | null, action: string, detail: unknown) => Promise<void>, explicit: boolean) {
    try {
      const snapshot = await this.fresh();
      await repo.transaction(async tx => {
        const locations = await tx.find("locations", { eq: { active: true }, limit: 5001 });
        const inventory = await tx.find("vehicles", { limit: 5001, lock: true });
        if (inventory.length >= 5001 || locations.length >= 5001) throw new Error("Inventory limit exceeded");
        const byVin = new Map(inventory.map(v => [v.vin.toUpperCase(), v]));
        const seen = new Set<string>(); let inserted = 0, updated = 0;
        for (const source of snapshot.vehicles) {
          if (seen.has(source.vin) || source.vin === RENTAL_DEMO_VIN) continue;
          seen.add(source.vin);
          const old = byVin.get(source.vin);
          // Never add non-Available vehicles; already-linked rows retain only source safety metadata.
          if (!old && !source.usable) continue;
          const matches = source.location && ["Rockville", "Laurel"].includes(source.location) ? locations.filter(l => l.name === source.location) : [];
          const locationId = matches.length === 1 ? matches[0].id : 0;
          const sourceLocationIssue = source.locationMalformed || (!!source.location && !locationId);
          const metadata = { source: "sheet", sourceAvailable: source.usable, sourceStatus: snapshot.unsafeVins.includes(source.vin) ? "Unsafe" : source.status, sourceCheckedAt: snapshot.checkedAt, sourceRow: source.row, sourceLocationIssue };
          if (old) {
            if (old.isDemo || old.source === "demo") continue;
            // Existing assignments, signed history, measured odometer and identity details are never rewritten.
            await tx.update("vehicles", { eq: { id: old.id } }, metadata); updated++;
          } else {
            await tx.insert("vehicles", { locationId, ymm: source.ymm, vin: source.vin, plate: source.plate, lastOdometer: 0, active: true, isDemo: false, ...metadata }); inserted++;
          }
        }
        for (const old of inventory) if (old.source === "sheet" && !seen.has(old.vin.toUpperCase())) {
          await tx.update("vehicles", { eq: { id: old.id } }, { sourceAvailable: false, sourceStatus: "Missing", sourceCheckedAt: snapshot.checkedAt, sourceRow: null }); updated++;
        }
        let demoCreated = false;
        if (explicit) {
          const demos = inventory.filter(v => v.isDemo || v.source === "demo");
          const existing = byVin.get(RENTAL_DEMO_VIN);
          if (demos.some(v => v.vin !== RENTAL_DEMO_VIN) || (existing && !existing.isDemo && existing.source !== "demo")) throw new Error("Demo inventory collision");
          if (!existing) { await tx.insert("vehicles", { locationId: 0, ymm: "2026 Fictional Demo Sedan", vin: RENTAL_DEMO_VIN, plate: "DEMO ONLY", lastOdometer: 0, active: true, source: "demo", isDemo: true, sourceAvailable: null, sourceStatus: "Demo only", sourceCheckedAt: null, sourceRow: null, sourceLocationIssue: false }); demoCreated = true; }
        }
        // No source customer values, raw tab data, credentials or VINs in audits.
        await audit(tx, actor, null, "fleet.sync", { checkedAt: snapshot.checkedAt, rows: snapshot.rows, available: snapshot.available, excluded: snapshot.excluded, inserted, updated, demoCreated });
      });
      this.status = { enabled: true, pending: false, updatedAt: snapshot.checkedAt, available: snapshot.available, excluded: snapshot.excluded, error: null };
    } catch {
      this.status = { ...this.status, pending: !this.status.updatedAt, error: "Fleet refresh failed. Displayed sheet inventory is stale; new sheet pickups require a successful fresh check. No source writes were made." };
    }
    return this.status;
  }
}
