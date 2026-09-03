const EASTERN = 'America/New_York';
const BUSINESS_START_HOUR = 13;
const BUSINESS_END_HOUR = 18;

interface EasternParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number; }

function easternParts(date: Date): EasternParts {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(values.find((part) => part.type === type)?.value ?? 0);
  const weekdayName = values.find((part) => part.type === 'weekday')?.value;
  return {
    year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second'),
    weekday: ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekdayName ?? 'Sun'],
  };
}

function eastToUtc(parts: Omit<EasternParts, 'weekday'>): Date {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = desired;
  for (let attempt = 0; attempt < 2; attempt++) {
    const actual = easternParts(new Date(guess));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += desired - actualAsUtc;
  }
  return new Date(guess);
}

function isBusinessWeekday(weekday: number): boolean {
  return weekday >= 2 && weekday <= 5;
}

function advanceCalendarDay(parts: EasternParts): EasternParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + 86400000);
  const shifted = easternParts(eastToUtc({
    year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: BUSINESS_START_HOUR, minute: 0, second: 0,
  }));
  return { ...shifted, hour: BUSINESS_START_HOUR, minute: 0, second: 0 };
}

function nextBusinessStart(parts: EasternParts): EasternParts {
  let next = { ...parts, hour: BUSINESS_START_HOUR, minute: 0, second: 0 };
  do {
    next = advanceCalendarDay(next);
  } while (!isBusinessWeekday(next.weekday));
  return next;
}

function normalizeToBusinessWindow(date: Date): EasternParts {
  let parts = easternParts(date);
  if (!isBusinessWeekday(parts.weekday)) {
    while (!isBusinessWeekday(parts.weekday)) parts = advanceCalendarDay(parts);
    return { ...parts, hour: BUSINESS_START_HOUR, minute: 0, second: 0 };
  }
  if (parts.hour < BUSINESS_START_HOUR) return { ...parts, hour: BUSINESS_START_HOUR, minute: 0, second: 0 };
  if (parts.hour >= BUSINESS_END_HOUR) return nextBusinessStart(parts);
  return parts;
}

/**
 * Routine Mailroom assignments are released only in the 1 PM Eastern batch on
 * Tuesday through Friday. Source collection and priority routing continue at
 * all times.
 */
export function isMailRoutineAssignmentWindow(date: Date = new Date()): boolean {
  const parts = easternParts(date);
  return isBusinessWeekday(parts.weekday) && parts.hour === BUSINESS_START_HOUR;
}

/** Return the UTC boundaries for the supplied calendar day in Eastern time. */
export function mailEasternDayBounds(date: Date = new Date()): { start: Date; end: Date } {
  const parts = easternParts(date);
  const start = eastToUtc({
    year: parts.year, month: parts.month, day: parts.day,
    hour: 0, minute: 0, second: 0,
  });
  const nextCalendarDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const end = eastToUtc({
    year: nextCalendarDay.getUTCFullYear(), month: nextCalendarDay.getUTCMonth() + 1, day: nextCalendarDay.getUTCDate(),
    hour: 0, minute: 0, second: 0,
  });
  return { start, end };
}

/** Tue–Fri, 1pm–6pm Eastern only. */
export function addMailBusinessHours(assignedAt: Date, hours: number): Date {
  let parts = normalizeToBusinessWindow(assignedAt);
  let remainingMinutes = Math.max(0, Math.round(hours * 60));
  while (remainingMinutes > 0) {
    const available = (BUSINESS_END_HOUR - parts.hour) * 60 - parts.minute;
    if (remainingMinutes <= available) {
      parts.minute += remainingMinutes;
      parts.hour += Math.floor(parts.minute / 60);
      parts.minute %= 60;
      remainingMinutes = 0;
    } else {
      remainingMinutes -= available;
      parts = nextBusinessStart(parts);
    }
  }
  return eastToUtc(parts);
}

/** One business day means the same mail-business-window time on the next Tue–Fri day. */
export function addMailBusinessDays(assignedAt: Date, days: number): Date {
  let parts = normalizeToBusinessWindow(assignedAt);
  for (let i = 0; i < days; i++) parts = nextBusinessStart(parts);
  return eastToUtc(parts);
}

export function isLetterOfRepresentation(requestedAction?: string | null, reason?: string | null): boolean {
  return /\bletter\s+of\s+representation\b|\bLOR\b/i.test(`${requestedAction ?? ''} ${reason ?? ''}`);
}
