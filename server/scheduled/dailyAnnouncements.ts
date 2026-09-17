import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { dashboardAnnouncementAutomation } from '../../drizzle/schema.js';
import { getDb } from '../db.js';
import { sdk } from '../_core/sdk.js';
import { publishScheduledDailyAnnouncement } from '../announcementsAutomation.js';

/** Platform Heartbeat endpoint for the persisted daily dashboard message. */
export async function dailyAnnouncementsHandler(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      res.status(403).json({ error: 'cron-only' });
      return;
    }

    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const settings = await db.select().from(dashboardAnnouncementAutomation)
      .where(eq(dashboardAnnouncementAutomation.scheduleCronTaskUid, user.taskUid))
      .limit(1);
    const automation = settings[0];
    if (!automation || !automation.isEnabled) {
      res.json({ ok: true, skipped: 'disabled-or-orphaned', timestamp, taskUid: user.taskUid });
      return;
    }

    const published = await publishScheduledDailyAnnouncement();
    await db.update(dashboardAnnouncementAutomation)
      .set({ lastRunAt: new Date(), lastRunError: null })
      .where(eq(dashboardAnnouncementAutomation.id, automation.id));
    res.json({ ok: true, ...published, timestamp });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[DailyAnnouncements] Scheduled message failed:', error);
    res.status(500).json({ error: message, timestamp });
  }
}
