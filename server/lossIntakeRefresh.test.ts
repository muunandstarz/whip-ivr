import { describe, expect, it } from "vitest";
import { easternScheduledRefreshSlot } from "./lossIntakeRefresh";

describe("Loss Intake business-day refresh schedule", () => {
  it("admits only the four Eastern weekday refresh slots", () => {
    expect(easternScheduledRefreshSlot(new Date("2026-09-21T12:00:00.000Z"))).toBe(true); // Mon 8 AM ET
    expect(easternScheduledRefreshSlot(new Date("2026-09-21T15:00:00.000Z"))).toBe(true); // Mon 11 AM ET
    expect(easternScheduledRefreshSlot(new Date("2026-09-21T18:00:00.000Z"))).toBe(true); // Mon 2 PM ET
    expect(easternScheduledRefreshSlot(new Date("2026-09-21T21:00:00.000Z"))).toBe(true); // Mon 5 PM ET
    expect(easternScheduledRefreshSlot(new Date("2026-09-21T16:00:00.000Z"))).toBe(false);
    expect(easternScheduledRefreshSlot(new Date("2026-09-19T12:00:00.000Z"))).toBe(false); // Saturday
  });
});
