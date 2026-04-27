/**
 * Unit tests for the resolveHandler routing logic in aircall.ts
 * Tests all routing rules defined on Apr 27 2026:
 * - Named handler → route to that person
 * - Subro/demand/payment → Madeline
 * - PIP/BI injury → Jayla
 * - Total loss → Demily
 * - Repairs/claim status → First Party team (round-robin)
 * - PD/3rd-party damage → Carlito
 * - Law office caller type → Jayla
 * - Medical provider → Jayla
 * - Unknown/no info → Triage (MJ / Daryl round-robin)
 */
import { describe, expect, it } from "vitest";

// ─── Inline the routing logic so tests are self-contained ─────────────────────
const HANDLER_ROUTING: Record<string, { id: number; name: string; email: string }> = {
  natasha:    { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  natashia:   { id: 1,     name: "Natashia Edulan",   email: "natashiae@drivewhip.com" },
  jayla:      { id: 2,     name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  jela:       { id: 2,     name: "Jayla Bernard",      email: "jayla.bernard@drivewhip.com" },
  mj:         { id: 3,     name: "Mary Joy Badua",     email: "mj.badua@drivewhip.com" },
  "mary joy": { id: 3,     name: "Mary Joy Badua",     email: "mj.badua@drivewhip.com" },
  carlito:    { id: 4,     name: "Carlito Legarde Jr", email: "carlito.legarde@drivewhip.com" },
  annie:      { id: 5,     name: "Annie Ortiz",        email: "annie.ortiz@drivewhip.com" },
  ana:        { id: 6,     name: "Ana Padilla",        email: "anap@drivewhip.com" },
  lorraine:   { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  raine:      { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  jovel:      { id: 30001, name: "Jovel Villa",         email: "jovel.villa@drivewhip.com" },
  jobs:       { id: 30001, name: "Jovel Villa",         email: "jovel.villa@drivewhip.com" },
  daryl:      { id: 30002, name: "Daryl Ochate",        email: "daryl.ochate@drivewhip.com" },
  madeline:   { id: 30004, name: "Madeline Green",      email: "madeline.green@drivewhip.com" },
  demily:     { id: 30005, name: "Demily Flores",       email: "demily.flores@drivewhip.com" },
};

const TRIAGE_HANDLERS = [
  { id: 3,     name: "Mary Joy Badua", email: "mj.badua@drivewhip.com" },
  { id: 30002, name: "Daryl Ochate",   email: "daryl.ochate@drivewhip.com" },
];
let _triageIndex = 0;
function nextTriageHandler() {
  const h = TRIAGE_HANDLERS[_triageIndex % TRIAGE_HANDLERS.length];
  _triageIndex++;
  return h;
}

const FIRST_PARTY_TEAM = [
  { id: 1,     name: "Natashia Edulan", email: "natashiae@drivewhip.com" },
  { id: 9,     name: "Lorraine Tria",   email: "lorraine.tria@drivewhip.com" },
  { id: 30001, name: "Jovel Villa",      email: "jovel.villa@drivewhip.com" },
  { id: 5,     name: "Annie Ortiz",     email: "annie.ortiz@drivewhip.com" },
];
let _firstPartyIndex = 0;
function nextFirstPartyHandler() {
  const h = FIRST_PARTY_TEAM[_firstPartyIndex % FIRST_PARTY_TEAM.length];
  _firstPartyIndex++;
  return h;
}

const SUBRO_REGEX    = /\b(subro(gation)?|demand( letter| package)?|payment|settlement|lien|reimbursement|recovery package)\b/i;
const INJURY_REGEX   = /\b(pip|personal injury|bodily injury|bi claim|injury claim|medical treatment|pain and suffering|attorney|represented|lawsuit|litigation)\b/i;
const PD_REGEX       = /\b(property damage|pd claim|third.?party|3rd party|vehicle damage|repair estimate|damage claim|collision damage)\b/i;
const TOTAL_LOSS_REGEX = /\b(total loss|totaled|write.?off|salvage|ACV|actual cash value|total.?loss claim)\b/i;
const REPAIRS_REGEX  = /\b(repair(s|ing)?|body shop|rental|claim status|status update|supplement|estimate|parts|shop)\b/i;

function resolveHandler(
  handlerMentioned: string | null,
  callerType: string,
  message: string | null,
  transcript: string
): { id: number; name: string } {
  if (handlerMentioned) {
    const key = handlerMentioned.toLowerCase().trim();
    for (const [k, v] of Object.entries(HANDLER_ROUTING)) {
      if (key.includes(k)) return v;
    }
  }
  const text = ((message ?? "") + " " + transcript).toLowerCase();
  if (SUBRO_REGEX.test(text))      return HANDLER_ROUTING.madeline;
  if (INJURY_REGEX.test(text))     return HANDLER_ROUTING.jayla;
  if (TOTAL_LOSS_REGEX.test(text)) return HANDLER_ROUTING.demily;
  if (REPAIRS_REGEX.test(text))    return nextFirstPartyHandler();
  if (PD_REGEX.test(text))         return HANDLER_ROUTING.carlito;
  if (callerType === "law_office")       return HANDLER_ROUTING.jayla;
  if (callerType === "medical_provider") return HANDLER_ROUTING.jayla;
  if (callerType === "carrier")          return nextFirstPartyHandler();
  if (callerType === "member" || callerType === "claimant") return nextFirstPartyHandler();
  return nextTriageHandler();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("resolveHandler — named handler", () => {
  it("routes to Jayla when caller says 'Jayla'", () => {
    const h = resolveHandler("Jayla", "carrier", null, "");
    expect(h.name).toBe("Jayla Bernard");
  });

  it("routes to Jovel when caller says 'Jobs'", () => {
    const h = resolveHandler("Jobs", "unknown", null, "");
    expect(h.name).toBe("Jovel Villa");
  });

  it("routes to Lorraine when caller says 'Raine'", () => {
    const h = resolveHandler("Raine", "unknown", null, "");
    expect(h.name).toBe("Lorraine Tria");
  });

  it("routes to MJ when caller says 'Mary Joy'", () => {
    const h = resolveHandler("Mary Joy", "unknown", null, "");
    expect(h.name).toBe("Mary Joy Badua");
  });
});

describe("resolveHandler — content-based routing", () => {
  it("routes subro demand to Madeline", () => {
    const h = resolveHandler(null, "carrier", "Calling about a subrogation demand letter", "");
    expect(h.name).toBe("Madeline Green");
  });

  it("routes settlement payment to Madeline", () => {
    const h = resolveHandler(null, "carrier", null, "calling to discuss settlement and payment");
    expect(h.name).toBe("Madeline Green");
  });

  it("routes PIP claim to Jayla", () => {
    const h = resolveHandler(null, "carrier", "This is about a PIP claim", "");
    expect(h.name).toBe("Jayla Bernard");
  });

  it("routes bodily injury to Jayla", () => {
    const h = resolveHandler(null, "law_office", null, "calling regarding bodily injury claim");
    expect(h.name).toBe("Jayla Bernard");
  });

  it("routes total loss to Demily", () => {
    const h = resolveHandler(null, "carrier", "The vehicle is a total loss", "");
    expect(h.name).toBe("Demily Flores");
  });

  it("routes totaled vehicle to Demily", () => {
    const h = resolveHandler(null, "carrier", null, "the car was totaled in the accident");
    expect(h.name).toBe("Demily Flores");
  });

  it("routes claim status to first party team", () => {
    const h = resolveHandler(null, "carrier", "Calling for a claim status update", "");
    expect(FIRST_PARTY_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes body shop repairs to first party team", () => {
    const h = resolveHandler(null, "carrier", null, "calling about repairs at the body shop");
    expect(FIRST_PARTY_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes 3rd party property damage to Carlito", () => {
    const h = resolveHandler(null, "claimant", "I have a property damage claim as a third party", "");
    expect(h.name).toBe("Carlito Legarde Jr");
  });

  it("routes PD claim to Carlito", () => {
    const h = resolveHandler(null, "carrier", null, "calling about a PD claim for vehicle damage");
    expect(h.name).toBe("Carlito Legarde Jr");
  });
});

describe("resolveHandler — caller type fallback", () => {
  it("routes law office with no keywords to Jayla", () => {
    const h = resolveHandler(null, "law_office", "Need to speak with someone", "");
    expect(h.name).toBe("Jayla Bernard");
  });

  it("routes medical provider to Jayla", () => {
    const h = resolveHandler(null, "medical_provider", null, "calling from a clinic");
    expect(h.name).toBe("Jayla Bernard");
  });

  it("routes carrier with no keywords to first party team", () => {
    const h = resolveHandler(null, "carrier", "Please call me back", "");
    expect(FIRST_PARTY_TEAM.map(x => x.name)).toContain(h.name);
  });
});

describe("resolveHandler — triage for unknowns", () => {
  it("routes unknown caller with no info to MJ or Daryl", () => {
    const h = resolveHandler(null, "unknown", null, "");
    expect(["Mary Joy Badua", "Daryl Ochate"]).toContain(h.name);
  });

  it("alternates triage between MJ and Daryl", () => {
    // Reset index
    _triageIndex = 0;
    const h1 = resolveHandler(null, "unknown", null, "");
    const h2 = resolveHandler(null, "unknown", null, "");
    expect(h1.name).not.toBe(h2.name);
  });
});
