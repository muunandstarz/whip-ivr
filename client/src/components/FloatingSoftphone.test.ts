import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/components/FloatingSoftphone.tsx"),
  "utf8",
);

describe("FloatingSoftphone launcher", () => {
  it("is quiet and can be persistently dismissed", () => {
    expect(source).toContain('window.localStorage.getItem("whip.softphone.launcherDismissed")');
    expect(source).toContain('window.localStorage.setItem("whip.softphone.launcherDismissed", "true")');
    expect(source).toContain('const showLauncher = !isOnSoftphonePage && widgetOpen === false && !launcherDismissed');
    expect(source).toContain('aria-label="Dismiss quick phone"');
    expect(source).not.toContain("animate-pulse");
    expect(source).not.toContain("hover:scale-110");
  });
});
