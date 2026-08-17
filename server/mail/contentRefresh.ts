import type { Connection } from 'mysql2/promise';
import { PDFParse } from 'pdf-parse';
import { storageGetSignedUrl } from '../storage.js';
import { buildRealGmailFetch, type GmailPart } from './ingestGmail.js';
import { classify, type ClassificationResult } from './classify.js';

const CATEGORY_TITLE_MAP: Record<string, string> = {
  injury_pip_bi: 'Injury / PIP / BI Mail',
  inbound_subro: 'Inbound Subrogation',
  existing_claim_followup: 'Claim Follow-up',
  outbound_subro: 'Outbound Subrogation',
  total_loss: 'Total Loss Document',
  legal_or_high_risk: 'Legal / High Risk',
  other_or_unclear: 'Claims Correspondence',
};

export interface MailContentFile {
  contentType: string;
  storageKey: string;
  slackFileId: string | null;
  filename: string | null;
}

export interface MailContentRead {
  attachmentText: string;
  indexedBody: string;
  hasReadableContent: boolean;
  imageDataUrls: string[];
}

function isUsableFileResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  return response.ok && !contentType.includes('xml') && !contentType.includes('text/html');
}

function findAttachment(part: GmailPart | undefined, filename: string): GmailPart | null {
  if (!part) return null;
  if (part.filename === filename && part.body) return part;
  for (const child of part.parts ?? []) {
    const match = findAttachment(child, filename);
    if (match) return match;
  }
  return null;
}

export function parseMailContentFiles(rawEntries: string | null | undefined): MailContentFile[] {
  return String(rawEntries ?? '')
    .split('|||')
    .map((entry) => {
      const [contentType, storageKey, slackFileId, filename] = entry.split(':::');
      return { contentType, storageKey, slackFileId: slackFileId || null, filename: filename || null };
    })
    .filter((file) =>
      Boolean(file.storageKey) &&
      (file.contentType.toLowerCase().includes('pdf') || file.storageKey.toLowerCase().endsWith('.pdf')),
    )
    .slice(0, 2);
}

export function buildMailSummary(classification: ClassificationResult): string | null {
  const category = classification.is_medical_bill
    ? 'Medical Bill'
    : (CATEGORY_TITLE_MAP[classification.category] ?? 'Claims Correspondence');
  const action = classification.is_medical_bill
    ? 'Provider invoice attached'
    : classification.is_demand
    ? 'Demand attached'
    : classification.requested_action?.trim() || null;
  const headline = [category, action].filter(Boolean).join(' — ');
  return [
    headline,
    classification.claim_number ? `Claim ${classification.claim_number}` : null,
    classification.claimant_or_member_name ?? null,
    classification.adverse_carrier ?? classification.sender_organization ?? null,
    classification.reason ? classification.reason.replace(/\s+/g, ' ').trim().slice(0, 105) : null,
  ].filter(Boolean).join(' · ').slice(0, 255) || null;
}

export function buildAiSubject(classification: ClassificationResult, currentSubject: string | null): string {
  const isGeneric = !currentSubject
    || currentSubject === '(no subject)'
    || /^(Claims Mail|FAX)[_\s]/i.test(currentSubject);
  if (!isGeneric) return currentSubject;
  const parts = [classification.is_medical_bill
    ? 'Medical Bill'
    : (CATEGORY_TITLE_MAP[classification.category] ?? 'Claims Correspondence')];
  if (classification.adverse_carrier) parts.push(classification.adverse_carrier);
  else if (classification.sender_organization) parts.push(classification.sender_organization);
  if (classification.claimant_or_member_name) parts.push(classification.claimant_or_member_name);
  if (classification.claim_number) parts.push(classification.claim_number);
  return parts.join(' — ').slice(0, 255);
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: bytes });
    const parsed = await parser.getText({ partial: [1, 2, 3, 4, 5] });
    return parsed.text?.trim().slice(0, 50000) ?? '';
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

