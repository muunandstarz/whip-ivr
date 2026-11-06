import { formatUadDenialDate } from "./uadDenial";

/** Wording transcribed from the supplied claim-status follow-up letter and email. */
export const PENDING_CLOSURE_TYPE = "pending_closure";
export const PENDING_CLOSURE_LABEL = "Pending Closure Letter";
export const PENDING_CLOSURE_HINT =
  "Fill the supplied claim-status follow-up letter and matching email. No message is sent by this tool.";
export const PENDING_CLOSURE_DEFAULT_SOL_LANGUAGE =
  "Your claim may be subject to legal filing deadlines, including a statute of limitations. The applicable deadline depends on the nature of your claim and the governing law.";

export const PENDING_CLOSURE_FIELD_META = [
  { key: "letter_date", label: "Letter Date", type: "date" },
  { key: "claimant_name", label: "Claimant Name" },
  { key: "claimant_address", label: "Claimant Address", multiline: true },
  { key: "claim_number", label: "Claim Number" },
  { key: "date_of_loss", label: "Date of Loss", type: "date" },
  { key: "last_contact_date", label: "Last Contact Date", type: "date" },
  {
    key: "additional_info_needed",
    label: "Additional Information Needed (optional)",
    optional: true,
    multiline: true,
  },
  {
    key: "response_days",
    label: "Response Days",
    type: "number",
    min: 1,
    max: 365,
    step: 1,
  },
  { key: "sol_language", label: "Time-Limit Language", multiline: true },
  { key: "handler_name", label: "Handler Name" },
  { key: "handler_title", label: "Handler Title" },
] as const;
export type PendingClosureField =
  (typeof PENDING_CLOSURE_FIELD_META)[number]["key"];
export type PendingClosureFields = Record<PendingClosureField, string>;
export type PendingClosureBuildOptions = { requireComplete?: boolean };
export type PendingClosureEmail = { subject: string; body: string };
export type PendingClosureContent = {
  letterDate: string;
  recipient: string[];
  identity: [string, string][];
  salutation: string;
  paragraphs: { text: string }[];
  signature: string[];
};

/** No claimant, dates, response period, signature, state or legal deadline is inferred. */
export function emptyPendingClosureFields(): PendingClosureFields {
  return {
    ...(Object.fromEntries(
      PENDING_CLOSURE_FIELD_META.map(({ key }) => [key, ""])
    ) as PendingClosureFields),
    sol_language: PENDING_CLOSURE_DEFAULT_SOL_LANGUAGE,
  };
}

/** Restore only own, known string values, never URLs, bytes, inherited properties or getters. */
export function restorePendingClosureFields(
  value: unknown
): PendingClosureFields {
  const result = emptyPendingClosureFields();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  for (const { key } of PENDING_CLOSURE_FIELD_META) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && typeof descriptor.value === "string")
      result[key] = descriptor.value;
  }
  return result;
}

/** Reuse the existing timezone-independent North American, real-calendar-date helper. */
export const formatPendingClosureDate = formatUadDenialDate;
const DATE_FIELDS = [
  "letter_date",
  "date_of_loss",
  "last_contact_date",
] as const;

