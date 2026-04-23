import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module
vi.mock("./db", () => ({
  getIntakeRecords: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  getIntakeRecordById: vi.fn().mockResolvedValue(undefined),
  updateIntakeRecord: vi.fn().mockResolvedValue(undefined),
  createIntakeRecord: vi.fn().mockResolvedValue(42),
  getIntakeAnalytics: vi.fn().mockResolvedValue({
    byCallerType: [],
    byStatus: [],
    byDay: [],
    repeatCallers: [],
  }),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@drivewhip.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("intake.list", () => {
  it("returns empty records list when no data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.list({ limit: 10, offset: 0 });
    expect(result).toEqual({ records: [], total: 0 });
  });

  it("accepts status filter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.list({ status: "open", limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });

  it("accepts callerType filter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.list({ callerType: "carrier", limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });
});

describe("intake.create", () => {
  it("creates a manual intake record and returns an id", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.create({
      callerType: "carrier",
      callerName: "John Smith",
      organization: "State Farm",
      whipClaimNumber: "MD-1234-567890",
      callPurpose: "Status check",
      message: "Calling about liability limits",
      callbackPhone: "555-000-1234",
      callbackEmail: "john@statefarm.com",
      assignedHandler: "Natasha",
    });
    expect(result).toEqual({ id: 42 });
  });
});

describe("intake.update", () => {
  it("updates a record status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.update({ id: 1, status: "closed" });
    expect(result).toEqual({ success: true });
  });
});

describe("intake.analytics", () => {
  it("returns analytics structure", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.analytics();
    expect(result).toHaveProperty("byCallerType");
    expect(result).toHaveProperty("byStatus");
    expect(result).toHaveProperty("byDay");
    expect(result).toHaveProperty("repeatCallers");
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});
