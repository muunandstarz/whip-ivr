export type DispatchSourceChannel = "claims" | "remote-markets" | "escalations" | "claims-processing";
export type DispatchFilingState = "filed" | "unfiled" | "pending_statement" | "unverified";

export interface DispatchTiming {
  targetBusinessMinutes: number;
  firstResponseBusinessMinutes: number | null;
  elapsedBusinessMinutes: number;
  slaDeadlineAt: Date;
  slaState: "within_sla" | "at_risk" | "breached";
  slaType: "in_store" | "remote";
}

const ET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function etParts(date: Date) {
  const values = Object.fromEntries(
    ET_FORMATTER.formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
}

function etLocalToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const intendedLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const initialGuess = new Date(intendedLocalMs);
  const observed = etParts(initialGuess);
  const observedLocalMs = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, 0, 0);
  return new Date(intendedLocalMs - (observedLocalMs - intendedLocalMs));
}

function localDateKey(date: Date) {
  const parts = etParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addLocalDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

function keyParts(key: string): [number, number, number] {
  const [year, month, day] = key.split("-").map(Number);
  return [year, month, day];
}

function businessWindowForDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return null;
  return {
    start: etLocalToUtc(year, month, day, 9, 0),
    end: etLocalToUtc(year, month, day, 18, 0),
  };
}

/** Counts only Monday–Friday 9:00 AM–6:00 PM Eastern minutes. */
export function businessMinutesBetween(start: Date, end: Date) {
  if (end.getTime() <= start.getTime()) return 0;
  let key = localDateKey(start);
  const endKey = localDateKey(end);
  let minutes = 0;
  for (let guard = 0; guard < 370 && key <= endKey; guard += 1) {
    const window = businessWindowForDate(key);
    if (window) {
      const overlapStart = Math.max(start.getTime(), window.start.getTime());
      const overlapEnd = Math.min(end.getTime(), window.end.getTime());
      if (overlapEnd > overlapStart) minutes += (overlapEnd - overlapStart) / 60_000;
    }
    key = addLocalDays(key, 1);
  }
  return minutes;
}

/** Adds business minutes while skipping nights and weekends in Eastern time. */
export function addBusinessMinutes(start: Date, minutesToAdd: number) {
  let remaining = Math.max(0, minutesToAdd);
  let cursor = new Date(start);
  for (let guard = 0; guard < 3700; guard += 1) {
    const key = localDateKey(cursor);
    const window = businessWindowForDate(key);
    if (!window || cursor.getTime() >= window.end.getTime()) {
      const [year, month, day] = keyParts(addLocalDays(key, 1));
      cursor = etLocalToUtc(year, month, day, 0, 0);
      continue;
    }
    if (cursor.getTime() < window.start.getTime()) cursor = new Date(window.start);
    const available = (window.end.getTime() - cursor.getTime()) / 60_000;
    if (remaining <= available) return new Date(cursor.getTime() + remaining * 60_000);
    remaining -= available;
    cursor = new Date(window.end.getTime() + 60_000);
  }
  throw new Error("Unable to calculate business-minute deadline");
}

export function dispatchTargetBusinessMinutes(channel: DispatchSourceChannel, market: string | null | undefined, onSite = false) {
  // Arrival is a Slack source-thread fact, not an inspection-sheet field or a
  // market inference. Every confirmed in-office arrival has a 10-minute
  // attempt target; all other claims run on the remote business-hours target.
  void channel;
  void market;
  return onSite ? 10 : 240;
}

export function evaluateDispatchTiming(input: {
  postedAt: Date;
  firstResponseAt: Date | null;
  now: Date;
  channel: DispatchSourceChannel;
  market?: string | null;
  onSite?: boolean;
}): DispatchTiming {
  const targetBusinessMinutes = dispatchTargetBusinessMinutes(input.channel, input.market, input.onSite);
  const firstResponseBusinessMinutes = input.firstResponseAt
    ? businessMinutesBetween(input.postedAt, input.firstResponseAt)
    : null;
  const elapsedBusinessMinutes = businessMinutesBetween(input.postedAt, input.now);
  const clock = firstResponseBusinessMinutes ?? elapsedBusinessMinutes;
  const slaState = firstResponseBusinessMinutes !== null && firstResponseBusinessMinutes <= targetBusinessMinutes
    ? "within_sla"
    : clock >= targetBusinessMinutes
      ? "breached"
      : clock >= targetBusinessMinutes * (2 / 3)
        ? "at_risk"
        : "within_sla";
  return {
    targetBusinessMinutes,
    firstResponseBusinessMinutes,
    elapsedBusinessMinutes,
    slaDeadlineAt: addBusinessMinutes(input.postedAt, targetBusinessMinutes),
    slaState,
    slaType: targetBusinessMinutes === 10 ? "in_store" : "remote",
  };
}

export function extractClaimId(text: string) {
  const url = text.match(/snapsheet(?:vice)?\.com\/claims\/([A-Za-z0-9-]+)/i);
  if (url?.[1]) return url[1];
  const formatted = text.match(/\b([A-Za-z]{2,4}-\d{2,}-\d{4,}-\d{4,})\b/);
  if (formatted?.[1]) return formatted[1];
  const labeled = text.match(/\bClaim\s*(?:ID|#)\s*[:\-–]\s*(\d{6,}|[A-Za-z0-9-]{8,})/i);
  if (labeled?.[1]) return labeled[1];
  // A bare six-or-more-digit number is filing evidence only when the thread
  // explicitly calls it a Snapsheet file; ordinary member IDs stay excluded.
  return /\b(?:snapsheet|claim file)\b[^\n]{0,80}\b(\d{6,})\b/i.exec(text)?.[1] ?? null;
}

export function deriveFilingState(input: { templatePosted: boolean; claimId: string | null }): DispatchFilingState {
  if (input.claimId) return "filed";
  if (input.templatePosted) return "unfiled";
  return "pending_statement";
}

export function detectOnSiteSignal(messages: Array<{ text: string; files?: Array<unknown> | undefined; occurredAt: Date; isStoreOpsPoster?: boolean }>) {
  const phrase = /driver has arrived|member is onsite|member is on.?site|member is at (?:the )?(?:store|office)|checked in at (?:the )?(?:store|office)|arrived at (?:the )?(?:store|office)/i;
  // A file attachment anywhere in a thread is not an arrival signal. Only a
  // counter/store-ops poster can establish that the member is physically in.
  const photo = messages.find(message => message.isStoreOpsPoster && (message.files?.length ?? 0) > 0);
  if (photo) return { onSite: true, detectedAt: photo.occurredAt, reason: "Store operations posted vehicle photos from the branch (this driver appears to be in office)." };
  const textMatch = messages.find(message => message.isStoreOpsPoster && phrase.test(message.text));
  return textMatch
    ? { onSite: true, detectedAt: textMatch.occurredAt, reason: "Store operations documented an in-office arrival (this driver appears to be in office)." }
    : { onSite: false, detectedAt: null, reason: null };
}

export function duplicateGroupKey(input: { customerId?: string | null; vinLastSix?: string | null; memberName?: string | null }) {
  const normalizedVin = input.vinLastSix?.replace(/\D/g, "").slice(-6) ?? "";
  const normalizedCustomer = input.customerId?.replace(/\D/g, "") ?? "";
  const normalizedName = input.memberName?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (normalizedCustomer && normalizedVin) return `customer:${normalizedCustomer}:vin:${normalizedVin}`;
  if (normalizedVin) return `vin:${normalizedVin}`;
  if (normalizedName) return `name:${normalizedName}`;
  return null;
}
