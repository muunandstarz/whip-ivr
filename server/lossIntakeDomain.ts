export type LossVehicleType = "gas" | "ev_tesla" | "unknown";
export type LossStage =
  | "awaiting_outreach"
  | "outreach_started"
  | "contact_attempts"
  | "complete";
export type LossSlaState = "within_sla" | "at_risk" | "breached";
export type LossSlaType = "immediate" | "after_hours";
export type LossEventType =
  | "posted"
  | "acknowledgment"
  | "contact_attempt"
  | "completion"
  | "other";

export interface SlackFileRef {
  id?: string;
  name?: string;
  mimetype?: string;
}

export interface SlackLossMessage {
  ts: string;
  text: string;
  userId?: string | null;
  userName?: string | null;
  files?: SlackFileRef[];
  eventId?: string | null;
}

export interface SlackLossParent extends SlackLossMessage {
  channelId: string;
  channelName: string;
  permalink?: string | null;
}

export interface IntakeAgentAssignment {
  slackUserId: string;
  handlerId: number;
  handlerName: string;
}

export interface ParsedLossParent {
  slackKey: string;
  channelId: string;
  channelName: string;
  slackMessageTs: string;
  slackEventId?: string | null;
  slackPermalink: string | null;
  postedAt: Date;
  memberName: string | null;
  customerId: string | null;
  vinLastSix: string | null;
  market: string | null;
  vehicleType: LossVehicleType;
  hasPhotos: boolean;
  attachmentCount: number;
  rideshareStatus: string | null;
  dateOfLoss: string | null;
}

export interface ParsedLossEvent {
  slackEventKey: string;
  slackEventTs: string;
  occurredAt: Date;
  actorSlackUserId: string | null;
  actorName: string | null;
  eventType: LossEventType;
  body: string;
  metadata: Record<string, unknown>;
}

export interface QualityCriterionResult {
  criterion:
    | "first_contact_sla"
    | "facts_of_loss"
    | "fol_quality"
    | "preliminary_liability"
    | "rideshare_status"
    | "photo_evidence"
    | "attempt_documentation"
    | "store_team_tagged"
    | "tesla_footage_request";
  result: "pass" | "fail" | "not_applicable";
  points: number;
  maxPoints: number;
  evidence: string;
  coachingNote: string | null;
}

export interface ThreadAnalysis {
  assignedHandlerId: number | null;
  assignedAgent: string | null;
  stage: LossStage;
  firstContactAt: Date | null;
  firstContactMinutes: number | null;
  slaState: LossSlaState;
  slaType: LossSlaType;
  slaDeadlineAt: Date | null;
  completedAt: Date | null;
  intakeCycleMinutes: number | null;
  factsOfLoss: string | null;
  folQualityScore: number | null;
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  noAnswerAttempts: number;
  contactAttempts: number;
  storeTeamTagged: boolean;
  templatePostedAt: Date | null;
  templatePostMinutesFromContact: number | null;
  templatePostMinutesFromReport: number | null;
  teslaFootageRequested: boolean | null;
  qualityScore: number;
  missingElements: string[];
  events: ParsedLossEvent[];
  qualityItems: QualityCriterionResult[];
}

const FNOL_LABELS = [
  "Market",
  "Vehicle Type",
  "Was there a USB in the car?",
  "Was there footage?",
  "If there was no USB in the car, why?",
  "Last 6 of VIN",
  "Mileage",
  "Member Name/Customer ID",
  "Member Phone Number (Confirm Active)",
  "Member Preferred Language",
  "Preferred Language",
  "Date and Time of Loss (if known)",
  "Location of Loss (if known)",
  "Rideshare Status at the Time of Loss (if known):",
] as const;

const normalizeLabel = (value: string) =>
  value
    .replace(/^\*+|\*+$/g, "")
    .replace(/:$/, "")
    .trim()
    .toLowerCase();

const LABEL_LOOKUP = new Set(FNOL_LABELS.map(normalizeLabel));

export function slackTsToDate(ts: string): Date {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) throw new Error(`Invalid Slack timestamp: ${ts}`);
  return new Date(seconds * 1000);
}

