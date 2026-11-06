import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPendingClosureEmail,
  buildPendingClosureText,
  emptyPendingClosureFields,
  formatPendingClosureDate,
  pendingClosureContent,
  restorePendingClosureFields,
  validatePendingClosureFields,
  PENDING_CLOSURE_DEFAULT_SOL_LANGUAGE,
  PENDING_CLOSURE_EMAIL_TEMPLATE,
  PENDING_CLOSURE_FIELD_META,
  PENDING_CLOSURE_FOOTER,
  PENDING_CLOSURE_HEADER,
  PENDING_CLOSURE_LABEL,
  type PendingClosureFields,
} from "@shared/pendingClosure";

/** Entirely synthetic values; no user claim information or generated PDF is stored. */
export const pendingClosureSample = (): PendingClosureFields => ({
  ...emptyPendingClosureFields(),
  letter_date: "2026-11-06",
  claimant_name: "Jordan Example",
  claimant_address: "123 Example Avenue\nUnit 4\nRockville, MD 20850",
  claim_number: "SYNTHETIC-PC-001",
  date_of_loss: "10/15/2026",
  last_contact_date: "2026-10-29",
  additional_info_needed: "Please provide the requested photographs.",
  response_days: "30",
  handler_name: "Morgan Sample",
  handler_title: "Claims Representative",
});
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const expectedEmailTemplate =
  "Subject: Claim {{claim_number}} - Response needed\n\n{{claimant_name}},\n\nWe are following up on claim {{claim_number}} (date of loss {{date_of_loss}}). Our last contact with you was on {{last_contact_date}}, and we have not heard from you since.\n\nPlease reply to this email or call (855) 906-5949 and reference the claim number above. If we do not hear from you within {{response_days}} days, we will close your claim file. Closing the file is not a denial of your claim.\n\nA letter with more information, including time limits that may apply to your claim, is being sent to you separately.\n\n{{handler_name}}\n{{handler_title}}\nWhip Claims Management\n";

