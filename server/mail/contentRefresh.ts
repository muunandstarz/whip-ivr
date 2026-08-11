import type { Connection } from 'mysql2/promise';
import { PDFParse } from 'pdf-parse';
import { storageGetSignedUrl } from '../storage.js';
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

export function buildMailSummary(classification: ClassificationResult): string | null {
  return [
    classification.claim_number ? `Claim: ${classification.claim_number}` : null,
    classification.claimant_or_member_name ? `Person: ${classification.claimant_or_member_name}` : null,
    classification.adverse_carrier ? `Carrier: ${classification.adverse_carrier}` : null,
    classification.requested_action ?? null,
    classification.reason ? classification.reason.slice(0, 120) : null,
  ].filter(Boolean).join(' · ').slice(0, 255) || null;
}

export function buildAiSubject(classification: ClassificationResult, currentSubject: string | null): string {
  const isGeneric = !currentSubject
    || currentSubject === '(no subject)'
    || /^Claims Mail[_\s]/i.test(currentSubject);
  if (!isGeneric) return currentSubject;
  const parts = [CATEGORY_TITLE_MAP[classification.category] ?? 'Claims Correspondence'];
  if (classification.adverse_carrier) parts.push(classification.adverse_carrier);
  else if (classification.sender_organization) parts.push(classification.sender_organization);
  if (classification.claimant_or_member_name) parts.push(classification.claimant_or_member_name);
  if (classification.claim_number) parts.push(classification.claim_number);
  return parts.join(' — ').slice(0, 255);
}

export interface ContentRefreshResult {
  refreshed: number;
  errors: number;
  total: number;
}

async function extractPdfText(urls: string[]): Promise<string> {
  const chunks: string[] = [];
  for (const url of urls.slice(0, 2)) {
    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ url });
      const parsed = await parser.getText({ partial: [1, 2, 3, 4, 5] });
      if (parsed.text?.trim()) chunks.push(parsed.text.trim());
    } catch (error) {
      console.warn('[mailContentRefresh] PDF text extraction skipped:', error instanceof Error ? error.message : String(error));
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }
  return chunks.join('\n\n').slice(0, 50000);
}

/**
 * Re-read unresolved, already-classified mail that lacks a useful summary or title.
 * This deliberately leaves category, assignee, status, and all routing history intact.
 */
export async function refreshIncompleteMailContent(
  conn: Connection,
  limit = 50,
): Promise<ContentRefreshResult> {
  const batchLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const [items] = await conn.execute<any[]>(
    `SELECT mi.id, mi.subject, mi.body_text,
            GROUP_CONCAT(mif.filename SEPARATOR ', ') AS attachment_names,
            GROUP_CONCAT(CONCAT(COALESCE(mif.content_type, ''), ':::', mif.storage_key) SEPARATOR '|||') AS file_entries
     FROM mail_items mi
     LEFT JOIN mail_item_files mif ON mif.item_id = mi.id
     WHERE mi.status IN ('new', 'assigned', 'escalated')
       AND mi.category IS NOT NULL
       AND (
         COALESCE(mi.summary_note, '') = ''
         OR COALESCE(mi.subject, '') = ''
         OR mi.subject = '(no subject)'
         OR mi.subject REGEXP '^Claims Mail[_ ]'
       )
     GROUP BY mi.id
     ORDER BY mi.received_at ASC
     LIMIT ${batchLimit}`,
  );

  let refreshed = 0;
  let errors = 0;
  for (const item of items) {
    try {
      const keys = String(item.file_entries ?? '')
        .split('|||')
        .map((entry: string) => {
          const [contentType, ...keyParts] = entry.split(':::');
          return { contentType, key: keyParts.join(':::') };
        })
        .filter((entry: { contentType: string; key: string }) =>
          entry.contentType.toLowerCase().includes('pdf') || entry.key.toLowerCase().endsWith('.pdf'),
        )
        .map((entry: { key: string }) => entry.key)
        .filter(Boolean)
        .slice(0, 2);
      const fileUrls = (await Promise.all(
        keys.map((key: string) => storageGetSignedUrl(key).catch(() => null)),
      )).filter(Boolean) as string[];
      const attachmentText = await extractPdfText(fileUrls);
      const indexedBody = [item.body_text, attachmentText]
        .filter(Boolean)
        .join('\n\nAttachment text:\n')
        .slice(0, 60000);
      const classification = await classify({
        subject: item.subject ?? undefined,
        bodyText: indexedBody || undefined,
        attachmentNames: item.attachment_names
          ? String(item.attachment_names).split(', ').filter(Boolean)
          : undefined,
        fileUrls: attachmentText ? undefined : (fileUrls.length ? fileUrls : undefined),
      });
      await conn.execute(
        `UPDATE mail_items
         SET summary_note = ?, subject = ?,
             body_text = CASE WHEN ? = '' THEN body_text ELSE ? END,
             claim_number = COALESCE(NULLIF(claim_number, ''), ?),
             sender_org = COALESCE(NULLIF(sender_org, ''), ?),
             adverse_carrier = COALESCE(NULLIF(adverse_carrier, ''), ?),
             claimant_name = COALESCE(NULLIF(claimant_name, ''), ?),
             requested_action = COALESCE(NULLIF(requested_action, ''), ?),
             reason = COALESCE(NULLIF(reason, ''), ?)
         WHERE id = ?`,
        [
          buildMailSummary(classification),
          buildAiSubject(classification, item.subject ?? null),
          attachmentText,
          indexedBody,
          classification.claim_number ?? null,
          classification.sender_organization ?? null,
          classification.adverse_carrier ?? null,
          classification.claimant_or_member_name ?? null,
          classification.requested_action ?? null,
          classification.reason ?? null,
          item.id,
        ],
      );
      refreshed++;
    } catch (error) {
      console.error(`[mailContentRefresh] item ${item.id} failed:`, error);
      errors++;
    }
  }

  return { refreshed, errors, total: items.length };
}
