/**
 * Slice 3 acceptance test — ingestion adapters
 *
 * All Gmail and Slack HTTP calls are mocked with canned payloads.
 * No real API calls are made.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { Connection } from 'mysql2/promise';
import { ingestGmail } from './ingestGmail.js';
import type { GmailFetchFn } from './ingestGmail.js';
import { handleSlackFileEvent } from './ingestSlack.js';
import type { SlackFetchFn } from './ingestSlack.js';

// ─── Canned payloads ──────────────────────────────────────────────────────────

const GMAIL_MESSAGE_ID = 'test-gmail-msg-001';
const GMAIL_THREAD_ID  = 'test-thread-001';

const CANNED_GMAIL_MESSAGE = {
  id: GMAIL_MESSAGE_ID,
  threadId: GMAIL_THREAD_ID,
  internalDate: String(Date.now()),
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'Subject', value: 'Demand Letter — CLM-TEST-001' },
      { name: 'From', value: 'Attorney Smith <attorney@lawfirm.com>' },
      { name: 'To', value: 'claims@drivewhip.com' },
      { name: 'Date', value: 'Wed, 06 Aug 2026 12:00:00 +0000' },
    ],
    parts: [
      {
        mimeType: 'text/plain',
        body: {
          data: Buffer.from(
            'Dear Whip Claims, please find attached our demand for CLM-TEST-001.'
          ).toString('base64url'),
        },
      },
      {
        mimeType: 'application/pdf',
        filename: 'demand_letter.pdf',
        body: {
          attachmentId: 'att-001',
          size: 1024,
        },
      },
    ],
  },
};

const CANNED_ATTACHMENT_DATA = {
  data: Buffer.from('PDF_CONTENT_PLACEHOLDER').toString('base64url'),
};

const SLACK_FILE_ID   = 'F_TEST_SLACK_001';
const SLACK_MSG_TS    = '1722960000.000001';
const SLACK_CHANNEL   = 'C07R60KAC2C';

// ─── Mock storagePut so we don't hit real S3 ─────────────────────────────────

vi.mock('../storage.js', () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: 'mail/test/mock-key',
    url: 'https://storage.example.com/mock-key',
  }),
  storageGet: vi.fn(),
  storageGetSignedUrl: vi.fn().mockResolvedValue('https://storage.example.com/signed'),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

let conn: Connection;

beforeAll(async () => {
  conn = await mysql.createConnection(process.env.DATABASE_URL!);
  // Clean up any leftover test rows from previous runs
  await conn.execute(
    "DELETE FROM mail_items WHERE external_id IN (?, ?)",
    [GMAIL_MESSAGE_ID, SLACK_FILE_ID]
  );
});

afterAll(async () => {
  // Clean up test rows
  await conn.execute(
    "DELETE FROM mail_items WHERE external_id IN (?, ?)",
    [GMAIL_MESSAGE_ID, SLACK_FILE_ID]
  );
  await conn.end();
});

// ─── Gmail ingestion tests ────────────────────────────────────────────────────

describe('ingestGmail() — mocked HTTP', () => {
  const mockGmail: GmailFetchFn = {
    getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    listMessages: vi.fn().mockResolvedValue({ messages: [{ id: GMAIL_MESSAGE_ID }] }),
    getMessage: vi.fn().mockResolvedValue(CANNED_GMAIL_MESSAGE),
    getAttachment: vi.fn().mockResolvedValue(CANNED_ATTACHMENT_DATA),
    addLabel: vi.fn().mockResolvedValue(undefined),
    getOrCreateLabel: vi.fn().mockResolvedValue('mock-label-id'),
    markRead: vi.fn().mockResolvedValue(undefined), // no-op compat
    listReadMessages: vi.fn().mockResolvedValue({ messages: [] }),
  };

  it('G1: inserts a mail_items row with correct fields', async () => {
    const result = await ingestGmail(conn, mockGmail);
    expect(result.inserted, 'inserted count').toBe(1);
    expect(result.skipped, 'skipped count').toBe(0);
    expect(result.errors, 'errors').toHaveLength(0);

    const [[row]] = await conn.execute<any[]>(
      "SELECT * FROM mail_items WHERE external_id = ?",
      [GMAIL_MESSAGE_ID]
    );
    expect(row, 'row exists').toBeTruthy();
    expect(row.source, 'source').toBe('email');
    expect(row.external_id, 'external_id').toBe(GMAIL_MESSAGE_ID);
    expect(row.status, 'status').toBe('new');
    expect(row.category, 'category').toBeNull();
    expect(row.subject, 'subject').toBe('Demand Letter — CLM-TEST-001');
    expect(row.from_email, 'from_email').toBe('attorney@lawfirm.com');
    expect(row.from_name, 'from_name').toBe('Attorney Smith');
    expect(row.gmail_thread_id, 'gmail_thread_id').toBe(GMAIL_THREAD_ID);
    expect(row.body_text, 'body_text').toContain('CLM-TEST-001');
    expect(new Date(row.received_at).getTime(), 'uses Gmail internal received time').toBeCloseTo(
      Number(CANNED_GMAIL_MESSAGE.internalDate),
      -3,
    );
  });

  it('G2: inserts a mail_item_files row for the PDF attachment', async () => {
    const [[row]] = await conn.execute<any[]>(
      `SELECT f.* FROM mail_item_files f
       JOIN mail_items i ON i.id = f.item_id
       WHERE i.external_id = ?`,
      [GMAIL_MESSAGE_ID]
    );
    expect(row, 'attachment row exists').toBeTruthy();
    expect(row.filename, 'filename').toBe('demand_letter.pdf');
    expect(row.content_type, 'content_type').toBe('application/pdf');
  });

  it('G3: called addLabel with mailroom-done after successful insert', () => {
    expect(mockGmail.addLabel).toHaveBeenCalledWith('mock-access-token', GMAIL_MESSAGE_ID, 'mock-label-id');
  });

  it('G4: dedupe — inserting the same message twice yields exactly one row', async () => {
    // Run again with the same message ID
    const result2 = await ingestGmail(conn, mockGmail);
    expect(result2.inserted, 'second run inserted').toBe(0);
    expect(result2.skipped, 'second run skipped').toBe(1);

    const [rows] = await conn.execute<any[]>(
      "SELECT COUNT(*) AS cnt FROM mail_items WHERE external_id = ?",
      [GMAIL_MESSAGE_ID]
    );
    expect(rows[0].cnt, 'exactly one row').toBe(1);
  });

  it('G5: converts an HTML-only email body into readable Mailroom text', async () => {
    const htmlId = 'test-gmail-html-001';
    await conn.execute('DELETE FROM mail_items WHERE external_id=?', [htmlId]);
    const htmlMessage = {
      ...CANNED_GMAIL_MESSAGE,
      id: htmlId,
      payload: {
        ...CANNED_GMAIL_MESSAGE.payload,
        parts: [{
          mimeType: 'text/html',
          body: { data: Buffer.from('<p>Carrier <strong>follow-up</strong><br>Claim CLM-HTML-001</p>').toString('base64url') },
        }],
      },
    };
    const htmlGmail: GmailFetchFn = {
      ...mockGmail,
      listMessages: vi.fn().mockResolvedValue({ messages: [{ id: htmlId }] }),
      getMessage: vi.fn().mockResolvedValue(htmlMessage),
    };
    const result = await ingestGmail(conn, htmlGmail);
    expect(result.inserted).toBe(1);
    const [[row]] = await conn.execute<any[]>('SELECT body_text FROM mail_items WHERE external_id=?', [htmlId]);
    expect(row.body_text).toContain('Carrier follow-up');
    expect(row.body_text).toContain('CLM-HTML-001');
    await conn.execute('DELETE FROM mail_items WHERE external_id=?', [htmlId]);
  });
});

// ─── Slack ingestion tests ────────────────────────────────────────────────────

describe('handleSlackFileEvent() — mocked HTTP', () => {
  const mockSlack: SlackFetchFn = {
    getReactions: vi.fn().mockResolvedValue([]),
    downloadFile: vi.fn().mockResolvedValue({
      buffer: Buffer.from('FAKE_PDF_BYTES'),
      contentType: 'application/pdf',
    }),
    addReaction: vi.fn().mockResolvedValue(undefined),
    getPermalink: vi.fn().mockResolvedValue('https://slack.com/archives/C07R60KAC2C/p1722960000000001'),
    getFileInfo: vi.fn().mockResolvedValue(null),
  };

  const baseEvent = {
    fileId: SLACK_FILE_ID,
    messageTs: SLACK_MSG_TS,
    channelId: SLACK_CHANNEL,
    filename: 'subro_demand.pdf',
    mimeType: 'application/pdf',
    urlPrivateDownload: 'https://files.slack.com/files-pri/T-test/subro_demand.pdf',
    receivedAt: new Date('2026-08-06T12:00:00.000Z'),
  };

  const opts = {
    reviewedEmoji: 'white_check_mark',
    botMarkerEmoji: 'robot_face',
    addBotMarker: true,
  };

  it('S1: inserts a stub mail_items row with correct fields', async () => {
    const result = await handleSlackFileEvent(conn, baseEvent, mockSlack, opts);
    expect(result.action, 'action').toBe('inserted');
    expect(result.itemId, 'itemId').toBeTruthy();

    const [[row]] = await conn.execute<any[]>(
      "SELECT * FROM mail_items WHERE external_id = ?",
      [SLACK_FILE_ID]
    );
    expect(row, 'row exists').toBeTruthy();
    expect(row.source, 'source').toBe('mail');
    expect(row.external_id, 'external_id').toBe(SLACK_FILE_ID);
    expect(row.status, 'status').toBe('new');
    expect(row.category, 'category').toBeNull();
    expect(row.slack_channel_id, 'slack_channel_id').toBe(SLACK_CHANNEL);
    expect(row.slack_message_ts, 'slack_message_ts').toBe(SLACK_MSG_TS);
    expect(row.slack_permalink, 'slack_permalink').toContain('slack.com');
    expect(new Date(row.received_at).toISOString(), 'uses the original Slack upload time').toBe('2026-08-06T12:00:00.000Z');
  });

  it('S2: inserts a mail_item_files row for the downloaded file', async () => {
    const [[row]] = await conn.execute<any[]>(
      `SELECT f.* FROM mail_item_files f
       JOIN mail_items i ON i.id = f.item_id
       WHERE i.external_id = ?`,
      [SLACK_FILE_ID]
    );
    expect(row, 'file row exists').toBeTruthy();
    expect(row.filename, 'filename').toBe('subro_demand.pdf');
    expect(row.content_type, 'content_type').toBe('application/pdf');
  });

  it('S3: added the bot_marker_emoji reaction', () => {
    expect(mockSlack.addReaction).toHaveBeenCalledWith(
      SLACK_CHANNEL, SLACK_MSG_TS, 'robot_face'
    );
  });

  it('S4: dedupe — inserting the same file twice yields exactly one row', async () => {
    const result2 = await handleSlackFileEvent(conn, baseEvent, mockSlack, opts);
    expect(result2.action, 'action on second insert').toBe('skipped_dedupe');

    const [rows] = await conn.execute<any[]>(
      "SELECT COUNT(*) AS cnt FROM mail_items WHERE external_id = ?",
      [SLACK_FILE_ID]
    );
    expect(rows[0].cnt, 'exactly one row').toBe(1);
  });

  it('S5: pre_reviewed — file whose post already has reviewed_emoji gets pre_reviewed=1, status=resolved, not routed', async () => {
    const PRE_REVIEWED_FILE_ID = 'F_PRE_REVIEWED_001';
    const PRE_REVIEWED_TS = '1722960001.000001';

    // Clean up
    await conn.execute("DELETE FROM mail_items WHERE external_id = ?", [PRE_REVIEWED_FILE_ID]);

    const mockSlackReviewed: SlackFetchFn = {
      ...mockSlack,
      getReactions: vi.fn().mockResolvedValue([{ name: 'white_check_mark' }]),
    };

    const result = await handleSlackFileEvent(conn, {
      fileId: PRE_REVIEWED_FILE_ID,
      messageTs: PRE_REVIEWED_TS,
      channelId: SLACK_CHANNEL,
      filename: 'already_reviewed.pdf',
    }, mockSlackReviewed, opts);

    expect(result.action, 'action').toBe('pre_reviewed');

    const [[row]] = await conn.execute<any[]>(
      "SELECT * FROM mail_items WHERE external_id = ?",
      [PRE_REVIEWED_FILE_ID]
    );
    expect(row, 'row exists').toBeTruthy();
    expect(row.pre_reviewed, 'pre_reviewed').toBe(1);
    expect(row.status, 'status').toBe('resolved');
    expect(row.category, 'category').toBeNull();

    // Verify a system note was added
    const [[noteRow]] = await conn.execute<any[]>(
      "SELECT * FROM mail_item_notes WHERE item_id = ?",
      [row.id]
    );
    expect(noteRow, 'system note exists').toBeTruthy();
    expect(noteRow.note, 'note text').toContain('Already reviewed in Slack');

    // Clean up
    await conn.execute("DELETE FROM mail_items WHERE external_id = ?", [PRE_REVIEWED_FILE_ID]);
  });

  it('S6: hydrates file_shared events that arrive with only a Slack file ID', async () => {
    const hydratedId = 'F_HYDRATED_SLACK_001';
    await conn.execute('DELETE FROM mail_items WHERE external_id=?', [hydratedId]);
    const hydratedSlack: SlackFetchFn = {
      ...mockSlack,
      getFileInfo: vi.fn().mockResolvedValue({
        filename: 'hydrated.pdf',
        mimeType: 'application/pdf',
        urlPrivateDownload: 'https://files.slack.com/files-pri/T-test/hydrated.pdf',
        messageTs: '1722960002.000001',
      }),
    };
    const result = await handleSlackFileEvent(conn, {
      fileId: hydratedId,
      messageTs: '1722960002.000001',
      channelId: SLACK_CHANNEL,
    }, hydratedSlack, opts);
    expect(result.action).toBe('inserted');
    const [[file]] = await conn.execute<any[]>('SELECT filename FROM mail_item_files WHERE item_id=?', [result.itemId]);
    expect(file.filename).toBe('hydrated.pdf');
    await conn.execute('DELETE FROM mail_items WHERE external_id=?', [hydratedId]);
  });

  it('S7: retries a fresh files.info URL when the event download URL has expired', async () => {
    const retryId = 'F_RETRY_FRESH_URL_001';
    await conn.execute('DELETE FROM mail_items WHERE external_id=?', [retryId]);
    const retrySlack: SlackFetchFn = {
      ...mockSlack,
      downloadFile: vi.fn()
        .mockRejectedValueOnce(new Error('Slack file download failed (403)'))
        .mockResolvedValueOnce({ buffer: Buffer.from('FRESH_PDF'), contentType: 'application/pdf' }),
      getFileInfo: vi.fn().mockResolvedValue({
        filename: 'fresh-fax.pdf',
        mimeType: 'application/pdf',
        urlPrivateDownload: 'https://files.slack.com/files-pri/T-test/fresh-fax.pdf',
        messageTs: '1722960003.000001',
      }),
    };
    const result = await handleSlackFileEvent(conn, { ...baseEvent, fileId: retryId, urlPrivateDownload: 'https://files.slack.com/expired.pdf' }, retrySlack, opts);
    expect(result.action).toBe('inserted');
    expect(retrySlack.getFileInfo).toHaveBeenCalledWith(retryId);
    const [[file]] = await conn.execute<any[]>('SELECT filename FROM mail_item_files WHERE item_id=?', [result.itemId]);
    expect(file.filename).toBe('fresh-fax.pdf');
    await conn.execute('DELETE FROM mail_items WHERE external_id=?', [retryId]);
  });
});
