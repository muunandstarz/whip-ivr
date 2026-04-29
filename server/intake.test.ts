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
    byHandler: [],
    byPriority: [],
  }),
  getCallHistory: vi.fn().mockResolvedValue({ calls: [], total: 0 }),
  getCallHistoryAnalytics: vi.fn().mockResolvedValue({
    byStatus: [],
    byAgent: [],
    byDay: [],
    answerRateByDay: [],
  }),
  getQaScores: vi.fn().mockResolvedValue([]),
  getQaAgentSummary: vi.fn().mockResolvedValue([]),
  getHandlers: vi.fn().mockResolvedValue([]),
  getRepeatCallers: vi.fn().mockResolvedValue([]),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  resolveHandlerName: vi.fn().mockImplementation((name: string | null | undefined) => Promise.resolve(name ?? undefined)),
  linkUserToHandler: vi.fn().mockResolvedValue(undefined),
  applyPreAuth: vi.fn().mockResolvedValue(undefined),
  listPreAuthorizations: vi.fn().mockResolvedValue([]),
  addPreAuthorization: vi.fn().mockResolvedValue({ id: 1 }),
  removePreAuthorization: vi.fn().mockResolvedValue(undefined),
  logCallback: vi.fn().mockResolvedValue(undefined),
  getCallbackLogs: vi.fn().mockResolvedValue([]),
  getFullCallAnalytics: vi.fn().mockResolvedValue({ totals: {}, byDay: [], byAgent: [], byHour: [], byDirection: [] }),
  getHandlerCallMetrics: vi.fn().mockResolvedValue({ totalCalls: 0, answeredCalls: 0, avgDuration: 0, missedCalls: 0 }),
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

  it("accepts handlerName filter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.list({ handlerName: "Natasha", limit: 10, offset: 0 });
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
      callerOrg: "State Farm",
      whipClaimNumber: "MD-1234-567890-123456",
      message: "Calling about liability limits",
      callbackPhone: "555-000-1234",
      callbackEmail: "john@statefarm.com",
      handlerName: "Natasha",
    });
    expect(result).toEqual({ id: 42 });
  });

  it("creates a law office intake record", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.create({
      callerType: "law_office",
      callerName: "Jane Doe",
      callerOrg: "Smith & Associates",
      message: "Requesting claim documents",
      callbackPhone: "555-111-2222",
      handlerName: "Jayla",
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

  it("updates handler assignment", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.update({ id: 1, handlerName: "Jayla" });
    expect(result).toEqual({ success: true });
  });

  it("updates priority", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.intake.update({ id: 1, priority: "urgent" });
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
    expect(result).toHaveProperty("byHandler");
    expect(result).toHaveProperty("byPriority");
  });
});

describe("calls.list", () => {
  it("returns empty calls list when no data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calls.list({ limit: 10, offset: 0 });
    expect(result).toEqual({ calls: [], total: 0 });
  });

  it("accepts status filter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calls.list({ status: "answered", limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });
});

describe("calls.analytics", () => {
  it("returns call analytics structure", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calls.analytics();
    expect(result).toHaveProperty("byStatus");
    expect(result).toHaveProperty("byAgent");
    expect(result).toHaveProperty("byDay");
  });
});

describe("handlers.list", () => {
  it("returns empty handlers list", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.handlers.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("qa.agentSummary", () => {
  it("returns empty QA summary", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.qa.agentSummary();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("callers.repeats", () => {
  it("returns empty repeat callers list", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.callers.repeats();
    expect(Array.isArray(result)).toBe(true);
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
