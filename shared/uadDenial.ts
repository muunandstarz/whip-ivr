/** Wording transcribed verbatim from the owner's WhipUnauthorizedDriverDenialLetterTemplate.pdf. */
export const UAD_DENIAL_TYPE = "uad_denial";
export const UAD_DENIAL_LABEL = "Unauthorized Driver / UAD Denial";
export const UAD_DENIAL_HINT = "Use the supplied unauthorized-driver coverage denial letter after verifying the facts and applicable terms.";
export const UAD_FIELD_META = [
  { key: "letter_date", label: "Letter Date", type: "date" },
  { key: "claimant_name", label: "Claimant Name" },
  { key: "claimant_company", label: "Claimant Company (optional)", optional: true },
  { key: "claimant_address", label: "Claimant Address", multiline: true },
  { key: "claim_number", label: "Claim Number" },
  { key: "date_of_loss", label: "Date of Loss", type: "date" },
  { key: "property_claimed", label: "Property Claimed", multiline: true },
  { key: "driver_description", label: "Driver Description", multiline: true },
  { key: "handler_name", label: "Handler Name" },
  { key: "handler_title", label: "Handler Title" },
] as const;
export type UadDenialField = (typeof UAD_FIELD_META)[number]["key"];
export type UadDenialFields = Record<UadDenialField, string>;

export function emptyUadDenialFields(): UadDenialFields {
  return Object.fromEntries(UAD_FIELD_META.map(({ key }) => [key, ""])) as UadDenialFields;
}

/** Allow only known text inputs; never restore output bytes, URLs or inferred facts. */
export function restoreUadDenialFields(value: unknown): UadDenialFields {
  const result = emptyUadDenialFields();
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    for (const { key } of UAD_FIELD_META) if (typeof source[key] === "string") result[key] = source[key] as string;
  }
  return result;
}

/** Calendar-only parsing avoids UTC/local-day shifts and rejects rollover dates. */
export function formatUadDenialDate(value: string): string | null {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (!iso && !us) return null;
  const year = Number(iso ? iso[1] : us![3]);
  const month = Number(iso ? iso[2] : us![1]);
  const day = Number(iso ? iso[3] : us![2]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  if (year < 1000 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function validateUadDenialFields(fields: UadDenialFields): string[] {
  const errors: string[] = [];
  for (const meta of UAD_FIELD_META) {
    if (!("optional" in meta) && !fields[meta.key].trim()) errors.push(`${meta.label} is required.`);
    else if ("type" in meta && fields[meta.key].trim() && !formatUadDenialDate(fields[meta.key])) errors.push(`${meta.label} must be a valid North American calendar date.`);
  }
  return errors;
}

export const UAD_QUOTES = [
  "“Only Member is permitted to operate the Vehicle as authorized driver.”",
  "“Whip may cancel insurance coverage, protection plan eligibility, liability limits, and/or any other benefit offered to the Member in the event of an unauthorized driver.”",
  "“We are liable only up to the maximum amounts under our insurance coverage and only if the Vehicle was being operated by you or a person entitled to insurance coverage under law.”",
] as const;
export const UAD_RESUBMISSION = "Should you have additional documentation or information you would like us to consider, please submit it to claims@drivewhip.com and reference the claim number above. Any materials received will be reviewed.";
export const UAD_RIGHTS = "Whip Claims Management reserves all rights and defenses. Nothing in this letter waives any of them.";
export const UAD_HEADER = ["Whip Claims Management", "P.O. Box 10622 Rockville, MD 20849-0622", "(855) 906-5949 | claims@drivewhip.com"] as const;
export const UAD_FOOTER = "Whip Claims Management | PO BOX 10622 Rockville, MD 20850 | (855) 906-5949";
export const UAD_ADVISORY = "Before issuance, verify the unauthorized-driver facts, the applicable Membership Agreement and Terms of Service, and applicable coverage and legal requirements. This tool fills the supplied letter; it does not determine coverage or provide legal advice.";

type UadParagraph = { text: string; quote?: boolean };
export function uadDenialContent(fields: UadDenialFields) {
  const text = (key: UadDenialField) => fields[key].trim() || `{{${key}}}`;
  const date = (key: "letter_date" | "date_of_loss") => fields[key].trim() ? formatUadDenialDate(fields[key]) || `[Invalid ${key.replaceAll("_", " ")}]` : text(key);
  const claimant = text("claimant_name");
  const lossDate = date("date_of_loss");
  const paragraphs: UadParagraph[] = [
    { text: `We have completed our investigation of your claim for damage to your ${text("property_claimed")} arising from the ${lossDate} incident. Coverage is not available for this loss, and we are denying your claim. The basis for that decision is set out below.` },
    { text: `The vehicle is leased to a member under a Membership Agreement, which incorporates the Whip Terms of Service. Our investigation found that at the time of this loss the vehicle was being operated by ${text("driver_description")}, who is not an authorized driver. Section 8 of the Terms of Service, Authorized Drivers, states:` },
    { text: UAD_QUOTES[0], quote: true },
    { text: UAD_QUOTES[1], quote: true },
    { text: "Section 12, Insurance Limits of Liability, states:" },
    { text: UAD_QUOTES[2], quote: true },
    { text: "Because the vehicle was being operated by a person who is not the member listed on the Membership Agreement, there is no coverage available for this loss." },
    { text: UAD_RESUBMISSION },
    { text: UAD_RIGHTS },
  ];
  return {
    letterDate: date("letter_date"),
    recipient: [claimant, fields.claimant_company.trim(), text("claimant_address")].filter(Boolean),
    identity: [["Subject", "Notice of coverage denial"], ["Claimant", claimant], ["Our claim no.", text("claim_number")], ["Date of loss", lossDate]] as [string, string][],
    salutation: `Dear ${claimant}:`,
    paragraphs,
    signature: ["Respectfully,", text("handler_name"), text("handler_title"), "Whip Claims Management"],
  };
}

/** The preview and PDF consume this same content; unresolved required fields remain clearly marked. */
export function buildUadDenialText(fields: UadDenialFields): string {
  const content = uadDenialContent(fields);
  return [
    UAD_HEADER.join("\n"), content.letterDate, content.recipient.join("\n"),
    content.identity.map(([label, value]) => `${label}\t${value}`).join("\n"), content.salutation,
    ...content.paragraphs.map(p => p.quote ? `      ${p.text}` : p.text),
    `${content.signature[0]}\n\n${content.signature.slice(1).join("\n")}`, UAD_FOOTER,
  ].join("\n\n");
}
