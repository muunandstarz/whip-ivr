import { z } from "zod";

/** Calendar-date documentation only; not a legal-effectiveness or coverage test. */
export const MARYLAND_PIP_DOCUMENTATION_NOTICE =
  "These dates document the handler-confirmed election or waiver history. This record does not create an election or waiver, establish coverage, or validate legal effectiveness.";

const pipSelectionSchema = z.enum(["elected", "limited", "waived"]);
export type MarylandPipSelection = z.infer<typeof pipSelectionSchema>;
const initialPipSelectionSchema = z.enum([
  "elected",
  "limited",
  "waived",
  "unconfirmed",
]);

/** Reject rollover dates, timestamps, noncanonical formatting, and year zero. */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 10) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= monthDays[month - 1];
}

const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, "Must be a real calendar date in YYYY-MM-DD format.");

const pipChangeSchema = z
  .object({
    selection: pipSelectionSchema,
    effectiveOn: calendarDateSchema,
    signedOn: calendarDateSchema,
    // A reference to existing signed evidence; this helper does not sign it.
    sourceReference: z
      .string()
      .max(300, "Source reference must be at most 300 characters.")
      .refine(value => value.trim().length > 0, {
        message: "A nonblank reference to the signed source is required.",
      }),
    // No standard scope is inferred for a limited election.
    electionDetails: z
      .string()
      .max(800, "Election details must be at most 800 characters."),
    confirmed: z.boolean().refine(value => value === true, {
      message: "Each change must be explicitly confirmed.",
    }),
  })
  .strict()
  .superRefine((change, ctx) => {
    if (
      isCalendarDate(change.signedOn) &&
      isCalendarDate(change.effectiveOn) &&
      change.signedOn > change.effectiveOn
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["signedOn"],
        message:
          "The documented signing date must be on or before the documented effective date.",
      });
    }
    if (change.selection === "limited" && !change.electionDetails.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["electionDetails"],
        message:
          "Describe the handler-confirmed scope of the limited election.",
      });
    }
  });

export type MarylandPipChange = z.infer<typeof pipChangeSchema>;

const marylandPipHistorySchema = z
  .object({
    // Original rental/enrollment baseline, never the inferred renewal date.
    rentalEffectiveOn: calendarDateSchema,
    initialSelection: initialPipSelectionSchema,
    initialElectionDetails: z
      .string()
      .max(800, "Initial election details must be at most 800 characters.")
      .optional(),
    changes: z
      .array(pipChangeSchema)
      .max(10, "At most 10 PIP changes may be documented."),
  })
  .strict()
  .superRefine((history, ctx) => {
    if (
      history.initialSelection === "limited" &&
      !history.initialElectionDetails?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["initialElectionDetails"],
        message:
          "Describe the handler-confirmed scope of the initial limited election.",
      });
    }
    let previousSelection = history.initialSelection;
    let previousDate: string | undefined;
    history.changes.forEach((change, index) => {
      if (change.selection === previousSelection) {
        ctx.addIssue({
          code: "custom",
          path: ["changes", index, "selection"],
          message:
            "Each change must differ from the immediately prior selection.",
        });
      }
      if (isCalendarDate(change.effectiveOn)) {
        if (
          isCalendarDate(history.rentalEffectiveOn) &&
          change.effectiveOn < history.rentalEffectiveOn
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["changes", index, "effectiveOn"],
            message:
              "A change cannot precede the original rental effective date.",
          });
        }
        if (previousDate !== undefined && change.effectiveOn <= previousDate) {
          ctx.addIssue({
            code: "custom",
            path: ["changes", index, "effectiveOn"],
            message: "Change effective dates must be strictly increasing.",
          });
        }
        previousDate = change.effectiveOn;
      }
      previousSelection = change.selection;
    });
  });

export type MarylandPipHistory = z.infer<typeof marylandPipHistorySchema>;

export type MarylandPipHistoryContext = {
  /** Current policy term start; may be later than the original rental start. */
  effectiveOn: string;
  /** Packet's exclusive expiration boundary. */
  expiresOn: string;
  /** Explicit confirmed as-of date; never defaults to the clock or term start. */
  referenceOn?: string;
  /** Documented cancellation date, inclusive for history changes. */
  cancelledOn?: string;
};

/**
 * Strict, noncoercing parser for optional KlutchPolicyTerms.marylandPipHistory.
 * Only undefined means absent. Null, unknown keys, missing fields, invalid dates,
 * and internally inconsistent/unconfirmed changes throw a ZodError. No defaults,
 * trimming, sorting, or date inference occur; the parsed result is a fresh copy.
 * State and packet boundaries still require validateMarylandPipHistory.
 */
