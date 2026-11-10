import { describe, expect, it, vi } from "vitest";
import {
  MARYLAND_PIP_DOCUMENTATION_NOTICE,
  parseMarylandPipHistory,
  pipSelectionAt,
  pipSelectionLabel,
  validateMarylandPipHistory,
  type MarylandPipChange,
  type MarylandPipHistory,
  type MarylandPipHistoryContext,
  type MarylandPipSelection,
} from "@shared/klutchMarylandPip";

const context: MarylandPipHistoryContext = {
  effectiveOn: "2026-01-01",
  expiresOn: "2027-01-01",
  referenceOn: "2026-11-09",
};

function change(overrides: Partial<MarylandPipChange> = {}): MarylandPipChange {
  return {
    selection: "waived",
    effectiveOn: "2026-03-01",
    signedOn: "2026-02-28",
    sourceReference: "signed-election/lease-123/2026-02-28",
    electionDetails:
      "Handler confirmed the selection shown in the signed source.",
    confirmed: true,
    ...overrides,
  };
}

function history(
  overrides: Partial<MarylandPipHistory> = {}
): MarylandPipHistory {
  return {
    rentalEffectiveOn: "2026-01-01",
    initialSelection: "elected",
    changes: [change()],
    ...overrides,
  };
}

function errors(
  value: MarylandPipHistory,
  overrides: Partial<MarylandPipHistoryContext> = {}
) {
  return validateMarylandPipHistory("MD", value, {
    ...context,
    ...overrides,
  }).join("\n");
}

describe("Maryland PIP history strict parsing", () => {
  it("parses a complete history into a new copy without mutating documentation", () => {
    const original = history({
      changes: [
        change({
          sourceReference: "  signed-source.pdf  ",
          electionDetails: "  confirmed wording  ",
        }),
      ],
    });
    const before = structuredClone(original);
    const parsed = parseMarylandPipHistory(original);
    expect(parsed).toEqual(before);
    expect(original).toEqual(before);
    expect(parsed).not.toBe(original);
    expect(parsed?.changes).not.toBe(original.changes);
    expect(parsed?.changes[0]).not.toBe(original.changes[0]);
  });

  it("preserves an explicit limited baseline with handler-defined scope", () => {
    const value = history({
      initialSelection: "limited",
      initialElectionDetails:
        "Handler-confirmed scope as described in source A; no scope inferred.",
    });
    expect(parseMarylandPipHistory(value)).toEqual(value);
    expect(errors(value)).toBe("");
    expect(pipSelectionAt(value, "2026-02-01", "elected")).toBe("limited");
  });

  it("accepts an unconfirmed original baseline without inferred details", () => {
    const value = history({
      initialSelection: "unconfirmed",
      changes: [],
    });
    expect(parseMarylandPipHistory(value)).toEqual(value);
    expect(errors(value)).toBe("");
  });

  it.each([undefined, "", " \n\t "])(
    "requires details for a limited baseline (%j)",
    details => {
      const value = history({
        initialSelection: "limited",
        initialElectionDetails: details,
      });
      expect(() => parseMarylandPipHistory(value)).toThrow();
      expect(errors(value)).toContain("initialElectionDetails");
    }
  );

  it("keeps optional baseline details optional for elected or waived selections", () => {
    for (const selection of ["elected", "waived"] as const) {
      const value = history({ initialSelection: selection, changes: [] });
      expect(parseMarylandPipHistory(value)).toEqual(value);
      expect(parseMarylandPipHistory(value)).not.toHaveProperty(
        "initialElectionDetails"
      );
    }
  });

  it.each([null, false, 0, "{}", [], {}])(
    "rejects non-history input (%j)",
    value => {
      expect(() => parseMarylandPipHistory(value)).toThrow();
    }
  );

  it.each(["rentalEffectiveOn", "initialSelection", "changes"] as const)(
    "does not infer or default missing %s",
    field => {
      const value: Record<string, unknown> = { ...history() };
      delete value[field];
      expect(() => parseMarylandPipHistory(value)).toThrow();
    }
  );

  it.each([
    "selection",
    "effectiveOn",
    "signedOn",
    "sourceReference",
    "electionDetails",
    "confirmed",
  ] as const)("does not infer or default missing change %s", field => {
    const entry: Record<string, unknown> = { ...change() };
    delete entry[field];
    expect(() =>
      parseMarylandPipHistory({ ...history(), changes: [entry] })
    ).toThrow();
  });

  it.each([
    { ...history(), unexpected: true },
    { ...history(), changes: [{ ...change(), unexpected: true }] },
    { ...history(), initialSelection: "full" },
    { ...history(), initialSelection: "" },
    { ...history(), initialElectionDetails: null },
    { ...history(), changes: [{ ...change(), confirmed: "true" }] },
    { ...history(), changes: [{ ...change(), selection: "declined" }] },
    { ...history(), changes: [{ ...change(), electionDetails: 42 }] },
    { ...history(), changes: [{ ...change(), effectiveOn: 20260301 }] },
    { ...history(), changes: [null] },
    { ...history(), changes: new Array(1) },
  ])("rejects unknown keys, enum substitutions, and coercion (%#)", value => {
    expect(() => parseMarylandPipHistory(value)).toThrow();
  });

  it.each([
    ["sourceReference", "a".repeat(301)],
    ["electionDetails", "a".repeat(801)],
  ] as const)("rejects oversized change %s", (field, value) => {
    const entry = change({ [field]: value });
    expect(() =>
      parseMarylandPipHistory(history({ changes: [entry] }))
    ).toThrow();
  });

  it("rejects oversized initial election details", () => {
    const value = history({ initialElectionDetails: "a".repeat(801) });
    expect(() => parseMarylandPipHistory(value)).toThrow();
  });

  it.each(["", " \n\t "])(
    "requires nonblank signed source reference (%j)",
    sourceReference => {
      const value = history({ changes: [change({ sourceReference })] });
      expect(() => parseMarylandPipHistory(value)).toThrow();
      expect(errors(value)).toContain("sourceReference");
    }
  );

  it("requires true confirmation, not an unchecked checkbox", () => {
    const value = history({ changes: [change({ confirmed: false })] });
    expect(() => parseMarylandPipHistory(value)).toThrow();
    expect(errors(value)).toContain("confirmed");
  });

  it.each(["", " \n\t "])(
    "requires handler scope for a limited change (%j)",
    electionDetails => {
      const value = history({
        changes: [change({ selection: "limited", electionDetails })],
      });
      expect(() => parseMarylandPipHistory(value)).toThrow();
      expect(errors(value)).toContain("electionDetails");
    }
  );

  it("requires the details field but permits empty details for nonlimited changes", () => {
    const value = history({ changes: [change({ electionDetails: "" })] });
    expect(parseMarylandPipHistory(value)).toEqual(value);
    expect(errors(value)).toBe("");
  });
});