function extractLabeledValues(text: string): Map<string, string> {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const values = new Map<string, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const label = normalizeLabel(lines[index]);
    if (!LABEL_LOOKUP.has(label)) continue;

    const next = lines[index + 1];
    if (!next || LABEL_LOOKUP.has(normalizeLabel(next)) || /^<[@!]/.test(next)) {
      values.set(label, "");
      continue;
    }
    values.set(label, next.replace(/^\*+|\*+$/g, "").trim());
  }

  return values;
}

function getLabel(values: Map<string, string>, label: string): string | null {
  const value = values.get(normalizeLabel(label))?.trim();
  return value ? value : null;
}

function parseMemberAndCustomer(raw: string | null): {
  memberName: string | null;
  customerId: string | null;
} {
  if (!raw) return { memberName: null, customerId: null };
  const clean = raw.replace(/\s+/g, " ").trim();
  const idFirst = clean.match(/^#?(\d{2,}),\s*(.+)$/);
  if (idFirst) return { memberName: idFirst[2].trim(), customerId: idFirst[1] };

  const idLast = clean.match(/^(.+?)[,\s]+#?(\d{2,})$/);
  if (idLast) return { memberName: idLast[1].trim(), customerId: idLast[2] };

  return { memberName: clean, customerId: null };
}

function normalizeVehicleType(raw: string | null): LossVehicleType {
  if (!raw) return "unknown";
  const value = raw.toLowerCase();
  if (value.includes("tesla") || value.includes("electric") || value === "ev") {
    return "ev_tesla";
  }
  if (value.includes("gas")) return "gas";
  return "unknown";
}

/**
 * Extract date of loss from the FNOL parent text.
 * Looks for the "Date and Time of Loss" labeled field first,
 * then falls back to common date patterns in the text.
 */
function extractDateOfLoss(values: Map<string, string>, fullText: string): string | null {
  // Try labeled field first
  const labeled = getLabel(values, "Date and Time of Loss (if known)");
  if (labeled && labeled.length > 2) return labeled;

  // Fallback: look for "DOL:" or "date of loss:" patterns in text
  const dolMatch = fullText.match(/\b(?:DOL|date of loss)\s*[:\-–]\s*([^\n,]{3,30})/i);
  if (dolMatch) return dolMatch[1].trim();

  return null;
}

/**
 * Assess the quality of the Facts of Loss text.
 * Returns a score 0-10 based on length, specificity, and key elements.
 */
export function assessFolQuality(fol: string | null): number {
  if (!fol || fol.trim().length < 10) return 0;
  const text = fol.trim();
  let score = 0;

  // Length-based scoring (up to 4 pts)
  if (text.length >= 20) score += 1;
  if (text.length >= 50) score += 1;
  if (text.length >= 100) score += 1;
  if (text.length >= 150) score += 1;

  // Key elements (up to 6 pts)
  if (/\b(hit|struck|collid|impact|accident|crash|rear.end|side.swipe|t.bone)\b/i.test(text)) score += 1;
  if (/\b(vehicle|car|truck|van|suv|whip)\b/i.test(text)) score += 1;
  if (/\b(driver|member|claimant|third.party|other.party)\b/i.test(text)) score += 1;
  if (/\b(street|road|highway|intersection|parking|lot|location|at|on)\b/i.test(text)) score += 1;
  if (/\b(damage|injury|injuries|hurt|pain|airbag|totaled|driveable)\b/i.test(text)) score += 1;
  if (/\b(police|report|filed|cited|fault|liable|liability)\b/i.test(text)) score += 1;

  return Math.min(10, score);
}

/**
 * Detect whether a message is the handler's completion template post.
 * Looks for FOL / rideshare / prelim liability template keywords together.
 */
function isHandlerTemplate(text: string): boolean {
  const hasFol = /\b(?:facts? of loss|FOL)\s*[:\-–]/i.test(text);
  const hasPrelim = /\b(?:preliminary liability|prelim\s*liability|preliminary|liability)\s*[:\-–]/i.test(text);
  const hasRideshare = /\b(?:rideshare|TNC)\s*(?:status)?\s*[:\-–]/i.test(text);
  // Require at least 2 of the 3 template sections to be present (standard format)
  if ([hasFol, hasPrelim, hasRideshare].filter(Boolean).length >= 2) return true;

  // Short narrative format: Member\nDOL:\nFact of loss:\nPreliminary:
  const hasDol = /\bDOL\s*[:\-–]/i.test(text);
  const hasFactOfLoss = /\bfact(?:s)? of loss\s*[:\-–]/i.test(text);
  const hasPrelimShort = /\bpreliminary\s*[:\-–]/i.test(text);
  if (hasDol && hasFactOfLoss && hasPrelimShort) return true;

  // Full template with Date of Loss + Facts of Loss + Member Name
  const hasDateOfLoss = /\bdate of loss\s*[:\-–]/i.test(text);
  const hasMemberName = /\bmember name\s*[:\-–]/i.test(text);
  if (hasDateOfLoss && hasFol && hasMemberName) return true;

  return false;
}

/**
 * Detect whether any message in the thread tags a store team.
 * Store team handles use patterns like @atlteam, @chiteam, @dcteam, etc.
 */
function detectStoreTeamTag(messages: SlackLossMessage[]): boolean {
  const storeTeamPattern = /<@[A-Z0-9]+>|@(?:atl|chi|dc|md|va|bos|mia|orl|dal|philly|rockville|glenburnie|richmond)team\b/i;
  const userGroupPattern = /<!subteam\^[A-Z0-9]+/i;
  return messages.some(m =>
    storeTeamPattern.test(m.text) || userGroupPattern.test(m.text)
  );
}

export function isFnolParent(text: string): boolean {
  const values = extractLabeledValues(text);
  return ["Market", "Vehicle Type", "Member Name/Customer ID"].every(label =>
    values.has(normalizeLabel(label)),
  );
}

export function parseFnolParent(parent: SlackLossParent): ParsedLossParent | null {
  if (!isFnolParent(parent.text)) return null;
  const values = extractLabeledValues(parent.text);
  const member = parseMemberAndCustomer(
    getLabel(values, "Member Name/Customer ID"),
  );
  const files = parent.files ?? [];

  return {
    slackKey: `${parent.channelId}:${parent.ts}`,
    channelId: parent.channelId,
    channelName: parent.channelName,
    slackMessageTs: parent.ts,
    slackEventId: parent.eventId ?? null,
    slackPermalink: parent.permalink ?? null,
    postedAt: slackTsToDate(parent.ts),
    memberName: member.memberName,
    customerId: member.customerId,
    vinLastSix: getLabel(values, "Last 6 of VIN")?.replace(/\D/g, "").slice(-6) ?? null,
    market: getLabel(values, "Market"),
    vehicleType: normalizeVehicleType(getLabel(values, "Vehicle Type")),
    hasPhotos: files.length > 0,
    attachmentCount: files.length,
    rideshareStatus: getLabel(values, "Rideshare Status at the Time of Loss (if known):"),
    dateOfLoss: extractDateOfLoss(values, parent.text),
  };
}

function eventDate(message: SlackLossMessage): Date {
  return slackTsToDate(message.ts);
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

function configuredAgent(
  message: SlackLossMessage,
  assignments: IntakeAgentAssignment[],
): IntakeAgentAssignment | null {
  return assignments.find(agent => agent.slackUserId === message.userId) ?? null;
}

function isAcknowledgment(text: string): boolean {
  return /\b(calling|contacting|reaching out|reach(?:ing)? out|called|spoke (?:to|with)|on it|taking this)\b/i.test(
    text,
  );
}

function isContactAttempt(text: string): boolean {
  return /\b(no answer|did(?: not|n't) answer|unanswered|left (?:a )?(?:voicemail|message)|attempt(?:ed|ing)?|called (?:the )?(?:member|customer|driver|cx)|tried|trying to reach|reaching out again|follow.?up)\b/i.test(
    text,
  );
}

function isTeslaFootageRequest(text: string): boolean {
  return /\b(?:request|requested|check|checking|pull|retrieve|review|look for|need)\b[^.\n]{0,80}\b(?:tesla|dashcam|footage|video)\b/i.test(
    text,
  );
}

function extractReplyField(text: string, label: RegExp): string | null {
  const match = text.match(label);
  return match?.[1]?.trim() || null;
}

function latestReplyField(
  replies: SlackLossMessage[],
  label: RegExp,
): string | null {
  for (let index = replies.length - 1; index >= 0; index -= 1) {
    const value = extractReplyField(replies[index].text, label);
    if (value) return value;
  }
  return null;
}

function buildQualityItems(input: {
  vehicleType: LossVehicleType;
  firstContactMinutes: number | null;
  slaMinutes: number;
  factsOfLoss: string | null;
  folQualityScore: number | null;
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  hasPhotos: boolean;
  noAnswerAttempts: number;
  contactAttempts: number;
  storeTeamTagged: boolean;
  teslaFootageRequested: boolean | null;
}): QualityCriterionResult[] {
  const item = (
    criterion: QualityCriterionResult["criterion"],
    pass: boolean,
    maxPoints: number,
    evidence: string,
    coachingNote: string,
  ): QualityCriterionResult => ({
    criterion,
    result: pass ? "pass" : "fail",
    points: pass ? maxPoints : 0,
    maxPoints,
    evidence,
    coachingNote: pass ? null : coachingNote,
  });

  const items: QualityCriterionResult[] = [
    item(
      "first_contact_sla",
      input.firstContactMinutes !== null && input.firstContactMinutes <= input.slaMinutes,
      30,
      input.firstContactMinutes === null
        ? "No qualifying intake-rep acknowledgment found."
        : `First qualifying acknowledgment at ${input.firstContactMinutes.toFixed(1)} minutes.`,
      `Acknowledge outreach within ${input.slaMinutes} minutes of the FNOL post.`,
    ),
    item(
      "facts_of_loss",
      Boolean(input.factsOfLoss),
      10,
      input.factsOfLoss ?? "Facts of Loss not documented.",
      "Document concise facts of loss in the Slack thread.",
    ),
    // FOL quality — only scored if FOL is present
    input.factsOfLoss
      ? {
          criterion: "fol_quality",
          result: (input.folQualityScore ?? 0) >= 6 ? "pass" : "fail",
          points: (input.folQualityScore ?? 0) >= 6 ? 10 : (input.folQualityScore ?? 0),
          maxPoints: 10,
          evidence: input.folQualityScore !== null
            ? `FOL quality score: ${input.folQualityScore}/10`
            : "FOL quality not assessed.",
          coachingNote: (input.folQualityScore ?? 0) < 6
            ? "Include who, what, where, and damage/injury details in the Facts of Loss."
            : null,
        }
      : {
          criterion: "fol_quality",
          result: "not_applicable",
          points: 0,
          maxPoints: 10,
          evidence: "Facts of Loss not documented — quality cannot be assessed.",
          coachingNote: null,
        },
    item(
      "preliminary_liability",
      Boolean(input.preliminaryLiability),
      15,
      input.preliminaryLiability ?? "Preliminary liability not documented.",
      "Record the preliminary liability assessment.",
    ),
    item(
      "rideshare_status",
      Boolean(input.rideshareStatus && !/^(?:unknown|n\/?a)$/i.test(input.rideshareStatus)),
      10,
      input.rideshareStatus ?? "Rideshare status not documented.",
      "Confirm and record the member's rideshare status at the time of loss.",
    ),
    item(
      "photo_evidence",
      input.hasPhotos,
      10,
      input.hasPhotos ? "Photo or video evidence is attached." : "No photo or video evidence attached.",
      "Attach or link available photo evidence in the FNOL thread.",
    ),
    item(
      "attempt_documentation",
      input.contactAttempts > 0 || input.firstContactMinutes !== null,
      5,
      input.contactAttempts > 0
        ? `${input.contactAttempts} contact attempt(s) documented.`
        : input.firstContactMinutes !== null
          ? "Outreach acknowledgment documented."
          : "No outreach attempt documented.",
      "Document each contact attempt, including no-answer outcomes.",
    ),
    item(
      "store_team_tagged",
      input.storeTeamTagged,
      10,
      input.storeTeamTagged
        ? "Store team (@atlteam, @chiteam, etc.) was tagged in the thread."
        : "Store team was not tagged in the thread.",
      "Tag the relevant store team (e.g. @atlteam) in the FNOL thread.",
    ),
  ];

  if (input.vehicleType === "ev_tesla") {
    items.push(
      item(
        "tesla_footage_request",
        input.teslaFootageRequested === true,
        10,
        input.teslaFootageRequested
          ? "The intake rep requested Tesla/dashcam footage."
          : "No intake-rep footage request detected.",
        "Request Tesla or dashcam footage and document the request in the thread.",
      ),
    );
  } else {
    items.push({
      criterion: "tesla_footage_request",
      result: "not_applicable",
      points: 10,
      maxPoints: 10,
      evidence: "Not applicable to a non-Tesla loss.",
      coachingNote: null,
    });
  }

  return items;
}

/**
 * Business hours: 9 AM–6 PM Eastern Time, Mon–Fri.
 * Returns the Date at which the next business window opens after `from`.
 * If `from` is already within business hours, returns `from` unchanged.
 */
function nextBusinessOpen(from: Date): Date {
  // Work in US/Eastern offset: ET is UTC-5 (EST) or UTC-4 (EDT)
  // We use a simple heuristic: compute local ET offset via Intl
  const etOffset = getEtOffsetMinutes(from);
  const etMs = from.getTime() + etOffset * 60_000;
  const etDate = new Date(etMs);

  const dayOfWeek = etDate.getUTCDay(); // 0=Sun, 6=Sat
  const hour = etDate.getUTCHours();
  const minute = etDate.getUTCMinutes();

  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWithinHours = hour >= 9 && (hour < 18 || (hour === 18 && minute === 0));

  if (isWeekday && isWithinHours) return from; // already in business hours

  // Advance to next 9 AM ET on a weekday
  let candidate = new Date(etMs);
  // Set to 9:00 AM ET
  candidate.setUTCHours(9, 0, 0, 0);
  // If we're past 9 AM today (or it's a weekend), advance to next weekday
  if (hour >= 9 || !isWeekday) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60_000);
  }
  // Skip weekends
  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60_000);
  }
  // Convert back to UTC
  return new Date(candidate.getTime() - etOffset * 60_000);
}