export function parseMarylandPipHistory(
  value: unknown
): MarylandPipHistory | undefined {
  if (value === undefined) return undefined;
  return marylandPipHistorySchema.parse(value);
}

/**
 * Deterministic documentation checks, not a conclusion about legal effectiveness.
 * Missing history is compatible with legacy policies in any state. Present history
 * is MD-only, including empty histories. Earlier-term changes remain in the rental
 * timeline; do not discard them or reset the baseline at a renewal boundary.
 */
export function validateMarylandPipHistory(
  state: string,
  history: MarylandPipHistory | undefined,
  context: MarylandPipHistoryContext
): string[] {
  if (history === undefined) return [];
  const errors: string[] = [];
  if (state !== "MD")
    errors.push("marylandPipHistory is permitted only for MD policies.");

  // Check again here so forged runtime values cannot bypass the parser.
  const parsed = marylandPipHistorySchema.safeParse(history);
  if (!parsed.success) {
    errors.push(
      ...parsed.error.issues.map(issue => {
        const path = ["marylandPipHistory", ...issue.path].join(".");
        return `${path}: ${issue.message}`;
      })
    );
  }

  const validEffective = isCalendarDate(context.effectiveOn);
  const validExpires = isCalendarDate(context.expiresOn);
  if (!validEffective)
    errors.push(
      "effectiveOn must be a real calendar date in YYYY-MM-DD format."
    );
  if (!validExpires)
    errors.push("expiresOn must be a real calendar date in YYYY-MM-DD format.");
  if (
    validEffective &&
    validExpires &&
    context.effectiveOn >= context.expiresOn
  ) {
    errors.push("expiresOn must be later than the policy term effectiveOn.");
  }
  const validReference =
    context.referenceOn !== undefined && isCalendarDate(context.referenceOn);
  const validCancellation =
    context.cancelledOn !== undefined && isCalendarDate(context.cancelledOn);
  if (context.referenceOn !== undefined && !validReference) {
    errors.push(
      "referenceOn must be a real calendar date in YYYY-MM-DD format when supplied."
    );
  }
  if (context.cancelledOn !== undefined && !validCancellation) {
    errors.push(
      "cancelledOn must be a real calendar date in YYYY-MM-DD format when supplied."
    );
  }
  if (!parsed.success) return errors;

  const documented = parsed.data;
  if (validEffective && documented.rentalEffectiveOn > context.effectiveOn) {
    errors.push(
      "marylandPipHistory.rentalEffectiveOn must be on or before the policy term effectiveOn."
    );
  }
  documented.changes.forEach((change, index) => {
    const path = `marylandPipHistory.changes.${index}.effectiveOn`;
    if (validExpires && change.effectiveOn >= context.expiresOn) {
      errors.push(
        `${path}: A change must precede the packet expiresOn (exclusive).`
      );
    }
    if (validReference && change.effectiveOn > context.referenceOn!) {
      errors.push(
        `${path}: A change cannot be later than the confirmed referenceOn.`
      );
    }
    if (validCancellation && change.effectiveOn > context.cancelledOn!) {
      errors.push(
        `${path}: A change cannot be later than cancelledOn (inclusive).`
      );
    }
  });
  return errors;
}

/**
 * Look up the documented selection at an explicit calendar date (change dates are
 * inclusive). Before rental start or with absent history, use the caller's explicit
 * fallback. This does not determine coverage, expiration, cancellation, or legal
 * effectiveness. Validate the state/context before using a history in a packet.
 */
export function pipSelectionAt(
  history: MarylandPipHistory | undefined,
  date: string,
  fallback: MarylandPipSelection
): MarylandPipSelection {
  if (!isCalendarDate(date))
    throw new Error("A real selection date in YYYY-MM-DD format is required.");
  pipSelectionSchema.parse(fallback);
  const documented = parseMarylandPipHistory(history);
  if (documented === undefined || date < documented.rentalEffectiveOn)
    return fallback;
  let selection: MarylandPipSelection =
    documented.initialSelection === "unconfirmed"
      ? fallback
      : documented.initialSelection;
  for (const change of documented.changes) {
    if (change.effectiveOn > date) break;
    selection = change.selection;
  }
  return selection;
}

/** Labels report the recorded selection only; limited scope stays in electionDetails. */
export function pipSelectionLabel(selection: MarylandPipSelection): string {
  const labels: Record<MarylandPipSelection, string> = {
    elected: "Elected",
    limited: "Limited election (see election details)",
    waived: "Waived",
  };
  return labels[pipSelectionSchema.parse(selection)];
}
