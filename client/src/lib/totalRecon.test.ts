import { describe, expect, it } from "vitest";
import { directionsUrl, findTotalReconFallback, rankTotalReconShops, TOTAL_RECON_PITCH, TOTAL_RECON_SHOPS } from "./totalRecon";

describe("Total Recon repair guidance", () => {
  it("preserves the approved claimant pitch and loaner qualification language", () => {
    expect(TOTAL_RECON_PITCH).toContain("certified partner shop in Maryland");
    expect(TOTAL_RECON_PITCH).toContain("comprehensive and collision coverage");
    expect(TOTAL_RECON_PITCH).toContain("Would you like me to get that scheduled for you?");
  });

  it("keeps both Total Recon facilities with official addresses and phone numbers", () => {
    expect(TOTAL_RECON_SHOPS.map((shop) => shop.address)).toEqual([
      "3521 Whiskey Bottom Rd, Laurel, MD 20724",
      "627 Southlawn Lane, Rockville, MD 20850",
    ]);
    expect(TOTAL_RECON_SHOPS.map((shop) => shop.phone)).toEqual(["(301) 762-2195", "(301) 762-2195"]);
  });

  it("recommends Rockville for Rockville and Laurel for Laurel", () => {
    expect(rankTotalReconShops({ lat: 39.0855, lng: -77.1545 })[0].id).toBe("rockville");
    expect(rankTotalReconShops({ lat: 39.0993, lng: -76.8483 })[0].id).toBe("laurel");
  });

  it("uses a local ZIP or city fallback whenever maps geocoding is unavailable", () => {
    expect(findTotalReconFallback("20850")?.label).toBe("ZIP 20850");
    expect(findTotalReconFallback("123 Example Road, Baltimore, MD")?.label).toBe("Baltimore, MD");
    expect(findTotalReconFallback("not a covered local location")).toBeNull();
  });

  it("builds a routable directions URL from the claimant to the selected shop", () => {
    const url = directionsUrl({ lat: 39.084, lng: -77.1528 }, TOTAL_RECON_SHOPS[0]);
    expect(url).toContain("origin=39.084,-77.1528");
    expect(url).toContain("destination=3521%20Whiskey%20Bottom%20Rd%2C%20Laurel%2C%20MD%2020724");
  });
});
