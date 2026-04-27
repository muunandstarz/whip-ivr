/**
 * Validates that SNAPSHEET_API_KEY and SNAPSHEET_API_SECRET are set and
 * that the Snapsheet API accepts them (returns 200 or 404, not 401/403).
 */
import { describe, it, expect } from "vitest";

describe("Snapsheet API credentials", () => {
  it("SNAPSHEET_API_KEY and SNAPSHEET_API_SECRET are set", () => {
    expect(process.env.SNAPSHEET_API_KEY).toBeTruthy();
    expect(process.env.SNAPSHEET_API_SECRET).toBeTruthy();
  });

  it("Snapsheet API responds with non-auth-error using the credentials", async () => {
    const key = process.env.SNAPSHEET_API_KEY!;
    const secret = process.env.SNAPSHEET_API_SECRET!;
    const baseUrl = process.env.SNAPSHEET_BASE_URL || "https://snapsheetvice.com";

    // Try Basic auth first
    const basicAuth = Buffer.from(`${key}:${secret}`).toString("base64");
    const res = await fetch(`${baseUrl}/api/v1/claims?limit=1`, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    });

    // 200 = success, 404 = endpoint exists but no results — both mean auth worked
    // 401/403 = wrong credentials
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  }, 10000);
});
