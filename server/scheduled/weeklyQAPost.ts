import type { Request, Response } from 'express';

/**
 * Retained only so a previously registered legacy heartbeat cannot generate or
 * publish scorecards. Claims QA requires an explicit leader-reviewed release.
 */
export async function weeklyQAPostHandler(_req: Request, res: Response) {
  return res.status(410).json({
    ok: false,
    disabled: true,
    message: 'Legacy Weekly QA auto-publication is disabled. Use Claims QA to create, review, and manually release an evaluation.',
  });
}
