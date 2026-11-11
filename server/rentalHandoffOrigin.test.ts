import { afterEach, describe, expect, it, vi } from "vitest";
import { requireSameOrigin } from "./rentalHandoffSecurity";

const request = (origin?: string, fetchSite = "same-origin", host = "internal-rental-service:3000", forwarded = "evil.example") => ({ headers: { origin, "sec-fetch-site": fetchSite, "x-forwarded-host": forwarded }, get: (name: string) => name === "host" ? host : undefined }) as any;
afterEach(() => vi.unstubAllEnvs());

describe("Rental production origin behind the managed gateway", () => {
  it("accepts only registered application HTTPS origins despite a rewritten internal Host", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("RENTAL_APP_ORIGIN", "");
    for (const origin of ["https://whipclaimsivr.com", "https://www.whipclaimsivr.com", "https://whipivr-tyswfku7.manus.space"]) expect(() => requireSameOrigin(request(origin))).not.toThrow();
  });
  it("rejects missing, cross-site, unregistered, HTTP, credential-bearing and path-bearing origins", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("RENTAL_APP_ORIGIN", "");
    for (const origin of [undefined, "https://evil.example", "http://whipclaimsivr.com", "https://user@whipclaimsivr.com", "https://whipclaimsivr.com/evil"]) expect(() => requireSameOrigin(request(origin))).toThrow(/same-origin/);
    expect(() => requireSameOrigin(request("https://whipclaimsivr.com", "cross-site"))).toThrow();
  });
  it("cannot be bypassed by a spoofed Host or forwarded Host", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("RENTAL_APP_ORIGIN", "");
    expect(() => requireSameOrigin(request("https://evil.example", "same-origin", "evil.example", "whipclaimsivr.com"))).toThrow();
  });
  it("retains an explicitly configured single-origin restriction and the local development host check", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("RENTAL_APP_ORIGIN", "https://whipclaimsivr.com");
    expect(() => requireSameOrigin(request("https://www.whipclaimsivr.com"))).toThrow();
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("RENTAL_APP_ORIGIN", "");
    expect(() => requireSameOrigin(request("http://localhost:3000", "same-origin", "localhost:3000"))).not.toThrow();
    expect(() => requireSameOrigin(request("https://evil.example", "same-origin", "localhost:3000"))).toThrow();
  });
});