function getEtOffsetMinutes(date: Date): number {
  // US Eastern: UTC-5 (EST) Nov–Mar, UTC-4 (EDT) Mar–Nov
  // DST starts 2nd Sunday in March, ends 1st Sunday in November
  const year = date.getUTCFullYear();
  // 2nd Sunday in March
  const dstStart = nthSundayOfMonth(year, 2, 2);
  // 1st Sunday in November
  const dstEnd = nthSundayOfMonth(year, 10, 1);
  const isDst = date >= dstStart && date < dstEnd;
  return isDst ? -4 * 60 : -5 * 60;
}

function nthSundayOfMonth(year: number, month: number, n: number): Date {
  // month: 0-indexed (2=March, 10=November)
  const d = new Date(Date.UTC(year, month, 1));
  let sundays = 0;
  while (sundays < n) {
    if (d.getUTCDay() === 0) sundays += 1;
    if (sundays < n) d.setUTCDate(d.getUTCDate() + 1);
  }
  // 2 AM local = 7 AM UTC (EST) or 6 AM UTC (EDT) — use 7 AM UTC as safe approximation
  d.setUTCHours(7, 0, 0, 0);
  return d;
}

/**
 * Determine SLA type and deadline for a given FNOL workflow.
 * - With photos (driver in office): always 10 minutes from posting
 * - After hours (no photos, posted outside 9 AM–6 PM ET): 4 business hours from next open
 * - Standard (in hours, no photos): 10 minutes from posting
 */
