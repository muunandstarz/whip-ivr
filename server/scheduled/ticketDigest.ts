import type { Request, Response } from 'express';
import { sdk } from '../_core/sdk';
import { publishDailyTicketDigest } from '../tickets';

/**
 * Project-owner Heartbeat callback for the daily internal-ticket digest.
 * The service checks the persisted Heartbeat UID before it can notify anyone.
 */
export async function ticketDigestHandler(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      res.status(403).json({ error: 'cron-only' });
      return;
    }
    const result = await publishDailyTicketDigest({ expectedTaskUid: user.taskUid });
    res.json({ ...result, timestamp });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[TicketDigest] Scheduled ticket digest failed:', error);
    res.status(500).json({ error: message, timestamp });
  }
}
