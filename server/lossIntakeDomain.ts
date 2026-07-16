export type LossVehicleType = "gas" | "ev_tesla" | "unknown";
export type LossStage =
  | "awaiting_outreach"
  | "outreach_started"
  | "contact_attempts"
  | "complete";
export type LossSlaState = "within_sla" | "at_risk" | "breached";
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
    | "preliminary_liability"
    | "rideshare_status"
    | "photo_evidence"
    | "attempt_documentation"
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
  completedAt: Date | null;
  intakeCycleMinutes: number | null;
  factsOfLoss: string | null;
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  noAnswerAttempts: number;
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
  return /\b(no answer|did(?: not|n't) answer|unanswered|left (?:a )?(?:voicemail|message)|attempt(?:ed|ing)?|called (?:the )?(?:member|customer|driver|cx))\b/i.test(
    text,
  );
}

function isCompletion(text: string): boolean {
  return /\b(?:good to go|g2g)\b/i.test(text);
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
  preliminaryLiability: string | null;
  rideshareStatus: string | null;
  hasPhotos: boolean;
  noAnswerAttempts: number;
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
      20,
      input.factsOfLoss ?? "Facts of Loss not documented.",
      "Document concise facts of loss in the Slack thread.",
    ),
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
      input.firstContactMinutes !== null || input.noAnswerAttempts > 0,
      5,
      input.noAnswerAttempts > 0
        ? `${input.noAnswerAttempts} no-answer attempt(s) documented.`
        : input.firstContactMinutes !== null
          ? "Outreach acknowledgment documented."
          : "No outreach attempt documented.",
      "Document each contact attempt, including no-answer outcomes.",
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

export function analyzeFnolThread(input: {
  parent: ParsedLossParent;
  replies: SlackLossMessage[];
  assignments: IntakeAgentAssignment[];
  now?: Date;
  slaMinutes?: number;
  atRiskMinutes?: number;
}): ThreadAnalysis {
  const now = input.now ?? new Date();
  const slaMinutes = input.slaMinutes ?? 10;
  const atRiskMinutes = input.atRiskMinutes ?? 7;
  const replies = [...input.replies].sort(
    (left, right) => eventDate(left).getTime() - eventDate(right).getTime(),
  );

  const firstAck = replies.find(
    reply => configuredAgent(reply, input.assignments) && isAcknowledgment(reply.text),
  );
  const assigned = firstAck
    ? configuredAgent(firstAck, input.assignments)
    : replies.map(reply => configuredAgent(reply, input.assignments)).find(Boolean) ?? null;
  const completion = replies.find(
    reply => configuredAgent(reply, input.assignments) && isCompletion(reply.text),
  );
  const attemptReplies = replies.filter(
    reply => configuredAgent(reply, input.assignments) && isContactAttempt(reply.text),
  );
  const firstContactAt = firstAck ? eventDate(firstAck) : null;
  const firstContactMinutes = firstContactAt
    ? minutesBetween(input.parent.postedAt, firstContactAt)
    : null;
  const completedAt = completion ? eventDate(completion) : null;
  const intakeCycleMinutes = completedAt
    ? minutesBetween(input.parent.postedAt, completedAt)
    : null;
  const elapsedMinutes = minutesBetween(input.parent.postedAt, now);
  const slaClock = firstContactMinutes ?? elapsedMinutes;
  const slaState: LossSlaState =
    slaClock > slaMinutes
      ? "breached"
      : slaClock >= atRiskMinutes
        ? "at_risk"
        : "within_sla";

  const factsOfLoss = latestReplyField(
    replies,
    /Facts of Loss\s*:\s*([^\n]+)/i,
  );
  const preliminaryLiability = latestReplyField(
    replies,
    /Preliminary Liability\s*:\s*([^\n]+)/i,
  );
  const rideshareStatus =
    latestReplyField(replies, /(?:TNC|Rideshare) Status\s*:\s*([^\n]+)/i) ??
    input.parent.rideshareStatus;
  const noAnswerAttempts = attemptReplies.filter(reply =>
    /\b(no answer|did(?: not|n't) answer|unanswered|left (?:a )?(?:voicemail|message))\b/i.test(
      reply.text,
    ),
  ).length;
  const teslaFootageRequested =
    input.parent.vehicleType === "ev_tesla"
      ? replies.some(
          reply =>
            configuredAgent(reply, input.assignments) &&
            isTeslaFootageRequest(reply.text),
        )
      : null;

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
        agent && isCompletion(reply.text)
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

  const hasThreadPhotos = replies.some(reply => (reply.files?.length ?? 0) > 0);
  const qualityItems = buildQualityItems({
    vehicleType: input.parent.vehicleType,
    firstContactMinutes,
    slaMinutes,
    factsOfLoss,
    preliminaryLiability,
    rideshareStatus,
    hasPhotos: input.parent.hasPhotos || hasThreadPhotos,
    noAnswerAttempts,
    teslaFootageRequested,
  });
  const qualityScore = qualityItems.reduce((sum, criterion) => sum + criterion.points, 0);
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

  return {
    assignedHandlerId: assigned?.handlerId ?? null,
    assignedAgent: assigned?.handlerName ?? null,
    stage,
    firstContactAt,
    firstContactMinutes,
    slaState,
    completedAt,
    intakeCycleMinutes,
    factsOfLoss,
    preliminaryLiability,
    rideshareStatus,
    noAnswerAttempts,
    teslaFootageRequested,
    qualityScore,
    missingElements,
    events,
    qualityItems,
  };
}