async function downloadSlackFile(slackFileId: string, token: string): Promise<{ bytes: Buffer | null; imageDataUrl: string | null }> {
  if (!token) return { bytes: null, imageDataUrl: null };
  const infoResponse = await fetch(`https://slack.com/api/files.info?file=${encodeURIComponent(slackFileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const info = await infoResponse.json().catch(() => null) as any;
  if (!info?.ok) return { bytes: null, imageDataUrl: null };
  const fileUrl = info.file?.url_private_download || info.file?.url_private;
  let bytes: Buffer | null = null;
  if (fileUrl) {
    const fileResponse = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (isUsableFileResponse(fileResponse)) bytes = Buffer.from(await fileResponse.arrayBuffer());
  }
  const previewUrl = info.file?.thumb_pdf || info.file?.thumb_720 || info.file?.thumb_480 || null;
  let imageDataUrl: string | null = null;
  if (previewUrl) {
    const previewResponse = await fetch(previewUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (previewResponse.ok && previewResponse.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
      const mime = previewResponse.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      imageDataUrl = `data:${mime};base64,${Buffer.from(await previewResponse.arrayBuffer()).toString('base64')}`;
    }
  }
  return { bytes, imageDataUrl };
}

/**
 * Build a single batch-scoped reader for source mail. It uses Gmail/Slack as the
 * source of truth and only falls back to storage URLs when direct retrieval is not
 * available. This avoids assigning work based solely on a filename.
 */
export async function createMailContentReader(conn: Connection) {
  const [[mailBotConfig]] = await conn.execute<any[]>(
    'SELECT slack_bot_token FROM mail_bot_config ORDER BY id ASC LIMIT 1',
  );
  const slackToken = mailBotConfig?.slack_bot_token || process.env.SLACK_BOT_TOKEN || '';
  const gmail = buildRealGmailFetch(conn);
  const gmailToken = await gmail.getAccessToken().catch(() => null);
  const gmailMessages = new Map<string, Awaited<ReturnType<typeof gmail.getMessage>>>();

  return async function readMailContent(
    source: string,
    externalId: string,
    bodyText: string | null | undefined,
    files: MailContentFile[],
  ): Promise<MailContentRead> {
    const extractedChunks: string[] = [];
    const imageDataUrls: string[] = [];
    for (const file of files) {
      let bytes: Buffer | null = null;
      if (source === 'mail' && file.slackFileId) {
        const slackFile = await downloadSlackFile(file.slackFileId, slackToken);
        bytes = slackFile.bytes;
        if (slackFile.imageDataUrl) imageDataUrls.push(slackFile.imageDataUrl);
      } else if (source === 'email' && gmailToken && file.filename) {
        let message = gmailMessages.get(externalId);
        if (!message) {
          message = await gmail.getMessage(gmailToken, externalId);
          gmailMessages.set(externalId, message);
        }
        const attachment = findAttachment(message.payload as GmailPart | undefined, file.filename);
        if (attachment?.body?.attachmentId || attachment?.body?.data) {
          const encoded = attachment.body.attachmentId
            ? (await gmail.getAttachment(gmailToken, externalId, attachment.body.attachmentId)).data
            : attachment.body.data!;
          bytes = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        }
      }
      if (!bytes) {
        const signedUrl = await storageGetSignedUrl(file.storageKey).catch(() => null);
        if (signedUrl) {
          const response = await fetch(signedUrl);
          if (isUsableFileResponse(response)) bytes = Buffer.from(await response.arrayBuffer());
        }
      }
      if (bytes?.length) {
        const text = await extractPdfText(bytes).catch((error) => {
          console.warn(`[mailContentRefresh] PDF text extraction skipped for ${externalId}:`, error instanceof Error ? error.message : String(error));
          return '';
        });
        if (text) extractedChunks.push(text);
      }
    }

    const attachmentText = extractedChunks.join('\n\n').slice(0, 50000);
    const indexedBody = [bodyText?.trim(), attachmentText]
      .filter(Boolean)
      .join('\n\nAttachment text:\n')
      .slice(0, 60000);
    return { attachmentText, indexedBody, hasReadableContent: indexedBody.trim().length > 0 || imageDataUrls.length > 0, imageDataUrls };
  };
}

export interface ContentRefreshResult {
  refreshed: number;
  errors: number;
  total: number;
}

/** Re-read unresolved, already-classified mail that lacks a useful summary or title. */
export async function refreshIncompleteMailContent(conn: Connection, limit = 50): Promise<ContentRefreshResult> {
  const batchLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const [items] = await conn.execute<any[]>(
    `SELECT mi.id, mi.source, mi.external_id, mi.subject, mi.body_text, mi.received_at,
            GROUP_CONCAT(mif.filename SEPARATOR ', ') AS attachment_names,
            GROUP_CONCAT(CONCAT(COALESCE(mif.content_type, ''), ':::', mif.storage_key, ':::', COALESCE(mif.slack_file_id, ''), ':::', COALESCE(mif.filename, '')) SEPARATOR '|||') AS file_entries
     FROM mail_items mi
     LEFT JOIN mail_item_files mif ON mif.item_id = mi.id
     WHERE mi.status IN ('new', 'assigned', 'escalated')
       AND mi.category IS NOT NULL
       AND (
         COALESCE(mi.summary_note, '') = ''
         OR COALESCE(mi.subject, '') = ''
         OR mi.subject = '(no subject)'
         OR mi.subject REGEXP '^(Claims Mail|FAX)[_ ]'
       )
     GROUP BY mi.id
     ORDER BY mi.received_at ASC
     LIMIT ${batchLimit}`,
  );

  const readMailContent = await createMailContentReader(conn);
  let refreshed = 0;
  let errors = 0;
  let cursor = 0;
  const workerCount = Math.min(2, items.length);
  const refreshOne = async (item: any) => {
    try {
      const content = await readMailContent(item.source, item.external_id, item.body_text, parseMailContentFiles(item.file_entries));
      if (!content.hasReadableContent) return;
      const classification = await classify({
        subject: item.subject ?? undefined,
        bodyText: content.indexedBody,
        receivedAt: item.received_at,
        attachmentNames: item.attachment_names ? String(item.attachment_names).split(', ').filter(Boolean) : undefined,
        imageUrls: content.imageDataUrls,
      });
      await conn.execute(
        `UPDATE mail_items
         SET summary_note = ?, subject = ?,
             body_text = CASE WHEN ? = '' THEN body_text ELSE ? END,
             is_demand = CASE WHEN is_demand = 1 OR ? = 1 THEN 1 ELSE 0 END,
             is_medical_bill = CASE WHEN is_medical_bill = 1 OR ? = 1 THEN 1 ELSE 0 END,
             demand_date = COALESCE(NULLIF(demand_date, ''), ?),
             response_due_date = COALESCE(NULLIF(response_due_date, ''), ?),
             claim_number = COALESCE(NULLIF(claim_number, ''), ?),
             sender_org = COALESCE(NULLIF(sender_org, ''), ?),
             adverse_carrier = COALESCE(NULLIF(adverse_carrier, ''), ?),
             claimant_name = COALESCE(NULLIF(claimant_name, ''), ?),
             requested_action = COALESCE(NULLIF(requested_action, ''), ?),
             reason = COALESCE(NULLIF(reason, ''), ?)
         WHERE id = ?`,
        [
          buildMailSummary(classification), buildAiSubject(classification, item.subject ?? null),
          content.attachmentText, content.indexedBody,
          classification.is_demand ? 1 : 0, classification.is_medical_bill ? 1 : 0,
          classification.demand_date ?? null, classification.response_due_date ?? null,
          classification.claim_number ?? null, classification.sender_organization ?? null,
          classification.adverse_carrier ?? null, classification.claimant_or_member_name ?? null,
          classification.requested_action ?? null, classification.reason ?? null, item.id,
        ],
      );
      refreshed++;
    } catch (error) {
      console.error(`[mailContentRefresh] item ${item.id} failed:`, error);
      errors++;
    }
  };
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const item = items[cursor++];
      if (!item) return;
      await refreshOne(item);
    }
  }));
  return { refreshed, errors, total: items.length };
}
