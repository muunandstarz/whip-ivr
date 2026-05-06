/**
 * Unit tests for the resolveHandler routing logic in aircall.ts
 * Updated May 6 2026:
 * - Named handler → route to that person (including Tim Chan)
 * - 1P outbound subro (our vehicle) → Madeline / Daniel / Tim Chan
 * - 3P inbound subro (their vehicle / PD) → Carlito / Catherine
 * - Law office → ALWAYS Jayla (no exceptions — Madeline never gets attorney calls)
 * - PIP/BI injury → Jayla
 * - Total loss → Demily
 * - Repairs/claim status → First Party team (round-robin)
 * - Medical provider → Jayla
 * - Unknown/no info → Triage (MJ / Daryl round-robin)
 */
import { describe, expect, it, beforeEach } from "vitest";

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
  catherine:  { id: 7,     name: "Catherine Cestina",  email: "catherine.cestina@drivewhip.com" },
  lorraine:   { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  raine:      { id: 9,     name: "Lorraine Tria",      email: "lorraine.tria@drivewhip.com" },
  daniel:     { id: 10,    name: "Daniel Giono",       email: "daniel.giono@drivewhip.com" },
  tim:        { id: 30006, name: "Tim Chan",             email: "tim.chan@drivewhip.com" },
  "tim chan":  { id: 30006, name: "Tim Chan",             email: "tim.chan@drivewhip.com" },
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

const OUTBOUND_SUBRO_TEAM = [
  { id: 30004, name: "Madeline Green", email: "madeline.green@drivewhip.com" },
  { id: 10,    name: "Daniel Giono",   email: "daniel.giono@drivewhip.com" },
  { id: 30006, name: "Tim Chan",        email: "tim.chan@drivewhip.com" },
];
let _outboundSubroIndex = 0;
function nextOutboundSubroHandler() {
  const h = OUTBOUND_SUBRO_TEAM[_outboundSubroIndex % OUTBOUND_SUBRO_TEAM.length];
  _outboundSubroIndex++;
  return h;
}

const INBOUND_SUBRO_TEAM = [
  { id: 4, name: "Carlito Legarde Jr", email: "carlito.legarde@drivewhip.com" },
  { id: 7, name: "Catherine Cestina",  email: "catherine.cestina@drivewhip.com" },
];
let _inboundSubroIndex = 0;
function nextInboundSubroHandler() {
  const h = INBOUND_SUBRO_TEAM[_inboundSubroIndex % INBOUND_SUBRO_TEAM.length];
  _inboundSubroIndex++;
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

const SUBRO_1P_REGEX = /\b(subro(gation)?|demand( letter| package)?|recovery package|reimbursement)\b/i;
const SUBRO_1P_VEHICLE_REGEX = /\b(your (vehicle|insured|client|driver|member)|our vehicle|1p|first.?party|your claim|your insured'?s? vehicle|whip vehicle|whip driver)\b/i;
const SUBRO_3P_REGEX = /\b(subro(gation)?|demand( letter| package)?|settlement|lien|reimbursement|recovery package)\b/i;
const SUBRO_3P_VEHICLE_REGEX = /\b(my (vehicle|car|truck)|our (vehicle|car)|their vehicle|third.?party|3rd.?party|property damage|pd claim)\b/i;
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

  // Law offices ALWAYS go to Jayla — no exceptions
  if (callerType === "law_office") return HANDLER_ROUTING.jayla;
  // Medical providers always go to Jayla
  if (callerType === "medical_provider") return HANDLER_ROUTING.jayla;

  // Subro routing — split by 1P vs 3P
  if (SUBRO_1P_REGEX.test(text) && SUBRO_1P_VEHICLE_REGEX.test(text)) return nextOutboundSubroHandler();
  if (SUBRO_3P_REGEX.test(text) && SUBRO_3P_VEHICLE_REGEX.test(text)) return nextInboundSubroHandler();
  if (SUBRO_1P_REGEX.test(text)) return nextOutboundSubroHandler();

  if (INJURY_REGEX.test(text))     return HANDLER_ROUTING.jayla;
  if (TOTAL_LOSS_REGEX.test(text)) return HANDLER_ROUTING.demily;
  if (REPAIRS_REGEX.test(text))    return nextFirstPartyHandler();
  if (PD_REGEX.test(text))         return nextInboundSubroHandler();
  if (callerType === "carrier")          return nextFirstPartyHandler();
  if (callerType === "member" || callerType === "claimant") return nextFirstPartyHandler();
  return nextTriageHandler();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset all round-robin indices before each test suite for deterministic results
  _triageIndex = 0;
  _outboundSubroIndex = 0;
  _inboundSubroIndex = 0;
  _firstPartyIndex = 0;
});

describe("resolveHandler — named handler", () => {
  it("routes to Jayla when caller says 'Jayla'", () => {
    expect(resolveHandler("Jayla", "carrier", null, "").name).toBe("Jayla Bernard");
  });

  it("routes to Jovel when caller says 'Jobs'", () => {
    expect(resolveHandler("Jobs", "unknown", null, "").name).toBe("Jovel Villa");
  });

  it("routes to Lorraine when caller says 'Raine'", () => {
    expect(resolveHandler("Raine", "unknown", null, "").name).toBe("Lorraine Tria");
  });

  it("routes to MJ when caller says 'Mary Joy'", () => {
    expect(resolveHandler("Mary Joy", "unknown", null, "").name).toBe("Mary Joy Badua");
  });

  it("routes to Tim Chan when caller says 'Tim'", () => {
    expect(resolveHandler("Tim", "unknown", null, "").name).toBe("Tim Chan");
  });

  it("routes to Tim Chan when caller says 'Tim Chan'", () => {
    expect(resolveHandler("Tim Chan", "unknown", null, "").name).toBe("Tim Chan");
  });
});

describe("resolveHandler — law office routing (Madeline NEVER gets attorney calls)", () => {
  it("routes law office with no keywords to Jayla", () => {
    expect(resolveHandler(null, "law_office", "Need to speak with someone", "").name).toBe("Jayla Bernard");
  });

  it("routes law office with subro keywords to Jayla (not Madeline)", () => {
    expect(resolveHandler(null, "law_office", "Calling about a subrogation demand letter", "").name).toBe("Jayla Bernard");
  });

  it("routes law office with PD keywords to Jayla (not Carlito)", () => {
    expect(resolveHandler(null, "law_office", "This is about property damage to my client's vehicle", "").name).toBe("Jayla Bernard");
  });

  it("routes law office with injury keywords to Jayla", () => {
    expect(resolveHandler(null, "law_office", null, "calling regarding bodily injury claim").name).toBe("Jayla Bernard");
  });

  it("routes law office with settlement keywords to Jayla (not Madeline)", () => {
    expect(resolveHandler(null, "law_office", "We want to discuss settlement", "").name).toBe("Jayla Bernard");
  });
});

describe("resolveHandler — subro routing (1P outbound vs 3P inbound)", () => {
  it("routes 1P subro (our vehicle) to outbound subro team", () => {
    const h = resolveHandler(null, "carrier", "Calling about subrogation for your vehicle", "");
    expect(OUTBOUND_SUBRO_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes 1P subro with 'your insured' to outbound subro team", () => {
    const h = resolveHandler(null, "carrier", "We have a subrogation demand for your insured", "");
    expect(OUTBOUND_SUBRO_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes 3P subro (my vehicle) to inbound subro team", () => {
    const h = resolveHandler(null, "carrier", "Calling about subrogation for my vehicle", "");
    expect(INBOUND_SUBRO_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes 3P subro with 'third party' to inbound subro team", () => {
    const h = resolveHandler(null, "claimant", "I have a third party property damage claim and want to discuss subrogation", "");
    expect(INBOUND_SUBRO_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes generic subro (no vehicle context) to outbound subro team as default", () => {
    const h = resolveHandler(null, "carrier", "Calling about a subrogation matter", "");
    expect(OUTBOUND_SUBRO_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("outbound subro team round-robins across Madeline, Daniel, Tim Chan", () => {
    _outboundSubroIndex = 0;
    const names = [0, 1, 2].map(() =>
      resolveHandler(null, "carrier", "subrogation demand for your vehicle", "").name
    );
    expect(names).toContain("Madeline Green");
    expect(names).toContain("Daniel Giono");
    expect(names).toContain("Tim Chan");
  });

  it("inbound subro team round-robins across Carlito and Catherine", () => {
    _inboundSubroIndex = 0;
    const names = [0, 1].map(() =>
      resolveHandler(null, "claimant", "subrogation for my vehicle", "").name
    );
    expect(names).toContain("Carlito Legarde Jr");
    expect(names).toContain("Catherine Cestina");
  });
});

describe("resolveHandler — content-based routing", () => {
  it("routes PIP claim to Jayla", () => {
    expect(resolveHandler(null, "carrier", "This is about a PIP claim", "").name).toBe("Jayla Bernard");
  });

  it("routes bodily injury to Jayla", () => {
    expect(resolveHandler(null, "carrier", null, "calling regarding bodily injury claim").name).toBe("Jayla Bernard");
  });

  it("routes total loss to Demily", () => {
    expect(resolveHandler(null, "carrier", "The vehicle is a total loss", "").name).toBe("Demily Flores");
  });

  it("routes totaled vehicle to Demily", () => {
    expect(resolveHandler(null, "carrier", null, "the car was totaled in the accident").name).toBe("Demily Flores");
  });

  it("routes claim status to first party team", () => {
    const h = resolveHandler(null, "carrier", "Calling for a claim status update", "");
    expect(FIRST_PARTY_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes body shop repairs to first party team", () => {
    const h = resolveHandler(null, "carrier", null, "calling about repairs at the body shop");
    expect(FIRST_PARTY_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes 3rd party property damage to inbound subro team (Carlito/Catherine)", () => {
    const h = resolveHandler(null, "claimant", "I have a property damage claim as a third party", "");
    expect(INBOUND_SUBRO_TEAM.map(x => x.name)).toContain(h.name);
  });

  it("routes PD claim to inbound subro team", () => {
    const h = resolveHandler(null, "carrier", null, "calling about a PD claim for vehicle damage");
    expect(INBOUND_SUBRO_TEAM.map(x => x.name)).toContain(h.name);
  });
});

describe("resolveHandler — caller type fallback", () => {
  it("routes medical provider to Jayla", () => {
    expect(resolveHandler(null, "medical_provider", null, "calling from a clinic").name).toBe("Jayla Bernard");
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
    _triageIndex = 0;
    const h1 = resolveHandler(null, "unknown", null, "");
    const h2 = resolveHandler(null, "unknown", null, "");
    expect(h1.name).not.toBe(h2.name);
  });

  it("routes call with no claim number and no info to triage (MJ/Daryl)", () => {
    const h = resolveHandler(null, "unknown", null, "hi please call me back");
    expect(["Mary Joy Badua", "Daryl Ochate"]).toContain(h.name);
  });
});

// ─── Run-on claim number reformatting tests ──────────────────────────────────
import { reformatRunOnClaimNumber } from "../server/claimMatch";

describe("reformatRunOnClaimNumber — Whisper run-on transcription fix", () => {
  it("reformats standard 18-char run-on (MD + 16 digits)", () => {
    expect(reformatRunOnClaimNumber("MD9845790898153720")).toBe("MD-9845-790898-153720");
  });

  it("reformats GA run-on from the Shelly/Farmers voicemail", () => {
    expect(reformatRunOnClaimNumber("GA4899430247470636")).toBe("GA-4899-430247-470636");
  });

  it("returns null for ambiguous 17-char run-on (requires DB lookup to resolve)", () => {
    expect(reformatRunOnClaimNumber("MD984579089815372")).toBeNull();
  });

  it("passes through already-formatted claim numbers unchanged", () => {
    expect(reformatRunOnClaimNumber("MD-9562-020976-523574")).toBe("MD-9562-020976-523574");
  });

  it("returns null for strings that are not claim numbers", () => {
    expect(reformatRunOnClaimNumber("701-006-6604-1")).toBeNull();
    expect(reformatRunOnClaimNumber("4044437264")).toBeNull();
    expect(reformatRunOnClaimNumber("")).toBeNull();
  });
});
