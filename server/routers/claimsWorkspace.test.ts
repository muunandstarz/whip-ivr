import { describe, expect, it } from "vitest";
import { claimsWorkspaceRouter } from "./claimsWorkspace";

function inputSchema(name: string) {
  return (claimsWorkspaceRouter._def.procedures[name] as any)._def.inputs[0];
}

describe("claimsWorkspaceRouter", () => {
  it("exposes the handler workspace persistence contract", () => {
    const procedures = Object.keys(claimsWorkspaceRouter._def.procedures);
    expect(procedures).toEqual(expect.arrayContaining([
      "dashboard", "saveNote", "setNotePinned", "archiveNote", "saveQuickNote",
      "archiveQuickNote", "saveTask", "setTaskStatus", "snoozeTask",
      "convertQuickNoteToTask", "saveScene",
    ]));
  });

  it("accepts a structured, taggable workspace note", () => {
    const result = inputSchema("saveNote").safeParse({
      title: "3-way stop analysis",
      content: "<p>Driver statements differ on right of way.</p>",
      tags: ["liability", "police report"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty note title and overlong quick note", () => {
    expect(inputSchema("saveNote").safeParse({ title: " ", content: "<p>Test</p>" }).success).toBe(false);
    expect(inputSchema("saveQuickNote").safeParse({ content: "x".repeat(1001) }).success).toBe(false);
  });

  it("accepts a reminder task with supported recurrence", () => {
    const result = inputSchema("saveTask").safeParse({
      title: "Call claimant for police report",
      priority: "high",
      dueAt: new Date("2026-08-28T14:00:00.000Z"),
      remindAt: new Date("2026-08-28T13:30:00.000Z"),
      repeatRule: "weekdays",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a versioned accident-workspace scene and constrains its layout", () => {
    const valid = inputSchema("saveScene").safeParse({
      title: "Bowen v. Acevedo", versionLabel: "My Analysis", state: "MD",
      roadLayout: "four_way", sceneData: { vehicles: [], marks: [], strokes: [] },
    });
    const invalid = inputSchema("saveScene").safeParse({
      title: "Bad layout", sceneData: {}, roadLayout: "impossible",
    });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});