/** Strip source conditional instructions even when they are pasted into an input. */
function clean(value: string): string {
  return value
    .replace(/\{\{\s*(?:#if\b[^}]*|\/if)\s*\}\}/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function calendarOrder(value: string): number | null {
  const input = clean(value);
  if (!formatPendingClosureDate(input)) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  const year = Number(iso ? iso[1] : us![3]);
  const month = Number(iso ? iso[2] : us![1]);
  const day = Number(iso ? iso[3] : us![2]);
  return year * 10000 + month * 100 + day;
}

/** Only completeness and input consistency are checked; no legal/counsel approval gate. */
export function validatePendingClosureFields(
  fields: PendingClosureFields
): string[] {
  const errors: string[] = [];
  for (const meta of PENDING_CLOSURE_FIELD_META) {
    const value = clean(fields[meta.key]);
    if (!("optional" in meta) && !value)
      errors.push(`${meta.label} is required.`);
    else if (
      "type" in meta &&
      meta.type === "date" &&
      value &&
      !formatPendingClosureDate(value)
    ) {
      errors.push(
        `${meta.label} must be a valid North American calendar date.`
      );
    } else if (
      meta.key === "response_days" &&
      value &&
      (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 365)
    ) {
      errors.push("Response Days must be a positive integer from 1 to 365.");
    }
  }
  const letter = calendarOrder(fields.letter_date);
  if (letter !== null) {
    for (const key of ["date_of_loss", "last_contact_date"] as const) {
      const date = calendarOrder(fields[key]);
      if (date !== null && date > letter) {
        const label =
          key === "date_of_loss" ? "Date of Loss" : "Last Contact Date";
        errors.push(`${label} must not be later than Letter Date.`);
      }
    }
  }
  return errors;
}

export const PENDING_CLOSURE_HEADER = [
  "Whip Claims Management",
  "P.O. Box 10622 Rockville, MD 20849-0622",
  "(855) 906-5949 | claims@drivewhip.com",
] as const;
export const PENDING_CLOSURE_FOOTER =
  "Whip Claims Management | PO BOX 10622 Rockville, MD 20850 | (855) 906-5949";
export const PENDING_CLOSURE_SUBJECT = "Request for response — claim status";
export const PENDING_CLOSURE_CONTACT =
  "Please contact us at (855) 906-5949 or claims@drivewhip.com and reference the claim number above.";
export const PENDING_CLOSURE_DEADLINE_NOTICE =
  "Closing our file does not extend or pause any time limit. This is general information only and is not legal advice. If you have questions about your deadlines, you may wish to consult an attorney.";
export const PENDING_CLOSURE_RIGHTS =
  "Whip Claims Management reserves all rights and defenses. Nothing in this letter waives any of them.";

/** Exact supplied email; intentionally states that the letter is being sent separately. */
export const PENDING_CLOSURE_EMAIL_TEMPLATE = {
  subject: "Claim {{claim_number}} - Response needed",
  body: "{{claimant_name}},\n\nWe are following up on claim {{claim_number}} (date of loss {{date_of_loss}}). Our last contact with you was on {{last_contact_date}}, and we have not heard from you since.\n\nPlease reply to this email or call (855) 906-5949 and reference the claim number above. If we do not hear from you within {{response_days}} days, we will close your claim file. Closing the file is not a denial of your claim.\n\nA letter with more information, including time limits that may apply to your claim, is being sent to you separately.\n\n{{handler_name}}\n{{handler_title}}\nWhip Claims Management\n",
} as const;

function displayValues(
  fields: PendingClosureFields,
  options: PendingClosureBuildOptions
): PendingClosureFields {
  if (options.requireComplete) {
    const errors = validatePendingClosureFields(fields);
    if (errors.length) throw new Error(errors.join(" "));
  }
  const values = emptyPendingClosureFields();
  for (const { key } of PENDING_CLOSURE_FIELD_META) {
    values[key] =
      clean(fields[key]) ||
      (key === "additional_info_needed" ? "" : `{{${key}}}`);
  }
  for (const key of DATE_FIELDS) {
    const input = clean(fields[key]);
    if (input)
      values[key] =
        formatPendingClosureDate(input) ||
        `[Invalid ${key.replaceAll("_", " ")}]`;
  }
  const days = clean(fields.response_days);
  if (days && (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365))
    values.response_days = "[Invalid response days]";
  return values;
}

/** Single authoritative letter content consumed by the plain-text preview and PDF renderer. */
export function pendingClosureContent(
  fields: PendingClosureFields,
  options: PendingClosureBuildOptions = {}
): PendingClosureContent {
  const values = displayValues(fields, options);
  const additional = values.additional_info_needed
    ? ` ${values.additional_info_needed}`
    : "";
  return {
    letterDate: values.letter_date,
    recipient: [values.claimant_name, values.claimant_address],
    identity: [
      ["Subject", PENDING_CLOSURE_SUBJECT],
      ["Claimant", values.claimant_name],
      ["Our claim no.", values.claim_number],
      ["Date of loss", values.date_of_loss],
    ],
    salutation: `Dear ${values.claimant_name}:`,
    paragraphs: [
      {
        text: `We are writing about the claim referenced above. Our last contact with you was on ${values.last_contact_date}, and we have not heard from you since.${additional}`,
      },
      { text: PENDING_CLOSURE_CONTACT },
      {
        text: `If we do not hear from you within ${values.response_days} days of the date of this letter, we will close your claim file. Closing the file is an administrative step and is not a denial of your claim. If you contact us after the file is closed, we will review your request.`,
      },
      { text: `${values.sol_language} ${PENDING_CLOSURE_DEADLINE_NOTICE}` },
      { text: PENDING_CLOSURE_RIGHTS },
    ],
    signature: [
      "Respectfully,",
      values.handler_name,
      values.handler_title,
      "Whip Claims Management",
    ],
  };
}

/** Partial previews show required-field placeholders; request requireComplete for final output. */
export function buildPendingClosureText(
  fields: PendingClosureFields,
  options: PendingClosureBuildOptions = {}
): string {
  const content = pendingClosureContent(fields, options);
  return [
    PENDING_CLOSURE_HEADER.join("\n"),
    content.letterDate,
    content.recipient.join("\n"),
    content.identity.map(([label, value]) => `${label}\t${value}`).join("\n"),
    content.salutation,
    ...content.paragraphs.map(paragraph => paragraph.text),
    `${content.signature[0]}\n\n${content.signature.slice(1).join("\n")}`,
    PENDING_CLOSURE_FOOTER,
  ].join("\n\n");
}

/** Build copyable text only: this function does not send, schedule, or attach anything. */
export function buildPendingClosureEmail(
  fields: PendingClosureFields,
  options: PendingClosureBuildOptions = {}
): PendingClosureEmail {
  const values = displayValues(fields, options);
  const fill = (template: string) =>
    template.replace(/\{\{([a-z_]+)\}\}/g, (token, key: string) =>
      Object.hasOwn(values, key) ? values[key as PendingClosureField] : token
    );
  return {
    subject: fill(PENDING_CLOSURE_EMAIL_TEMPLATE.subject),
    body: fill(PENDING_CLOSURE_EMAIL_TEMPLATE.body),
  };
}
