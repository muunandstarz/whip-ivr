import { and, eq, lt } from 'drizzle-orm';
import { dashboardAnnouncements } from '../drizzle/schema.js';
import { getDb } from './db.js';

export const DAILY_MESSAGES = [
  'Start with the facts, document the decision, and keep the next step clear.',
  'Small, accurate follow-through is how a well-handled claim moves forward.',
  'Keep the file organized, the communication clear, and the momentum steady.',
  'Today’s advantage is a clear plan, a complete note, and one timely follow-up.',
  'Good claims handling is disciplined work made visible through strong documentation.',
  'Focus on the evidence, the timeline, and the action that keeps the claim moving.',
  'A thoughtful next step now prevents a difficult follow-up later.',
];

const TEAM_TIME_ZONE = 'America/New_York';

function dateParts(now: Date, timeZone = TEAM_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function getTeamDateKey(now: Date) {
  const { year, month, day } = dateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dailyMessage(now: Date) {
  const { year, month, day } = dateParts(now);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return DAILY_MESSAGES[Math.abs(dayNumber) % DAILY_MESSAGES.length];
}

export type BirthdayPreference = {
  name: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  isOptedIn: boolean | null;
};

export type UpcomingBirthday = {
  name: string;
  daysAway: number;
  dateLabel: string;
};

export function summarizeBirthdays(preferences: BirthdayPreference[], now: Date) {
  const today = dateParts(now);
  const todayBirthdays: string[] = [];
  const upcoming: UpcomingBirthday[] = [];
  const localToday = Date.UTC(today.year, today.month - 1, today.day);

  for (const preference of preferences) {
    if (!preference.isOptedIn || !preference.name || !preference.birthMonth || !preference.birthDay) continue;
    if (preference.birthMonth === today.month && preference.birthDay === today.day) {
      todayBirthdays.push(preference.name);
      continue;
    }

    let nextBirthday = Date.UTC(today.year, preference.birthMonth - 1, preference.birthDay);
    if (nextBirthday < localToday) nextBirthday = Date.UTC(today.year + 1, preference.birthMonth - 1, preference.birthDay);
    const daysAway = Math.round((nextBirthday - localToday) / 86_400_000);
    if (daysAway >= 1 && daysAway <= 7) {
      upcoming.push({
        name: preference.name,
        daysAway,
        dateLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(nextBirthday)),
      });
    }
  }

  return {
    todayBirthdays: todayBirthdays.sort((a, b) => a.localeCompare(b)),
    upcomingBirthdays: upcoming.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name)),
  };
}

/**
 * Creates at most one persisted morning message per Eastern calendar day.
 * The unique automated_for_date key and the pre-insert lookup make retries safe.
 */
export async function publishScheduledDailyAnnouncement(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');

  const dateKey = getTeamDateKey(now);
  await db.update(dashboardAnnouncements)
    .set({ isActive: false })
    .where(and(
      eq(dashboardAnnouncements.isAutomated, true),
      eq(dashboardAnnouncements.isActive, true),
      lt(dashboardAnnouncements.automatedForDate, dateKey),
    ));

  const existing = await db.select({ id: dashboardAnnouncements.id })
    .from(dashboardAnnouncements)
    .where(eq(dashboardAnnouncements.automatedForDate, dateKey))
    .limit(1);
  if (existing[0]) return { created: false, id: existing[0].id, dateKey };

  const result = await db.insert(dashboardAnnouncements).values({
    title: 'Good morning, team',
    message: dailyMessage(now),
    kind: 'message',
    isActive: true,
    startsAt: now,
    isAutomated: true,
    automatedForDate: dateKey,
  });
  return { created: true, id: Number(result[0].insertId), dateKey };
}

export function featureAnnouncementWindow(startsAt: Date) {
  return { startsAt, endsAt: new Date(startsAt.getTime() + 48 * 60 * 60 * 1000) };
}
