/**
 * POST /api/slack/mail-events
 *
 * Handles Slack Events API callbacks for the #claims-mail channel.
 * - Verifies the signing secret
 * - Answers url_verification challenges immediately
 * - Acks within 3s (fire-and-forget background processing)
 * - On file_shared / message events with files: delegates to handleSlackFileEvent
 */

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDb } from '../db.js';
import { mailSettings } from '../../drizzle/schema.js';
import { handleSlackFileEvent, buildRealSlackFetch } from './ingestSlack.js';
import mysql from 'mysql2/promise';

export const MAIL_SLACK_EVENTS_PATH = '/api/slack/mail-events';

const SLACK_SIGNATURE_VERSION = 'v0';
const REPLAY_WINDOW_SECONDS = 300;

function verifySignature(
  signingSecret: string,
  timestamp: string | undefined,
  signature: string | undefined,
  rawBody: Buffer,
): boolean {
  if (!signingSecret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > REPLAY_WINDOW_SECONDS) {
    return false;
  }
  const base = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody.toString('utf8')}`;
  const expected = `${SLACK_SIGNATURE_VERSION}=${createHmac('sha256', signingSecret)
    .update(base, 'utf8').digest('hex')}`;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function mailSlackEventsHandler(req: Request, res: Response): void {
  const rawBody: Buffer = req.body;
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? '';
  const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
  const signature = req.headers['x-slack-signature'] as string | undefined;

  if (!verifySignature(signingSecret, timestamp, signature, rawBody)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // url_verification challenge — must respond immediately
  if (body.type === 'url_verification') {
    res.json({ challenge: body.challenge });
    return;
  }

  // Ack immediately (within 3s requirement)
  res.status(200).send('');

  // Process in background (fire-and-forget)
  processMailEvent(body).catch(err => {
    console.error('[mailSlackEvents] background processing error:', err);
  });
}

async function processMailEvent(body: Record<string, unknown>): Promise<void> {
  const event = body.event as Record<string, unknown> | undefined;
  if (!event) return;

  const eventType = event.type as string;
  // Handle both file_shared and message events that contain files
  const isFileEvent = eventType === 'file_shared' ||
    (eventType === 'message' && Array.isArray(event.files) && (event.files as unknown[]).length > 0);
  if (!isFileEvent) return;

  const channelId = (event.channel_id ?? event.channel) as string | undefined;
  if (!channelId) return;

  // Load settings from DB
  const db = await getDb();
  if (!db) return;
  const settingsRows = await db.select().from(mailSettings);
  const settingsMap = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const reviewedEmoji = settingsMap['reviewed_emoji'] ?? 'white_check_mark';
  const botMarkerEmoji = settingsMap['bot_marker_emoji'] ?? 'robot_face';
  const addBotMarker = settingsMap['add_slack_reaction'] !== 'false';

  const token = process.env.SLACK_BOT_TOKEN ?? '';
  const slack = buildRealSlackFetch(token);

  // Get the DB connection for raw SQL
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    // Handle file_shared event
    if (eventType === 'file_shared') {
      const fileId = event.file_id as string;
      const messageTs = (event.event_ts ?? event.ts) as string;
      await handleSlackFileEvent(conn, {
        fileId,
        messageTs,
        channelId,
      }, slack, { reviewedEmoji, botMarkerEmoji, addBotMarker });
      return;
    }

    // Handle message event with files array
    const files = event.files as Array<Record<string, unknown>>;
    const messageTs = event.ts as string;
    for (const file of files) {
      await handleSlackFileEvent(conn, {
        fileId: file.id as string,
        messageTs,
        channelId,
        filename: file.name as string | undefined,
        mimeType: file.mimetype as string | undefined,
        urlPrivateDownload: file.url_private_download as string | undefined,
        permalink: file.permalink as string | undefined,
      }, slack, { reviewedEmoji, botMarkerEmoji, addBotMarker });
    }
  } finally {
    await conn.end();
  }
}
