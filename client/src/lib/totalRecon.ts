export type GeoPoint = {
  lat: number;
  lng: number;
  label: string;
};

export type TotalReconShop = GeoPoint & {
  id: "laurel" | "rockville";
  name: string;
  address: string;
  streetAddress: string;
  phone: string;
  hours: string;
  contact: string;
  markets: string;
};

export const TOTAL_RECON_PITCH = `We work with a certified partner shop in Maryland that handles all of our vehicle repairs. If you'd like, we can route your repair directly through them — it's a simple drop-off, no coordination needed on your end. They're familiar with our claims process, which typically makes things move faster than going through an outside shop.

If you need a vehicle while yours is being repaired, we can also arrange a loaner at no charge — as long as you have active auto insurance that includes comprehensive and collision coverage. We'll just need to verify that before we set it up.

Would you like me to get that scheduled for you?`;

export const TOTAL_RECON_SHOPS: TotalReconShop[] = [
  {
    id: "laurel",
    name: "Total Recon — Laurel",
    streetAddress: "3521 Whiskey Bottom Rd",
    address: "3521 Whiskey Bottom Rd, Laurel, MD 20724",
    phone: "(301) 762-2195",
    lat: 39.0884,
    lng: -76.873,
    hours: "Mon–Fri 8 AM–6 PM · Sat 8 AM–12 PM",
    contact: "Sebastian & Rafael via Slack",
    markets: "Rockville · Glen Burnie",
    label: "Laurel, MD 20724",
  },
  {
    id: "rockville",
    name: "Total Recon — Rockville",
    streetAddress: "627 Southlawn Lane",
    address: "627 Southlawn Lane, Rockville, MD 20850",
    phone: "(301) 762-2195",
    lat: 39.0855,
    lng: -77.1545,
    hours: "Mon–Fri 8 AM–6 PM · Sat 8 AM–12 PM",
    contact: "Sebastian & Rafael via Slack",
    markets: "Rockville · Glen Burnie",
    label: "Rockville, MD 20850",
  },
];

export type RankedTotalReconShop = TotalReconShop & {
  distanceMiles: number;
};

const FALLBACK_LOCATIONS: Record<string, GeoPoint> = {
  "20601": { lat: 38.5674, lng: -76.9994, label: "ZIP 20601" },
  "20705": { lat: 38.9918, lng: -76.9236, label: "ZIP 20705" },
  "20706": { lat: 38.9418, lng: -76.8036, label: "ZIP 20706" },
  "20707": { lat: 39.0543, lng: -76.9736, label: "ZIP 20707" },
  "20708": { lat: 39.0518, lng: -76.9236, label: "ZIP 20708" },
  "20720": { lat: 38.9843, lng: -76.8036, label: "ZIP 20720" },
  "20724": { lat: 39.0884, lng: -76.873, label: "ZIP 20724" },
  "20740": { lat: 38.9818, lng: -76.9386, label: "ZIP 20740" },
  "20774": { lat: 38.8643, lng: -76.7836, label: "ZIP 20774" },
  "20810": { lat: 38.9818, lng: -77.0986, label: "ZIP 20810" },
  "20814": { lat: 38.9843, lng: -77.1036, label: "ZIP 20814" },
  "20815": { lat: 38.9693, lng: -77.0786, label: "ZIP 20815" },
  "20816": { lat: 38.9418, lng: -77.1186, label: "ZIP 20816" },
  "20817": { lat: 38.9793, lng: -77.1436, label: "ZIP 20817" },
  "20818": { lat: 38.9668, lng: -77.1536, label: "ZIP 20818" },
  "20850": { lat: 39.0855, lng: -77.1545, label: "ZIP 20850" },
  "20851": { lat: 39.1068, lng: -77.1411, label: "ZIP 20851" },
  "20852": { lat: 39.0468, lng: -77.1261, label: "ZIP 20852" },
  "20854": { lat: 39.0318, lng: -77.1886, label: "ZIP 20854" },
  "20878": { lat: 39.1068, lng: -77.2086, label: "ZIP 20878" },
  "20901": { lat: 39.0168, lng: -77.0186, label: "ZIP 20901" },
  "20910": { lat: 38.9968, lng: -77.0311, label: "ZIP 20910" },
  "20912": { lat: 38.9818, lng: -76.9911, label: "ZIP 20912" },
  "21060": { lat: 39.1668, lng: -76.6286, label: "ZIP 21060" },
  "21061": { lat: 39.1543, lng: -76.6236, label: "ZIP 21061" },
  "21075": { lat: 39.1968, lng: -76.7986, label: "ZIP 21075" },
  "21076": { lat: 39.1718, lng: -76.7636, label: "ZIP 21076" },
  "21113": { lat: 39.0768, lng: -76.6786, label: "ZIP 21113" },
  "21122": { lat: 39.1018, lng: -76.5636, label: "ZIP 21122" },
  "21201": { lat: 39.2918, lng: -76.6236, label: "ZIP 21201" },
  "21202": { lat: 39.2968, lng: -76.6036, label: "ZIP 21202" },
  "21224": { lat: 39.2768, lng: -76.5636, label: "ZIP 21224" },
  "20001": { lat: 38.9126, lng: -77.0197, label: "ZIP 20001" },
  "20002": { lat: 38.8976, lng: -76.9897, label: "ZIP 20002" },
  "20003": { lat: 38.8826, lng: -76.9947, label: "ZIP 20003" },
  "20007": { lat: 38.9126, lng: -77.0747, label: "ZIP 20007" },
  "20008": { lat: 38.9376, lng: -77.0597, label: "ZIP 20008" },
  "20009": { lat: 38.9026, lng: -77.0347, label: "ZIP 20009" },
  "20010": { lat: 38.9326, lng: -77.0297, label: "ZIP 20010" },
  "20011": { lat: 38.9526, lng: -77.0097, label: "ZIP 20011" },
  "20012": { lat: 38.9776, lng: -77.0297, label: "ZIP 20012" },
  "20015": { lat: 38.9776, lng: -77.0647, label: "ZIP 20015" },
  "22003": { lat: 38.8318, lng: -77.1936, label: "ZIP 22003" },
  "22030": { lat: 38.8493, lng: -77.3036, label: "ZIP 22030" },
  "22031": { lat: 38.8593, lng: -77.2486, label: "ZIP 22031" },
  "22101": { lat: 38.9393, lng: -77.1536, label: "ZIP 22101" },
  "22201": { lat: 38.8843, lng: -77.0986, label: "ZIP 22201" },
};