export function computeSlaDeadline(postedAt: Date, hasPhotos: boolean, standardSlaMinutes = 10): {
  slaType: LossSlaType;
  slaDeadlineAt: Date;
  effectiveSlaMinutes: number;
} {
  if (hasPhotos) {
    return {
      slaType: "immediate",
      slaDeadlineAt: new Date(postedAt.getTime() + standardSlaMinutes * 60_000),
      effectiveSlaMinutes: standardSlaMinutes,
    };
  }

  const businessOpen = nextBusinessOpen(postedAt);
  const isAfterHours = businessOpen.getTime() > postedAt.getTime();

  if (isAfterHours) {
    // 4 business hours from next open
    const deadline = new Date(businessOpen.getTime() + 4 * 60 * 60_000);
    const totalMinutesFromPosted = (deadline.getTime() - postedAt.getTime()) / 60_000;
    return {
      slaType: "after_hours",
      slaDeadlineAt: deadline,
      effectiveSlaMinutes: totalMinutesFromPosted,
    };
  }

  return {
    slaType: "immediate",
    slaDeadlineAt: new Date(postedAt.getTime() + standardSlaMinutes * 60_000),
    effectiveSlaMinutes: standardSlaMinutes,
  };
}

export function analyzeFnolThread(input: {
  parent: ParsedLossParent;
  replies: SlackLossMessage[];
  assignments: IntakeAgentAssignment[];
  now?: Date;
  slaMinutes?: number;
  atRiskMinutes?: number;
}): ThreadAnalysis {
  const now = input.now ?? new Date();
  const standardSlaMinutes = input.slaMinutes ?? 10;
  const atRiskMinutes = input.atRiskMinutes ?? 7;

  // Compute tiered SLA
  const { slaType, slaDeadlineAt, effectiveSlaMinutes } = computeSlaDeadline(
    input.parent.postedAt,
    input.parent.hasPhotos,
    standardSlaMinutes,
  );
  const slaMinutes = effectiveSlaMinutes;
  const replies = [...input.replies].sort(
    (left, right) => eventDate(left).getTime() - eventDate(right).getTime(),
  );

  const firstAck = replies.find(
    reply => configuredAgent(reply, input.assignments) && isAcknowledgment(reply.text),
  );
  const assigned = firstAck
    ? configuredAgent(firstAck, input.assignments)
    : replies.map(reply => configuredAgent(reply, input.assignments)).find(Boolean) ?? null;

  // Template post = handler posts the FOL/rideshare/prelim liability template
  const templatePost = replies.find(
    reply => configuredAgent(reply, input.assignments) && isHandlerTemplate(reply.text),
  );

  // Contact attempts = all agent messages that indicate an attempt (ack + no-answer + follow-ups)
  const attemptReplies = replies.filter(
    reply => configuredAgent(reply, input.assignments) && isContactAttempt(reply.text),
  );
  const allAgentReplies = replies.filter(
    reply => configuredAgent(reply, input.assignments),
  );

  const firstContactAt = firstAck ? eventDate(firstAck) : null;
  const firstContactMinutes = firstContactAt
    ? minutesBetween(input.parent.postedAt, firstContactAt)
    : null;

  const templatePostedAt = templatePost ? eventDate(templatePost) : null;
  const templatePostMinutesFromContact = templatePostedAt && firstContactAt
    ? minutesBetween(firstContactAt, templatePostedAt)
    : null;
  const templatePostMinutesFromReport = templatePostedAt
    ? minutesBetween(input.parent.postedAt, templatePostedAt)
    : null;

  // completedAt = when template was posted (primary signal) OR legacy "g2g" signal
  const legacyCompletion = replies.find(
    reply => configuredAgent(reply, input.assignments) && /\b(?:good to go|g2g)\b/i.test(reply.text),
  );
  const completedAt = templatePostedAt ?? (legacyCompletion ? eventDate(legacyCompletion) : null);
  const intakeCycleMinutes = completedAt
    ? minutesBetween(input.parent.postedAt, completedAt)
    : null;

  // SLA state: compare firstContact (or elapsed) against the computed deadline
  const deadlineMinutes = (slaDeadlineAt.getTime() - input.parent.postedAt.getTime()) / 60_000;
  const atRiskThreshold = slaType === "after_hours"
    ? deadlineMinutes - 30 // 30 min warning before 4-hour deadline
    : atRiskMinutes;
  const elapsedMinutes = minutesBetween(input.parent.postedAt, now);
  const slaClock = firstContactMinutes ?? elapsedMinutes;
  const slaState: LossSlaState =
    slaClock > deadlineMinutes
      ? "breached"
      : slaClock >= atRiskThreshold
        ? "at_risk"
        : "within_sla";

  // Extract template fields — prefer template post, fall back to any reply
  const allMessages = [...replies];
  const factsOfLoss = latestReplyField(allMessages, /Facts of Loss\s*[:\-–]\s*([^\n]+(?:\n(?![A-Z][a-z].*:)[^\n]+)*)/i)
    ?? latestReplyField(allMessages, /FOL\s*[:\-–]\s*([^\n]+)/i);
  const preliminaryLiability = latestReplyField(allMessages, /Preliminary Liability\s*[:\-–]\s*([^\n]+)/i)
    ?? latestReplyField(allMessages, /Prelim(?:inary)?\s*Liability\s*[:\-–]\s*([^\n]+)/i);
  const rideshareStatus =
    latestReplyField(allMessages, /(?:TNC|Rideshare)\s*(?:Status)?\s*[:\-–]\s*([^\n]+)/i) ??
    input.parent.rideshareStatus;

  const noAnswerAttempts = attemptReplies.filter(reply =>
    /\b(no answer|did(?: not|n't) answer|unanswered|left (?:a )?(?:voicemail|message))\b/i.test(reply.text),
  ).length;

  // Total contact attempts = ack + no-answer + follow-up messages from agents
  const contactAttempts = allAgentReplies.filter(reply =>
    isAcknowledgment(reply.text) || isContactAttempt(reply.text)
  ).length;

  const storeTeamTagged = detectStoreTeamTag([...replies]);

  const teslaFootageRequested =
    input.parent.vehicleType === "ev_tesla"
      ? replies.some(
          reply =>
            configuredAgent(reply, input.assignments) &&
            isTeslaFootageRequest(reply.text),
        )
      : null;

  const hasThreadPhotos = replies.some(reply => (reply.files?.length ?? 0) > 0);
  const folQualityScore = factsOfLoss ? assessFolQuality(factsOfLoss) : null;

  const qualityItems = buildQualityItems({
    vehicleType: input.parent.vehicleType,
    firstContactMinutes,
    slaMinutes,
    factsOfLoss,
    folQualityScore,
    preliminaryLiability,
    rideshareStatus,
    hasPhotos: input.parent.hasPhotos || hasThreadPhotos,
    noAnswerAttempts,
    contactAttempts,
    storeTeamTagged,
    teslaFootageRequested,
  });

  // Max possible points: 30+10+10+15+10+10+5+10+10 = 110 for Tesla, 100 for non-Tesla
  // We normalise to 100 by treating tesla_footage_request as always contributing its points
  const totalPoints = qualityItems.reduce((sum, q) => sum + q.points, 0);
  const maxPoints = qualityItems.reduce((sum, q) => sum + q.maxPoints, 0);
  const qualityScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  const missingElements = qualityItems
    .filter(criterion => criterion.result === "fail")
    .map(criterion => criterion.criterion);

  const stage: LossStage = completedAt
    ? "complete"
    : attemptReplies.length > 0
      ? "contact_attempts"
      : firstContactAt
        ? "outreach_started"
        : "awaiting_outreach";

  const events: ParsedLossEvent[] = [
    {
      slackEventKey: input.parent.slackEventId ?? `${input.parent.slackKey}:posted`,
      slackEventTs: input.parent.slackMessageTs,
      occurredAt: input.parent.postedAt,
      actorSlackUserId: null,
      actorName: null,
      eventType: "posted",
      body: "FNOL parent post detected.",
      metadata: {},
    },
    ...replies.map(reply => {
      const agent = configuredAgent(reply, input.assignments);
      const eventType: LossEventType =
        agent && isHandlerTemplate(reply.text)
          ? "completion"
          : agent && isContactAttempt(reply.text)
            ? "contact_attempt"
            : agent && isAcknowledgment(reply.text)
              ? "acknowledgment"
              : "other";
      return {
        slackEventKey: reply.eventId ?? `${input.parent.channelId}:${reply.ts}`,
        slackEventTs: reply.ts,
        occurredAt: eventDate(reply),
        actorSlackUserId: reply.userId ?? null,
        actorName: reply.userName ?? null,
        eventType,
        body: reply.text,
        metadata: { fileCount: reply.files?.length ?? 0 },
      };
    }),
  ];

  return {
    assignedHandlerId: assigned?.handlerId ?? null,
    assignedAgent: assigned?.handlerName ?? null,
    stage,
    firstContactAt,
    firstContactMinutes,
    slaState,
    slaType,
    slaDeadlineAt,
    completedAt,
    intakeCycleMinutes,
    factsOfLoss,
    folQualityScore,
    preliminaryLiability,
    rideshareStatus,
    noAnswerAttempts,
    contactAttempts,
    storeTeamTagged,
    templatePostedAt,
    templatePostMinutesFromContact,
    templatePostMinutesFromReport,
    teslaFootageRequested,
    qualityScore,
    missingElements,
    events,
    qualityItems,
  };
}