describe("Maryland PIP calendar dates and evidence chronology", () => {
  it.each([
    "",
    " ",
    "2026-2-01",
    "2026-02-1",
    "2026-02-29",
    "1900-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "0000-01-01",
    "2026-03-01T00:00:00Z",
    " 2026-03-01",
    "2026-03-01 ",
    "2026-03-01\n",
    "2026-03-01\r\n",
  ])("rejects invalid date %j in all history date fields", date => {
    for (const value of [
      history({ rentalEffectiveOn: date }),
      history({ changes: [change({ effectiveOn: date })] }),
      history({ changes: [change({ signedOn: date })] }),
    ]) {
      expect(() => parseMarylandPipHistory(value)).toThrow();
      expect(errors(value)).toContain("real calendar date");
    }
  });

  it.each(["2000-02-29", "2024-02-29", "2400-02-29"])(
    "accepts real leap day %s",
    date => {
      const year = date.slice(0, 4);
      const value = history({
        rentalEffectiveOn: `${year}-01-01`,
        changes: [change({ effectiveOn: date, signedOn: date })],
      });
      expect(parseMarylandPipHistory(value)).toEqual(value);
      expect(
        validateMarylandPipHistory("MD", value, {
          effectiveOn: `${year}-01-01`,
          expiresOn: `${year}-12-31`,
          referenceOn: date,
        })
      ).toEqual([]);
    }
  );

  it("does not use JavaScript's 1900 offset for years below 100", () => {
    expect(
      parseMarylandPipHistory(
        history({ rentalEffectiveOn: "0001-01-01", changes: [] })
      )
    ).toMatchObject({ rentalEffectiveOn: "0001-01-01" });
  });

  it("accepts signing on the change date but rejects signing after it", () => {
    expect(
      errors(history({ changes: [change({ signedOn: "2026-03-01" })] }))
    ).toBe("");
    const late = history({ changes: [change({ signedOn: "2026-03-02" })] });
    expect(errors(late)).toContain("signing date");
    expect(() => parseMarylandPipHistory(late)).toThrow();
  });

  it("does not infer signing from effectiveness or effectiveness from signing", () => {
    for (const field of ["effectiveOn", "signedOn"] as const) {
      const value = history({ changes: [change({ [field]: "" })] });
      expect(() => parseMarylandPipHistory(value)).toThrow();
      expect(value.changes[0][field]).toBe("");
    }
  });
});

