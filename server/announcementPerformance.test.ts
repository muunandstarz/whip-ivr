import { describe, expect, it } from 'vitest';
import { DAILY_MESSAGES, dailyMessage, featureAnnouncementWindow, getTeamDateKey, summarizeBirthdays } from './announcementsAutomation.js';
import { PERFORMANCE_TEAMS, getCallPerformanceDashboard, normalizePerformanceAgent, percentage, teamForAgent } from './callPerformance.js';

describe('announcement automation helpers', () => {
  it('uses a deterministic daily message and an Eastern calendar key', () => {
    const now = new Date('2026-09-17T15:00:00.000Z');
    expect(getTeamDateKey(now)).toBe('2026-09-17');
    expect(DAILY_MESSAGES).toContain(dailyMessage(now));
    expect(dailyMessage(now)).toBe(dailyMessage(now));
  });

  it('applies the required 48-hour new-feature window', () => {
    const start = new Date('2026-09-17T15:00:00.000Z');
    const window = featureAnnouncementWindow(start);
    expect(window.startsAt).toEqual(start);
    expect(window.endsAt.getTime() - window.startsAt.getTime()).toBe(48 * 60 * 60 * 1000);
  });

  it('shows today and upcoming opted-in birthdays but not a distant or opted-out preference', () => {
    const now = new Date('2026-09-17T15:00:00.000Z');
    const result = summarizeBirthdays([
      { name: 'Today Teammate', birthMonth: 9, birthDay: 17, isOptedIn: true },
      { name: 'Soon Teammate', birthMonth: 9, birthDay: 20, isOptedIn: true },
      { name: 'Distant Teammate', birthMonth: 10, birthDay: 10, isOptedIn: true },
      { name: 'Private Teammate', birthMonth: 9, birthDay: 18, isOptedIn: false },
    ], now);
    expect(result.todayBirthdays).toEqual(['Today Teammate']);
    expect(result.upcomingBirthdays).toEqual([{ name: 'Soon Teammate', daysAway: 3, dateLabel: 'Sep 20' }]);
  });
});

describe('call performance team definitions', () => {
  it('includes each requested operating team and handler', () => {
    expect(PERFORMANCE_TEAMS.map((team) => team.name)).toEqual(['Processors', 'Subrogation', 'Intake', 'First Party', 'Liability']);
    expect(PERFORMANCE_TEAMS.flatMap((team) => team.members)).toEqual([
      'Daryl Ochate', 'MJ Badua',
      'Tim Chan', 'Daniel Giono',
      'Ana Padilla', 'Bennet Carlos', 'Carlito Legarde',
      'Jovel Villa', 'Annie Ortiz', 'Natashia Edulan', 'Lorraine Tria',
      'Giovanni Cabrera', 'Jayla Bernard',
    ]);
    expect(teamForAgent('MJ Badua')).toBe('Processors');
    expect(teamForAgent('Ana Padilla')).toBe('Intake');
    expect(teamForAgent('Lorraine Tria')).toBe('First Party');
    expect(teamForAgent('Giovanni Cabrera')).toBe('Liability');
  });

  it('normalizes the current Aircall naming variants without changing attribution', () => {
    expect(normalizePerformanceAgent('Mary Joy Badua')).toBe('MJ Badua');
    expect(normalizePerformanceAgent('Carlito Legarde Jr')).toBe('Carlito Legarde');
    expect(normalizePerformanceAgent('Geovanni Cabrera')).toBe('Giovanni Cabrera');
    expect(percentage(8, 10)).toBe(80);
  });

  it('aggregates the live call history into the requested operational teams', async () => {
    const dashboard = await getCallPerformanceDashboard('90d');
    expect(dashboard.periodLabel).toBe('Last 90 days');
    expect(dashboard.teams.map((team) => team.name)).toEqual(['Processors', 'Subrogation', 'Intake', 'First Party', 'Liability']);
    expect(dashboard.agents.some((agent) => agent.agent === 'Daryl Ochate' && agent.team === 'Processors')).toBe(true);
    expect(dashboard.monthlyTrend.length).toBeGreaterThan(0);
    expect(dashboard.unassigned.total).toBeGreaterThanOrEqual(0);
  });

  it('supports a selected calendar month and compares it to the previous month', async () => {
    const dashboard = await getCallPerformanceDashboard('month', '2026-08', new Date('2026-09-18T12:00:00.000Z'));
    expect(dashboard.periodLabel).toBe('August 2026');
    expect(dashboard.previousPeriodLabel).toBe('July 2026');
    expect(dashboard.selectedMonth).toBe('2026-08');
  });
});
