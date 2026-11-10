import type {
  RentalActor,
  RentalDraft,
  RentalLocation,
  RentalRates,
  RentalReturn,
  RentalVehicle,
  LaunchSettings,
} from "@shared/rentalHandoff";
import type { AssetWithUrl } from "./Media";
export type RentalSession = {
  actor: RentalActor | null;
  settings: LaunchSettings;
  locations: RentalLocation[];
  vehicles: RentalVehicle[];
  launchGaps: string[];
  sender?: { connected: boolean; email?: string | null; configured?: boolean };
};
export type RentalRow = {
  id: number;
  status: "Scheduled" | "Out" | "Returned" | "Closed";
  revision: number;
  locationId: number;
  vehicleId: number;
  draft: RentalDraft;
  updatedAt: number | Date | string;
};
export type RentalPacket = {
  id: number;
  kind: string;
  version: number;
  createdAt: number | string | Date;
  url: string;
};
export type RentalRecord = Omit<
  RentalRow,
  "locationId" | "vehicleId" | "updatedAt"
> & {
  activePacketId: number | null;
  rates: RentalRates;
  assets: AssetWithUrl[];
  packets: RentalPacket[];
  emails: {
    id?: number;
    status: string;
    to?: string;
    recipient?: string;
    createdAt?: number | string | Date;
    sentAt?: number | string | Date;
    error?: string | null;
  }[];
  audit: {
    id?: number;
    action?: string;
    what?: string;
    actorName?: string;
    actorKey?: string;
    createdAt?: number | string | Date;
    detail?: unknown;
  }[];
  returnData: RentalReturn | null;
};
