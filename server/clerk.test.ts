import { describe, it, expect } from "vitest";

describe("Manus OAuth configuration", () => {
  it("VITE_APP_ID is set in the environment", () => {
    expect(process.env.VITE_APP_ID).toBeDefined();
    expect(process.env.VITE_APP_ID?.length).toBeGreaterThan(0);
  });

  it("OAUTH_SERVER_URL is set in the environment", () => {
    expect(process.env.OAUTH_SERVER_URL).toBeDefined();
    expect(process.env.OAUTH_SERVER_URL?.startsWith("https://")).toBe(true);
  });

  it("JWT_SECRET is set in the environment", () => {
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET?.length).toBeGreaterThan(0);
  });
});
