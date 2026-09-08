import { describe, expect, it } from "vitest";
import {
  MAILBOT_FEATURE_SETTING,
  MAILROOM_FEATURE_SETTING,
  isFeatureSettingEnabled,
  mapMailFeatureControls,
} from "./featureControls.js";

describe("Mail feature controls", () => {
  it("defaults a missing setting to enabled so existing installations remain compatible", () => {
    expect(isFeatureSettingEnabled(undefined)).toBe(true);
    expect(mapMailFeatureControls([])).toEqual({ mailroomEnabled: true, mailBotEnabled: true });
  });

  it("recognizes the persisted false values used to temporarily disable features", () => {
    expect(isFeatureSettingEnabled("false")).toBe(false);
    expect(isFeatureSettingEnabled("OFF")).toBe(false);
    expect(mapMailFeatureControls([
      { key: MAILROOM_FEATURE_SETTING, value: "false" },
      { key: MAILBOT_FEATURE_SETTING, value: "false" },
    ])).toEqual({ mailroomEnabled: false, mailBotEnabled: false });
  });
});
