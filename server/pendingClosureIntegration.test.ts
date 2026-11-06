import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PENDING_CLOSURE_SOL_REFERENCE, PENDING_CLOSURE_SOL_WARNING, pendingClosureSolReference } from "../shared/pendingClosureSol";
const docgen = readFileSync(new URL("../client/src/pages/DocGenerator.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("../client/src/components/PendingClosureForm.tsx", import.meta.url), "utf8");
describe("Pending closure reference and integration safety", () => {
  it("preserves all 50 states plus DC and every supplied caution status", () => {
    expect(PENDING_CLOSURE_SOL_REFERENCE).toHaveLength(51);
    expect(new Set(PENDING_CLOSURE_SOL_REFERENCE.map(r => r.abbr)).size).toBe(51);
    expect(pendingClosureSolReference("DC")?.state).toBe("District of Columbia");
    expect(pendingClosureSolReference("AL")?.status).toBe("VERIFY");
    expect(pendingClosureSolReference("KY")?.status).toBe("VERIFY");
    expect(pendingClosureSolReference("OH")?.status).toBe("VERIFY");
    expect(pendingClosureSolReference("CA")?.status).toBe("CA RULE");
    expect(pendingClosureSolReference("FL")?.status).toBe("RECENT CHANGE");
    expect(pendingClosureSolReference("LA")?.status).toBe("RECENT CHANGE");
    expect(pendingClosureSolReference("invalid")).toBeUndefined();
    expect(PENDING_CLOSURE_SOL_REFERENCE.filter(r => r.status === "OK")).toHaveLength(45);
  });
  it("does not present secondary-source agreement as legal confirmation", () => {
    expect(PENDING_CLOSURE_SOL_WARNING).toContain("not the statutes themselves");
    expect(PENDING_CLOSURE_SOL_WARNING).toContain("Have counsel confirm");
    expect(PENDING_CLOSURE_SOL_WARNING).toContain("does not mean counsel-approved");
    expect(PENDING_CLOSURE_SOL_WARNING).toContain("does not calculate a legal deadline");
    expect(form).toContain('onChange={event => setState(event.target.value)}');
    expect(form).not.toMatch(/update\("sol_language",\s*reference/);
    expect(form).not.toContain("addYears");
  });
  it("adds a direct Contacts tab without removing any original Contact form", () => {
    const contacts = docgen.slice(docgen.indexOf('label: "Contacts"'), docgen.indexOf('label: "Denials"'));
    expect(contacts).toContain('id: "pending-closure", label: "Pending Closure Letter"');
    for (const id of ["blank-letterhead", "claimant-contact", "failed-contact", "storage-mitigation"]) expect(contacts).toContain(`id: "${id}"`);
    expect(docgen).toContain('case "pending-closure": return <PendingClosureForm initialDraft={currentFormData} onDraftChange={setCurrentFormData} logoBase64={WHIP_LOGO_B64} />');
    expect(docgen.match(/\["lou-calculator", "payment-receipt", "denial", "pending-closure"\]/g)).toHaveLength(2);
  });
  it("keeps email copy-only and exports no reference table or retained PDFs", () => {
    expect(form).toContain('copy(`Subject: ${subject}\\n\\n${body}`, "Email")');
    expect(form).toContain("URL.revokeObjectURL");
    expect(form).not.toMatch(/storagePut|sendEmail|gmail\.|slack\.|scheduleTask|closeClaim|recordClosure/);
    expect(form).not.toMatch(/formData\.append|FileReader|\.arrayBuffer\(/);
    expect(form).toContain("Generic wording remains available");
  });
});
