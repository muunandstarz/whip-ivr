import { describe, expect, it } from "vitest";
import { isProcessorQueueMember, processorQueueInternals } from "./lossIntakeProcessorQueue";

const item = (overrides: Partial<Parameters<typeof isProcessorQueueMember>[0]> = {}) => ({
  vinLastSix: "650094",
  isDuplicate: false,
  channelName: "claims",
  processorStatus: "not_started" as const,
  processorFiledVisibleUntil: null,
  ...overrides,
});

describe("Loss Intake Processors queue", () => {
  const now = new Date("2026-09-18T16:00:00.000Z");

  it("uses only the filed-tab VIN membership rule and never treats a blank link as unfiled", () => {
    expect(isProcessorQueueMember(item(), new Set(["650094"]), new Set(), now)).toBe(false);
    expect(isProcessorQueueMember(item(), new Set(), new Set(), now)).toBe(true);
  });

  it("keeps five All Reported IncidentsStatus records out of the unreported list regardless of link data", () => {
    const filedVins = new Set(["111111", "222222", "333333", "444444", "555555"]);
    for (const vin of filedVins) {
      expect(isProcessorQueueMember(item({ vinLastSix: vin }), filedVins, new Set(), now)).toBe(false);
    }
  });

  it("excludes notices outside the three permitted Slack channels, duplicates, and processor exclusions", () => {
    expect(isProcessorQueueMember(item({ channelName: "claims-processing" }), new Set(), new Set(), now)).toBe(false);
    expect(isProcessorQueueMember(item({ isDuplicate: true }), new Set(), new Set(), now)).toBe(false);
    expect(isProcessorQueueMember(item(), new Set(), new Set(["650094"]), now)).toBe(false);
  });

  it("keeps a processor-confirmed Filed record visible only through today", () => {
    expect(isProcessorQueueMember(item({ processorStatus: "filed", processorFiledVisibleUntil: new Date("2026-09-18T23:59:59.000Z") }), new Set(), new Set(), now)).toBe(true);
    expect(isProcessorQueueMember(item({ processorStatus: "filed", processorFiledVisibleUntil: new Date("2026-09-18T15:59:59.000Z") }), new Set(), new Set(), now)).toBe(false);
  });

  it("shows captured source evidence separately from filing gaps", () => {
    const details = processorQueueInternals.captureDetails({
      factsOfLoss: "Rear-ended at a light.", preliminaryLiability: "Other driver appears at fault.", rideshareStatus: null,
      hasPhotos: true, attachmentCount: 2,
      events: [{ body: "Police report: PD-106\nTow company: Metro Tow\nThird party: Alex Carrier", metadata: null }],
    });
    expect(details.thirdParty).toContain("Alex Carrier");
    expect(details.policeReport).toContain("PD-106");
    expect(details.tow).toContain("Metro Tow");
    expect(details.photosOrFootage).toContain("2 source");
    expect(details.missing).toContain("rideshare status / period");
  });

  it("does not turn partial or narrative date-of-loss notes into historic dates", () => {
    expect(processorQueueInternals.validDateOfLoss("07/18")).toBeNull();
    expect(processorQueueInternals.validDateOfLoss("Unreported glass damage")).toBeNull();
    expect(processorQueueInternals.validDateOfLoss("7/17/2026")?.getFullYear()).toBe(2026);
  });
});
