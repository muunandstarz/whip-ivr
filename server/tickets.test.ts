import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ticketDigestTestUtils } from './tickets';

const root = resolve(__dirname, '..');
const source = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('internal ticket workflow', () => {
  it('uses durable owner and triage fields rather than browser-provided identity', () => {
    const schema = source('drizzle/schema.ts');
    const router = source('server/routers/tickets.ts');
    const service = source('server/tickets.ts');
    expect(schema).toContain('export const internalTickets');
    expect(schema).toContain('reporterUserId: int("reporter_user_id").notNull()');
    expect(schema).toContain('export const ticketDigestAutomation');
    expect(router).toContain('submit: protectedProcedure');
    expect(router).toContain('list: adminProcedure');
    expect(router).toContain('triage: adminProcedure');
    expect(service).toContain('input.viewer.userId');
    expect(service).toContain('ticket.reporter_user_id !== viewer.userId');
  });

  it('keeps the weekday end-of-day digest East-coast aware and idempotent', () => {
    const service = source('server/tickets.ts');
    const scheduled = source('server/scheduled/ticketDigest.ts');
    expect(service).toContain("timeZone: 'America/New_York'");
    expect(service).toContain("local.hour !== 17 || local.minute !== 30");
    expect(service).toContain("automation.last_digest_for_date === dateKey");
    expect(scheduled).toContain("if (!user.isCron || !user.taskUid)");
    expect(scheduled).toContain('expectedTaskUid: user.taskUid');
  });

  it('creates stable Eastern calendar keys through daylight-saving dates', () => {
    // 22:30 UTC is 5:30 PM EDT in September; 22:30 UTC is 5:30 PM EST after fallback.
    expect(ticketDigestTestUtils.easternDateKey(new Date('2026-09-22T22:30:00Z'))).toBe('2026-09-22');
    expect(ticketDigestTestUtils.easternDateKey(new Date('2026-11-02T22:30:00Z'))).toBe('2026-11-02');
    expect(ticketDigestTestUtils.nextEasternDateKey('2026-12-31')).toBe('2027-01-01');
  });

  it('exposes the ticket page from both dashboard roles without re-enabling paused mail features', () => {
    const layout = source('client/src/components/WhipLayout.tsx');
    const dashboard = source('client/src/pages/Dashboard.tsx');
    const app = source('client/src/App.tsx');
    expect(layout).toContain('{ href: "/tickets", label: "Tickets"');
    expect(layout).toContain('{ href: "/tickets", label: "My Tickets"');
    expect(dashboard).toContain('href="/tickets?new=1"');
    expect(app).toContain('<Route path="/tickets" component={Tickets} />');
    expect(layout).toContain('mailroomEnabled');
    expect(layout).toContain('mailBotEnabled');
  });
});