const CITY_FALLBACKS: Array<[string, GeoPoint]> = [
  ["silver spring", { lat: 38.9957, lng: -77.0269, label: "Silver Spring, MD" }],
  ["glen burnie", { lat: 39.1543, lng: -76.6236, label: "Glen Burnie, MD" }],
  ["upper marlboro", { lat: 38.8193, lng: -76.7461, label: "Upper Marlboro, MD" }],
  ["college park", { lat: 38.9807, lng: -76.9369, label: "College Park, MD" }],
  ["ellicott city", { lat: 39.2668, lng: -76.7986, label: "Ellicott City, MD" }],
  ["falls church", { lat: 38.8843, lng: -77.1736, label: "Falls Church, VA" }],
  ["chevy chase", { lat: 38.9693, lng: -77.0786, label: "Chevy Chase, MD" }],
  ["capitol heights", { lat: 38.8843, lng: -76.9136, label: "Capitol Heights, MD" }],
  ["district heights", { lat: 38.8568, lng: -76.8936, label: "District Heights, MD" }],
  ["rockville", { lat: 39.084, lng: -77.1528, label: "Rockville, MD" }],
  ["gaithersburg", { lat: 39.1434, lng: -77.2014, label: "Gaithersburg, MD" }],
  ["germantown", { lat: 39.1731, lng: -77.2719, label: "Germantown, MD" }],
  ["bethesda", { lat: 38.9807, lng: -77.1001, label: "Bethesda, MD" }],
  ["potomac", { lat: 39.0218, lng: -77.1886, label: "Potomac, MD" }],
  ["laurel", { lat: 39.0993, lng: -76.8483, label: "Laurel, MD" }],
  ["bowie", { lat: 38.9418, lng: -76.7311, label: "Bowie, MD" }],
  ["hyattsville", { lat: 38.9568, lng: -76.9486, label: "Hyattsville, MD" }],
  ["greenbelt", { lat: 39.0043, lng: -76.8761, label: "Greenbelt, MD" }],
  ["waldorf", { lat: 38.6293, lng: -76.9186, label: "Waldorf, MD" }],
  ["annapolis", { lat: 38.9784, lng: -76.4922, label: "Annapolis, MD" }],
  ["columbia", { lat: 39.2037, lng: -76.861, label: "Columbia, MD" }],
  ["baltimore", { lat: 39.2918, lng: -76.6136, label: "Baltimore, MD" }],
  ["arlington", { lat: 38.88, lng: -77.1089, label: "Arlington, VA" }],
  ["alexandria", { lat: 38.8048, lng: -77.0469, label: "Alexandria, VA" }],
  ["fairfax", { lat: 38.8493, lng: -77.3036, label: "Fairfax, VA" }],
  ["reston", { lat: 38.9593, lng: -77.3536, label: "Reston, VA" }],
  ["herndon", { lat: 38.9693, lng: -77.3836, label: "Herndon, VA" }],
  ["vienna", { lat: 38.9018, lng: -77.2636, label: "Vienna, VA" }],
  ["mclean", { lat: 38.9393, lng: -77.1886, label: "McLean, VA" }],
  ["springfield", { lat: 38.7893, lng: -77.1836, label: "Springfield, VA" }],
  ["washington", { lat: 38.9072, lng: -77.0369, label: "Washington, DC" }],
  ["dc", { lat: 38.9072, lng: -77.0369, label: "Washington, DC" }],
  ["clinton", { lat: 38.7643, lng: -76.8636, label: "Clinton, MD" }],
  ["oxon hill", { lat: 38.8018, lng: -76.9986, label: "Oxon Hill, MD" }],
  ["suitland", { lat: 38.8518, lng: -76.9236, label: "Suitland, MD" }],
  ["landover", { lat: 38.9218, lng: -76.8836, label: "Landover, MD" }],
  ["largo", { lat: 38.8843, lng: -76.7836, label: "Largo, MD" }],
  ["temple hills", { lat: 38.8118, lng: -76.9436, label: "Temple Hills, MD" }],
];

export function haversineMiles(from: Pick<GeoPoint, "lat" | "lng">, to: Pick<GeoPoint, "lat" | "lng">) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankTotalReconShops(origin: Pick<GeoPoint, "lat" | "lng">): RankedTotalReconShop[] {
  return TOTAL_RECON_SHOPS
    .map((shop) => ({ ...shop, distanceMiles: haversineMiles(origin, shop) }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

export function findTotalReconFallback(query: string): GeoPoint | null {
  const zip = query.match(/\b(\d{5})\b/)?.[1];
  if (zip && FALLBACK_LOCATIONS[zip]) return FALLBACK_LOCATIONS[zip];
  const normalized = query.trim().toLowerCase();
  return CITY_FALLBACKS.find(([city]) => normalized.includes(city))?.[1] ?? null;
}

export function directionsUrl(origin: Pick<GeoPoint, "lat" | "lng">, destination: TotalReconShop) {
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${encodeURIComponent(destination.address)}&travelmode=driving`;
}