describe("Pending Closure Letter shared content", () => {
  it("exports exactly eleven inputs, blank defaults except the safe generic time-limit text", () => {
    expect(PENDING_CLOSURE_LABEL).toBe("Pending Closure Letter");
    expect(PENDING_CLOSURE_FIELD_META.map(meta => meta.key)).toEqual([
      "letter_date",
      "claimant_name",
      "claimant_address",
      "claim_number",
      "date_of_loss",
      "last_contact_date",
      "additional_info_needed",
      "response_days",
      "sol_language",
      "handler_name",
      "handler_title",
    ]);
    expect(
      PENDING_CLOSURE_FIELD_META.filter(meta => "optional" in meta).map(
        meta => meta.key
      )
    ).toEqual(["additional_info_needed"]);
    const fields = emptyPendingClosureFields();
    for (const { key } of PENDING_CLOSURE_FIELD_META)
      expect(fields[key]).toBe(
        key === "sol_language" ? PENDING_CLOSURE_DEFAULT_SOL_LANGUAGE : ""
      );
    expect(PENDING_CLOSURE_DEFAULT_SOL_LANGUAGE).toBe(
      "Your claim may be subject to legal filing deadlines, including a statute of limitations. The applicable deadline depends on the nature of your claim and the governing law."
    );
    expect(validatePendingClosureFields(fields)).toHaveLength(9);
    expect(
      validatePendingClosureFields({ ...fields, sol_language: "" })
    ).toHaveLength(10);
    expect(emptyPendingClosureFields()).not.toBe(fields);
  });

  it("preserves the supplied header and footer, including their different postal codes", () => {
    expect(PENDING_CLOSURE_HEADER).toEqual([
      "Whip Claims Management",
      "P.O. Box 10622 Rockville, MD 20849-0622",
      "(855) 906-5949 | claims@drivewhip.com",
    ]);
    expect(PENDING_CLOSURE_FOOTER).toBe(
      "Whip Claims Management | PO BOX 10622 Rockville, MD 20850 | (855) 906-5949"
    );
  });

  it("matches all authoritative letter paragraphs, recipient, identity and closing exactly", () => {
    const fields = pendingClosureSample();
    const content = pendingClosureContent(fields, { requireComplete: true });
    expect(content.letterDate).toBe("November 6, 2026");
    expect(content.recipient).toEqual([
      fields.claimant_name,
      fields.claimant_address,
    ]);
    expect(content.identity).toEqual([
      ["Subject", "Request for response — claim status"],
      ["Claimant", "Jordan Example"],
      ["Our claim no.", "SYNTHETIC-PC-001"],
      ["Date of loss", "October 15, 2026"],
    ]);
    expect(content.salutation).toBe("Dear Jordan Example:");
    expect(content.paragraphs.map(paragraph => paragraph.text)).toEqual([
      "We are writing about the claim referenced above. Our last contact with you was on October 29, 2026, and we have not heard from you since. Please provide the requested photographs.",
      "Please contact us at (855) 906-5949 or claims@drivewhip.com and reference the claim number above.",
      "If we do not hear from you within 30 days of the date of this letter, we will close your claim file. Closing the file is an administrative step and is not a denial of your claim. If you contact us after the file is closed, we will review your request.",
      `${PENDING_CLOSURE_DEFAULT_SOL_LANGUAGE} Closing our file does not extend or pause any time limit. This is general information only and is not legal advice. If you have questions about your deadlines, you may wish to consult an attorney.`,
      "Whip Claims Management reserves all rights and defenses. Nothing in this letter waives any of them.",
    ]);
    expect(content.signature).toEqual([
      "Respectfully,",
      "Morgan Sample",
      "Claims Representative",
      "Whip Claims Management",
    ]);
    const text = buildPendingClosureText(fields, { requireComplete: true });
    for (const paragraph of content.paragraphs)
      expect(text).toContain(paragraph.text);
    expect(text).not.toMatch(/\{\{|undefined|NaN|Invalid/);
  });

  it.each(["", " \n ", "{{#if additional_info_needed}}{{/if}}"])(
    "omits blank optional content without leaving instructions: %j",
    additional_info_needed => {
      const fields = { ...pendingClosureSample(), additional_info_needed };
      expect(validatePendingClosureFields(fields)).toEqual([]);
      expect(pendingClosureContent(fields).paragraphs[0].text).toBe(
        "We are writing about the claim referenced above. Our last contact with you was on October 29, 2026, and we have not heard from you since."
      );
      expect(buildPendingClosureText(fields)).not.toMatch(
        /\{\{(?:#if|\/if|additional_info_needed)/
      );
    }
  );

  it("appends only supplied additional text and strips pasted conditional instructions everywhere", () => {
    const fields = {
      ...pendingClosureSample(),
      additional_info_needed:
        "{{#if additional_info_needed}}Please provide photographs.{{/if}}",
      handler_title: "{{#if handler_title}}Representative{{/if}}",
    };
    expect(pendingClosureContent(fields).paragraphs[0].text).toMatch(
      /since\. Please provide photographs\.$/
    );
    for (const text of [
      buildPendingClosureText(fields),
      buildPendingClosureEmail(fields).body,
    ])
      expect(text).not.toMatch(/\{\{(?:#if|\/if)/);
    expect(buildPendingClosureEmail(fields).body).not.toContain("photographs");
  });

  it("permits partial previews without approval or counsel fields and validates only when final output is requested", () => {
    const fields = { ...emptyPendingClosureFields(), sol_language: "" };
    const text = buildPendingClosureText(fields);
    for (const { key } of PENDING_CLOSURE_FIELD_META.filter(
      meta => meta.key !== "additional_info_needed"
    ))
      expect(text).toContain(`{{${key}}}`);
    expect(text).not.toContain("{{additional_info_needed}}");
    expect(text).not.toMatch(/\{\{(?:#if|\/if)/);
    expect(() =>
      buildPendingClosureText(fields, { requireComplete: true })
    ).toThrow("Letter Date is required.");
    expect(() =>
      pendingClosureContent(fields, { requireComplete: true })
    ).toThrow("Response Days is required.");
    expect(() =>
      buildPendingClosureEmail(fields, { requireComplete: true })
    ).toThrow("Handler Name is required.");
    expect(buildPendingClosureEmail(fields).subject).toBe(
      "Claim {{claim_number}} - Response needed"
    );
    expect(validatePendingClosureFields(pendingClosureSample())).toEqual([]);
    expect(
      buildPendingClosureText(pendingClosureSample(), { requireComplete: true })
    ).not.toMatch(/counsel approval|confirmed|reviewed by/);
  });

  it.each([
    ["2026-11-06", "November 6, 2026"],
    ["11/6/2026", "November 6, 2026"],
    [" 11/06/2026 ", "November 6, 2026"],
    ["2024-02-29", "February 29, 2024"],
    ["02/29/2000", "February 29, 2000"],
    ["1000-01-01", "January 1, 1000"],
  ])(
    "formats real North American calendar dates without timezone shifts: %s",
    (date, expected) => {
      expect(formatPendingClosureDate(date)).toBe(expected);
    }
  );

  it.each([
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "2026-11-31",
    "06/11/26",
    "31/10/2026",
    "0999-12-31",
    "2026-1-1",
    "2026-11-06T00:00:00Z",
    "garbage",
    "",
  ])("rejects impossible, ambiguous or non-calendar dates: %j", date => {
    expect(formatPendingClosureDate(date)).toBeNull();
  });

  it.each(["letter_date", "date_of_loss", "last_contact_date"] as const)(
    "validates malformed %s and marks it clearly in partial previews",
    key => {
      const fields = { ...pendingClosureSample(), [key]: "2026-02-29" };
      expect(validatePendingClosureFields(fields)).toHaveLength(1);
      expect(validatePendingClosureFields(fields)[0]).toContain(
        "must be a valid North American calendar date."
      );
      expect(buildPendingClosureText(fields)).toContain(
        `[Invalid ${key.replaceAll("_", " ")}]`
      );
    }
  );

  it("compares calendar dates across formats and permits equality, but not dates after the letter", () => {
    const fields = {
      ...pendingClosureSample(),
      letter_date: "11/06/2026",
      date_of_loss: "2026-11-06",
      last_contact_date: "11/6/2026",
    };
    expect(validatePendingClosureFields(fields)).toEqual([]);
    expect(
      validatePendingClosureFields({
        ...fields,
        date_of_loss: "11/07/2026",
        last_contact_date: "2026-12-01",
      })
    ).toEqual([
      "Date of Loss must not be later than Letter Date.",
      "Last Contact Date must not be later than Letter Date.",
    ]);
    expect(
      validatePendingClosureFields({
        ...fields,
        letter_date: "bad",
        date_of_loss: "2026-12-31",
      })
    ).toEqual(["Letter Date must be a valid North American calendar date."]);
  });

  it.each(["1", "365", " 30 ", "001"])(
    "accepts positive integer response periods at and within the bounds: %j",
    response_days => {
      expect(
        validatePendingClosureFields({
          ...pendingClosureSample(),
          response_days,
        })
      ).toEqual([]);
    }
  );

  it.each([
    "0",
    "366",
    "-1",
    "1.5",
    "30.0",
    "+30",
    "1e2",
    "Infinity",
    "NaN",
    "30 days",
    "9007199254740993",
  ])("rejects invalid response periods: %j", response_days => {
    const fields = { ...pendingClosureSample(), response_days };
    expect(validatePendingClosureFields(fields)).toEqual([
      "Response Days must be a positive integer from 1 to 365.",
    ]);
    expect(buildPendingClosureText(fields)).toContain(
      "[Invalid response days]"
    );
    expect(buildPendingClosureEmail(fields).body).toContain(
      "[Invalid response days]"
    );
  });

  it("requires a response period rather than silently choosing one", () => {
    expect(
      validatePendingClosureFields({
        ...pendingClosureSample(),
        response_days: " ",
      })
    ).toEqual(["Response Days is required."]);
    expect(buildPendingClosureText(emptyPendingClosureFields())).toContain(
      "within {{response_days}} days"
    );
  });

  it("restores only own known string fields, never bytes, URLs, numeric inputs, extra fields, inherited fields or accessors", () => {
    const fields = pendingClosureSample();
    expect(
      restorePendingClosureFields({
        ...fields,
        claim_number: 123,
        response_days: 30,
        pdfUrl: "blob:stale",
        pdfBytes: new Uint8Array([1]),
        state: "Example",
        ownerName: "NOT A HANDLER",
        confirmed: true,
      })
    ).toEqual({ ...fields, claim_number: "", response_days: "" });
    expect(restorePendingClosureFields(Object.create(fields))).toEqual(
      emptyPendingClosureFields()
    );
    const getter = Object.defineProperty({}, "handler_name", {
      get() {
        throw new Error("Do not read getters");
      },
    });
    expect(restorePendingClosureFields(getter)).toEqual(
      emptyPendingClosureFields()
    );
    for (const invalid of [
      null,
      undefined,
      false,
      42,
      '{"claim_number":"unsafe"}',
      [fields],
    ])
      expect(restorePendingClosureFields(invalid)).toEqual(
        emptyPendingClosureFields()
      );
    expect(
      restorePendingClosureFields({ sol_language: "", handler_name: "" })
        .sol_language
    ).toBe("");
    expect(
      Object.keys(
        restorePendingClosureFields(
          JSON.parse('{"__proto__":{"polluted":true}}')
        )
      )
    ).toHaveLength(11);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("leaves input objects untouched and never derives jurisdiction-specific years or deadlines", () => {
    const fields = pendingClosureSample();
    const before = structuredClone(fields);
    buildPendingClosureText(fields);
    buildPendingClosureEmail(fields);
    validatePendingClosureFields(fields);
    pendingClosureContent(fields);
    expect(fields).toEqual(before);
    expect(buildPendingClosureText(fields)).not.toMatch(
      /\b\d+ years?\b|deadline is|must file by|Maryland law/
    );
    const supplied = {
      ...fields,
      sol_language: "User-supplied time-limit language.",
    };
    expect(pendingClosureContent(supplied).paragraphs[3].text).toMatch(
      /^User-supplied time-limit language\. Closing our file/
    );
  });

  it("keeps the source email exactly unchanged, including line breaks and the separate-letter statement", () => {
    expect(
      `Subject: ${PENDING_CLOSURE_EMAIL_TEMPLATE.subject}\n\n${PENDING_CLOSURE_EMAIL_TEMPLATE.body}`
    ).toBe(expectedEmailTemplate);
    const fields = pendingClosureSample();
    const expected = expectedEmailTemplate.replace(
      /\{\{([a-z_]+)\}\}/g,
      (_, key: keyof PendingClosureFields) =>
        key === "date_of_loss" || key === "last_contact_date"
          ? formatPendingClosureDate(fields[key])!
          : fields[key]
    );
    const email = buildPendingClosureEmail(fields, { requireComplete: true });
    expect(`Subject: ${email.subject}\n\n${email.body}`).toBe(expected);
    expect(email.body).not.toContain(fields.additional_info_needed);
    expect(email.body).not.toContain(fields.sol_language);
    expect(email.body).toContain(
      "A letter with more information, including time limits that may apply to your claim, is being sent to you separately."
    );
    expect(email.body).toContain(
      "Closing the file is not a denial of your claim."
    );
  });

  it("matches local supplied references when available, without storing them in the repository", () => {
    const emailPath =
      "/home/ubuntu/upload/WhipClaimStatusFollow-UpEmailTemplate.txt";
    if (existsSync(emailPath))
      expect(
        `Subject: ${PENDING_CLOSURE_EMAIL_TEMPLATE.subject}\n\n${PENDING_CLOSURE_EMAIL_TEMPLATE.body}`
      ).toBe(readFileSync(emailPath, "utf8"));
    const letterPath =
      "/home/ubuntu/upload/WhipClaimStatusFollow-UpLetterTemplate.pdf";
    if (!existsSync(letterPath)) return;
    for (const optional of ["", "Please provide the requested photographs."]) {
      const fields = {
        ...pendingClosureSample(),
        additional_info_needed: optional,
      };
      let template = execFileSync("pdftotext", ["-layout", letterPath, "-"], {
        encoding: "utf8",
      });
      template = template.replace(
        /\{\{#if additional_info_needed\}\}[\s\S]*?\{\{\/if\}\}/g,
        optional
      );
      for (const [key, value] of Object.entries(fields))
        template = template.replaceAll(
          `{{${key}}}`,
          ["letter_date", "date_of_loss", "last_contact_date"].includes(key)
            ? formatPendingClosureDate(value)!
            : value
        );
      expect(normalize(buildPendingClosureText(fields))).toBe(
        normalize(template)
      );
    }
  });
});
