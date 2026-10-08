import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "DashboardAnnouncementCard.tsx"), "utf8");

describe("DashboardAnnouncementCard weekly recap", () => {
  it("renders non-primary feature updates in a weekly dashboard section", () => {
    expect(source).toContain("This week’s updates");
    expect(source).toContain("data?.weeklyUpdates");
    expect(source).toContain("item.id !== current?.id");
  });

  it("explains the 48-hour lead and weekly recap to administrators", () => {
    expect(source).toContain("stays in this week’s updates");
    expect(source).toContain("weekly recap");
  });
});