describe("Maryland PIP state and packet validation", () => {
  it("accepts an MD history with no changes", () => {
    expect(errors(history({ changes: [] }))).toBe("");
  });

  it.each(["VA", "PA", "FL", "IL", "GA", "MA", "TX", "md", " MD", "", "ZZ"])(
    "rejects a forged history in state %j even when there are no changes",
    state => {
      expect(
        validateMarylandPipHistory(state, history(), context).join("\n")
      ).toContain("only for MD");
      expect(
        validateMarylandPipHistory(
          state,
          history({ changes: [] }),
          context
        ).join("\n")
      ).toContain("only for MD");
    }
  );

  it("rechecks forged runtime data instead of trusting TypeScript assertions", () => {
    const value = {
      ...history(),
      changes: [{ ...change(), confirmed: "true" }],
    } as unknown as MarylandPipHistory;
    const issues = validateMarylandPipHistory("VA", value, context).join("\n");
    expect(issues).toContain("only for MD");
    expect(issues).toContain("confirmed");
    expect(
      validateMarylandPipHistory(
        "MD",
        null as unknown as MarylandPipHistory,
        context
      ).length
    ).toBeGreaterThan(0);
  });

  it("allows a change exactly at rental start and rejects one before enrollment", () => {
    const atStart = history({
      changes: [change({ effectiveOn: "2026-01-01", signedOn: "2025-12-31" })],
    });
    expect(errors(atStart)).toBe("");
    const beforeStart = history({
      changes: [change({ effectiveOn: "2025-12-31", signedOn: "2025-12-30" })],
    });
    expect(errors(beforeStart)).toContain("original rental effective date");
  });

  it("uses packet expiration exclusively", () => {
    expect(
      errors(history({ changes: [change({ effectiveOn: "2026-12-31" })] }), {
        referenceOn: undefined,
      })
    ).toBe("");
    expect(
      errors(history({ changes: [change({ effectiveOn: "2027-01-01" })] }), {
        referenceOn: undefined,
      })
    ).toContain("expiresOn (exclusive)");
    expect(
      errors(history({ changes: [change({ effectiveOn: "2027-01-02" })] }), {
        referenceOn: undefined,
      })
    ).toContain("expiresOn (exclusive)");
  });

  it("uses explicit reference date inclusively and rejects changes after confirmation", () => {
    expect(errors(history(), { referenceOn: "2026-03-01" })).toBe("");
    expect(errors(history(), { referenceOn: "2026-02-28" })).toContain(
      "confirmed referenceOn"
    );
  });

  it("uses cancellation date inclusively and combines both supplied upper bounds", () => {
    expect(errors(history(), { cancelledOn: "2026-03-01" })).toBe("");
    expect(errors(history(), { cancelledOn: "2026-02-28" })).toContain(
      "cancelledOn (inclusive)"
    );
    const issues = errors(history(), {
      referenceOn: "2026-02-27",
      cancelledOn: "2026-02-28",
    });
    expect(issues).toContain("confirmed referenceOn");
    expect(issues).toContain("cancelledOn (inclusive)");
  });

  it.each(["effectiveOn", "expiresOn", "referenceOn", "cancelledOn"] as const)(
    "rejects invalid context %s, including blank optional values",
    field => {
      for (const date of [
        "",
        "2026-02-29",
        "2026-04-31",
        "2026-01-01T00:00:00Z",
      ]) {
        expect(errors(history(), { [field]: date })).toContain(
          `${field} must be a real calendar date`
        );
      }
    }
  );

  it("requires the packet expiration to follow its term start", () => {
    expect(errors(history(), { expiresOn: "2026-01-01" })).toContain(
      "later than the policy term"
    );
    expect(errors(history(), { expiresOn: "2025-12-31" })).toContain(
      "later than the policy term"
    );
  });

  it("requires rental baseline on or before current term start even with no changes", () => {
    expect(
      errors(history({ rentalEffectiveOn: "2026-01-02", changes: [] }))
    ).toContain("on or before");
    expect(errors(history({ changes: [] }))).toBe("");
  });

  it("preserves original enrollment and pre-renewal changes at the exact renewal boundary", () => {
    const value = history({
      changes: [
        change(),
        change({
          selection: "limited",
          effectiveOn: "2027-01-01",
          signedOn: "2026-12-30",
          electionDetails: "Handler-confirmed limited scope.",
        }),
      ],
    });
    const renewal = {
      effectiveOn: "2027-01-01",
      expiresOn: "2028-01-01",
      referenceOn: "2027-01-01",
    };
    expect(validateMarylandPipHistory("MD", value, renewal)).toEqual([]);
    expect(pipSelectionAt(value, "2026-12-31", "elected")).toBe("waived");
    expect(pipSelectionAt(value, "2027-01-01", "elected")).toBe("limited");
    expect(value.rentalEffectiveOn).toBe("2026-01-01");
    expect(value.initialSelection).toBe("elected");
    expect(errors(value, { referenceOn: "2027-01-01" })).toContain(
      "expiresOn (exclusive)"
    );
  });

  it("does not infer an as-of date from the clock or planned renewal start", () => {
    const value = history({
      changes: [change({ effectiveOn: "2030-04-01", signedOn: "2030-03-31" })],
    });
    const planned = { effectiveOn: "2030-01-01", expiresOn: "2031-01-01" };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-09T00:00:00Z"));
      expect(validateMarylandPipHistory("MD", value, planned)).toEqual([]);
      expect(
        validateMarylandPipHistory("MD", value, {
          ...planned,
          referenceOn: "2030-04-01",
        })
      ).toEqual([]);
      expect(
        validateMarylandPipHistory("MD", value, {
          ...planned,
          referenceOn: "2026-11-09",
        }).join("\n")
      ).toContain("confirmed referenceOn");
      vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
      expect(validateMarylandPipHistory("MD", value, planned)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Maryland PIP change sequence and dated selection", () => {
  it("looks up before, on, and after each change without replacing the baseline", () => {
    const value = history({
      changes: [
        change(),
        change({
          selection: "limited",
          effectiveOn: "2026-06-01",
          signedOn: "2026-05-30",
          electionDetails: "Handler-confirmed scope from signed source B.",
        }),
        change({
          selection: "elected",
          effectiveOn: "2026-09-01",
          signedOn: "2026-08-30",
        }),
      ],
    });
    expect(errors(value)).toBe("");
    for (const [date, selection] of [
      ["2025-12-31", "limited"],
      ["2026-01-01", "elected"],
      ["2026-02-28", "elected"],
      ["2026-03-01", "waived"],
      ["2026-05-31", "waived"],
      ["2026-06-01", "limited"],
      ["2026-08-31", "limited"],
      ["2026-09-01", "elected"],
      ["2026-10-01", "elected"],
    ] as const) {
      expect(pipSelectionAt(value, date, "limited")).toBe(selection);
    }
    expect(value.initialSelection).toBe("elected");
    expect(value.changes).toHaveLength(3);
  });

  it("keeps the original baseline instead of inferring it from the latest choice", () => {
    const value = history({
      initialSelection: "waived",
      changes: [change({ selection: "elected" })],
    });
    expect(pipSelectionAt(value, "2026-02-28", "elected")).toBe("waived");
    expect(pipSelectionAt(value, "2026-03-01", "waived")).toBe("elected");
    expect(value.initialSelection).toBe("waived");
  });

  it("uses fallback for an unconfirmed original until a confirmed change", () => {
    const value = history({
      initialSelection: "unconfirmed",
      changes: [
        change({ selection: "waived" }),
        change({
          selection: "limited",
          effectiveOn: "2026-06-01",
          signedOn: "2026-05-30",
          electionDetails: "Handler-confirmed limited scope.",
        }),
      ],
    });
    expect(errors(value)).toBe("");
    expect(pipSelectionAt(value, "2026-02-28", "elected")).toBe("elected");
    expect(pipSelectionAt(value, "2026-03-01", "elected")).toBe("waived");
    expect(pipSelectionAt(value, "2026-05-31", "limited")).toBe("waived");
    expect(pipSelectionAt(value, "2026-06-01", "elected")).toBe("limited");
    expect(value.initialSelection).toBe("unconfirmed");
  });

  it("requires every selection to differ from its immediately prior value", () => {
    expect(
      errors(history({ changes: [change({ selection: "elected" })] }))
    ).toContain("immediately prior selection");
    const repeated = history({
      changes: [change(), change({ effectiveOn: "2026-04-01" })],
    });
    expect(errors(repeated)).toContain("immediately prior selection");
    expect(() => parseMarylandPipHistory(repeated)).toThrow();
  });

  it.each(["2026-03-01", "2026-02-28"])(
    "rejects duplicate or descending date %s without sorting",
    date => {
      const value = history({
        changes: [
          change(),
          change({
            selection: "elected",
            effectiveOn: date,
            signedOn: "2026-02-27",
          }),
        ],
      });
      const original = structuredClone(value);
      expect(errors(value)).toContain("strictly increasing");
      expect(() => parseMarylandPipHistory(value)).toThrow();
      expect(value).toEqual(original);
    }
  );

  it("accepts ten changes and rejects eleven rather than truncating history", () => {
    const changes: MarylandPipChange[] = Array.from(
      { length: 11 },
      (_, index) =>
        change({
          selection: index % 2 === 0 ? "waived" : "elected",
          effectiveOn: `2026-01-${String(index + 2).padStart(2, "0")}`,
          signedOn: "2026-01-01",
          sourceReference: `signed-source-${index + 1}.pdf`,
        })
    );
    const ten = history({ changes: changes.slice(0, 10) });
    expect(errors(ten)).toBe("");
    expect(parseMarylandPipHistory(ten)?.changes).toHaveLength(10);
    const eleven = history({ changes });
    expect(errors(eleven)).toContain("At most 10");
    expect(() => parseMarylandPipHistory(eleven)).toThrow();
    expect(eleven.changes).toHaveLength(11);
  });

  it("rejects invalid lookup dates even for absent history", () => {
    for (const date of ["", "2026-02-29", "2026-03-01T00:00:00Z"]) {
      expect(() => pipSelectionAt(history(), date, "elected")).toThrow();
      expect(() => pipSelectionAt(undefined, date, "elected")).toThrow();
    }
  });

  it("does not silently use an unconfirmed or malformed timeline in lookup", () => {
    expect(() =>
      pipSelectionAt(
        history({ changes: [change({ confirmed: false })] }),
        "2026-03-01",
        "elected"
      )
    ).toThrow();
    expect(() =>
      pipSelectionAt(history(), "2026-03-01", "full" as MarylandPipSelection)
    ).toThrow();
  });

  it("labels limited selection without implying full election or complete waiver", () => {
    expect(pipSelectionLabel("elected")).toBe("Elected");
    expect(pipSelectionLabel("waived")).toBe("Waived");
    expect(pipSelectionLabel("limited")).toBe(
      "Limited election (see election details)"
    );
    expect(() =>
      pipSelectionLabel("invalid" as MarylandPipSelection)
    ).toThrow();
  });
});

describe("Maryland PIP legacy and documentation-only compatibility", () => {
  it("keeps absent optional history compatible for every legacy state", () => {
    expect(parseMarylandPipHistory(undefined)).toBeUndefined();
    for (const state of ["MD", "VA", "PA", "FL", "IL", "GA", "MA", "TX"]) {
      expect(validateMarylandPipHistory(state, undefined, context)).toEqual([]);
    }
    // This helper adds no new date requirements to absent legacy history.
    expect(
      validateMarylandPipHistory("VA", undefined, {
        effectiveOn: "",
        expiresOn: "",
      })
    ).toEqual([]);
    for (const fallback of ["elected", "limited", "waived"] as const) {
      expect(pipSelectionAt(undefined, "2026-03-01", fallback)).toBe(fallback);
    }
  });

  it("carries an explicit documentation-only notice rather than creating a waiver", () => {
    expect(MARYLAND_PIP_DOCUMENTATION_NOTICE).toContain(
      "does not create an election or waiver"
    );
    expect(MARYLAND_PIP_DOCUMENTATION_NOTICE).toContain(
      "or validate legal effectiveness"
    );
    const value = history();
    expect(errors(value)).toBe("");
    expect(value.changes[0].sourceReference).toBe(
      "signed-election/lease-123/2026-02-28"
    );
  });
});
