import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createFreshPdfPreview } from "./freshPdfPreview";
import { UAD_DENIAL_TYPE } from "@shared/uadDenial";

const source = readFileSync("client/src/pages/DocGenerator.tsx", "utf8");
const denial = source.slice(source.indexOf("function DenialTab("), source.indexOf("// ─── Tab: Damage Denial"));

describe("UAD selection, saved inputs and no stale preview", () => {
  it("integrates the unique UAD type in the existing denial selector, not routing or automation", () => {
    expect(UAD_DENIAL_TYPE).toBe("uad_denial");
    expect(source).toContain("[UAD_DENIAL_TYPE]: {");
    expect(denial).toContain("Object.entries(DENIAL_TEMPLATES)");
    expect(denial).toContain('uad_denial: { title: "Unauthorized Driver / UAD Denial"');
    expect(denial).toContain("aria-pressed={isSelected}");
    expect(denial).toContain("<UadDenialFields fields={uadFields}");
    expect(denial).toContain("createUadDenialPdf(uadFields, { logoBase64: WHIP_LOGO_B64");
    expect(denial).not.toMatch(/mutate|improveWithAI|manager|ScheduleTask|window\.location/);
  });

  it("opens an explicit UAD link while saved selections win and the ordinary default remains TNC", () => {
    expect(source).toContain('new URLSearchParams(search).get("template") === UAD_DENIAL_TYPE ? UAD_DENIAL_TYPE : undefined');
    expect(denial).toContain('DENIAL_TEMPLATES[savedText("selectedTemplate")] ? savedText("selectedTemplate") : initialTemplate === UAD_DENIAL_TYPE ? UAD_DENIAL_TYPE : "tnc_pip"');
  });

  it("keeps all fields labelled, address multiline, the advisory screen-only and final downloads validated", () => {
    const fields = readFileSync("client/src/components/UadDenialFields.tsx", "utf8");
    expect(fields).toContain("UAD_FIELD_META.map");
    expect(fields).toContain("<Label htmlFor={id}");
    expect(fields).toContain('"aria-required": required');
    expect(fields).toContain("<Textarea {...common}");
    expect(fields).toContain('meta.key === "claimant_address" ? 3 : 2');
    expect(fields).toContain('print:hidden" role="note">{UAD_ADVISORY}');
    expect(denial).toContain("shouldDownload ? validateUadDenialFields(uadFields) : []");
    expect(denial).toContain("allowPreviewDownload={!isUad || validateUadDenialFields(uadFields).length === 0}");
    expect(source).toContain("allowPreviewDownload = true");
  });

  it("retains all eight legacy denial templates verbatim", () => {
    const baseline = execFileSync("git", ["show", "baa73cb:client/src/pages/DocGenerator.tsx"], { encoding: "utf8" });
    const oldRegistry = baseline.slice(baseline.indexOf("  tnc_pip: {"), baseline.indexOf("\n};", baseline.indexOf("  tnc_pip: {")));
    expect(source).toContain(oldRegistry);
    for (const key of ["tnc_pip", "no_pip_state", "pip_waiver", "tnc_liability", "lor_acknowledgment", "lor_deny_bi", "empower_member", "empower_claimant"]) expect(oldRegistry).toContain(`${key}: {`);
  });

  it("uses existing input-only Save Draft/Load/Share/Clear mechanisms and remounts on restoration", () => {
    expect(denial).toContain('denialDraftVersion: "denial-v1"');
    expect(denial).toContain("onDraftChange?.(draftData)");
    expect(source).toContain("<DenialTab onNavigate={setActiveTab} initialDraft={currentFormData} onDraftChange={setCurrentFormData}");
    expect(source).toContain('["lou-calculator", "payment-receipt", "denial"].includes(draft.tabKey)');
    expect(source).toContain('["lou-calculator", "payment-receipt", "denial"].includes(t.tabKey)');
    expect(source).toContain("key={`${activeTab}-${formResetKey}`}");
    expect(denial).toContain("const resetUad = () => { pdfPreview.clear(); setUadFields(emptyUadDenialFields());");
    const data = denial.slice(denial.indexOf("const draftData"), denial.indexOf("useEffect(() => { onDraftChange"));
    expect(data).not.toMatch(/pdf|blob|URL|bytes/);
  });

  it("invalidates every edited input and selection before effects, clears on reset/unmount, and rerenders repeated previews", () => {
    const hook = readFileSync("client/src/hooks/useFreshPdfPreview.ts", "utf8");
    expect(denial).toContain("useFreshPdfPreview(JSON.stringify(draftData))");
    expect(denial).toContain("const selectTemplate = (key: string) => { pdfPreview.clear()");
    expect(hook).toContain("snapshot?.fingerprint === fingerprint");
    expect(hook).toContain("[fingerprint]");
    expect(hook).toContain("useEffect(() => () => owner.current!.clear(), [])");
    expect(hook).toContain("setSnapshot(owner.current!.replace(blob, fingerprint))");
    const createObjectURL = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second").mockReturnValueOnce("blob:third");
    const revokeObjectURL = vi.fn();
    const owner = createFreshPdfPreview({ createObjectURL, revokeObjectURL });
    const blob = new Blob(["synthetic PDF"]);
    expect(owner.current("A")).toBeNull();
    owner.replace(blob, "A"); expect(owner.current("A")).toBe("blob:first");
    expect(owner.current("EDITED")).toBeNull(); // synchronous stale guard
    owner.replace(blob, "A"); expect(owner.current("A")).toBe("blob:second");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    owner.clear(); expect(owner.current("A")).toBeNull();
    owner.clear(); expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    owner.replace(blob, "B"); owner.clear();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:third");
    expect(owner.current("B")).toBeNull();
  });
});
