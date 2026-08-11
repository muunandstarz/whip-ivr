/**
 * classify(bodyText, attachmentNames?, imageUrls?)
 *
 * Calls the Forge LLM with the section-6 prompt and returns a parsed
 * ClassificationResult. Strips markdown fences defensively.
 *
 * The function is exported as a plain async function so tests can mock it
 * by replacing the module export (vi.mock / dependency injection).
 */

import { invokeLLM } from '../_core/llm.js';

export const CATEGORIES = [
  'injury_pip_bi',
  'inbound_subro',
  'existing_claim_followup',
  'outbound_subro',
  'total_loss',
  'legal_or_high_risk',
  'other_or_unclear',
] as const;

export type Category = typeof CATEGORIES[number];

export interface ClassificationResult {
  category: Category;
  confidence: number;           // 0-100
  is_demand: boolean;
  demand_date?: string | null;
  response_due_date?: string | null;
  claim_number?: string | null;
  sender_organization?: string | null;
  claimant_or_member_name?: string | null;
  adverse_carrier?: string | null;
  date_of_loss?: string | null;
  requested_action?: string | null;
  urgency?: 'low' | 'normal' | 'high' | 'urgent';
  reason?: string | null;
}

const SYSTEM_PROMPT = `You are a claims mail classifier for Whip Claims Management, a TNC (rideshare) insurance program administrator. Classify incoming mail into exactly one of these seven categories, in priority order (highest first):

1. legal_or_high_risk — summons, complaints, lawsuits, bad-faith threats, regulatory/DOI correspondence, or any explicit policy-limit demand with litigation language
2. injury_pip_bi — bodily injury claims, PIP claims, medical bills, attorney demand letters for injuries (without active litigation language)
3. inbound_subro — adverse carrier seeking reimbursement from us (their insured was our member's victim)
4. outbound_subro — adverse carrier responding to our subrogation demand
5. total_loss — total-loss valuations, ACV/salvage figures, total-loss settlements
6. existing_claim_followup — member or claimant checking status of an existing claim
7. other_or_unclear — vendor pitches, spam, unclassifiable, or anything that doesn't fit above

Rules:
- If the mail contains BOTH a total-loss valuation AND an outbound subro response, choose total_loss.
- Set is_demand=true if the mail is a formal demand for payment or settlement.
- Extract response_due_date if stated or implied (e.g. "respond within 30 days" → calculate from demand_date or today).
- confidence: 0-100. Use <75 when genuinely ambiguous; use ≥90 when clear.
- Return ONLY minified JSON, no markdown fences, no explanation. Schema:
{"category":"…","confidence":0,"is_demand":false,"demand_date":null,"response_due_date":null,"claim_number":null,"sender_organization":null,"claimant_or_member_name":null,"adverse_carrier":null,"date_of_loss":null,"requested_action":null,"urgency":"normal","reason":"…"}`;

/** Strip markdown code fences and trim whitespace */
function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/** Parse the LLM response defensively; throw with context on failure */
function parseClassification(raw: string): ClassificationResult {
  const cleaned = stripFences(raw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`classify: JSON parse failed. Raw: ${cleaned.slice(0, 200)}`);
  }

  const category = parsed.category as string;
  if (!CATEGORIES.includes(category as Category)) {
    throw new Error(`classify: unknown category "${category}"`);
  }

  return {
    category: category as Category,
    confidence: Number(parsed.confidence ?? 50),
    is_demand: Boolean(parsed.is_demand),
    demand_date: (parsed.demand_date as string) ?? null,
    response_due_date: (parsed.response_due_date as string) ?? null,
    claim_number: (parsed.claim_number as string) ?? null,
    sender_organization: (parsed.sender_organization as string) ?? null,
    claimant_or_member_name: (parsed.claimant_or_member_name as string) ?? null,
    adverse_carrier: (parsed.adverse_carrier as string) ?? null,
    date_of_loss: (parsed.date_of_loss as string) ?? null,
    requested_action: (parsed.requested_action as string) ?? null,
    urgency: (['low', 'normal', 'high', 'urgent'].includes(parsed.urgency as string)
      ? parsed.urgency as ClassificationResult['urgency']
      : 'normal'),
    reason: (parsed.reason as string) ?? null,
  };
}

export interface ClassifyInput {
  subject?: string;
  bodyText?: string;
  attachmentNames?: string[];
  /** For Slack mail items: presigned image URLs for vision */
  imageUrls?: string[];
  /** Presigned S3 URLs for attached PDFs — downloaded and sent as base64 file_url */
  fileUrls?: string[];
}

export async function classify(input: ClassifyInput): Promise<ClassificationResult> {
  const parts: string[] = [];
  if (input.subject) parts.push(`Subject: ${input.subject}`);
  if (input.bodyText) parts.push(`Body:\n${input.bodyText.slice(0, 4000)}`);
  if (input.attachmentNames?.length) {
    parts.push(`Attachments: ${input.attachmentNames.join(', ')}`);
  }
  const userText = parts.join('\n\n') || '(no content)';

  // Build multipart user content if we have file URLs to read
  const hasFiles = (input.fileUrls?.length ?? 0) > 0 || (input.imageUrls?.length ?? 0) > 0;
  let userContent: any;
  if (hasFiles) {
    const contentParts: any[] = [{ type: 'text', text: userText }];
    // Download PDFs and send as base64 data URLs for direct LLM reading
    for (const url of (input.fileUrls ?? [])) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const b64 = buf.toString('base64');
          contentParts.push({ type: 'file_url', file_url: { url: `data:application/pdf;base64,${b64}`, mime_type: 'application/pdf' } });
        }
      } catch { /* skip failed downloads */ }
    }
    for (const url of (input.imageUrls ?? [])) {
      contentParts.push({ type: 'image_url', image_url: { url, detail: 'high' } });
    }
    userContent = contentParts;
  } else {
    userContent = userText;
  }

  const extractRaw = (result: Awaited<ReturnType<typeof invokeLLM>>): string | null => {
    const choice = result.choices?.[0];
    if (!choice) return null;
    const content = choice.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const textPart = content.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      if (textPart) return textPart.text;
    }
    return null;
  };

  let result = await invokeLLM({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });
  let raw = extractRaw(result);
  // Some providers decline rich PDF inputs without a visible text response.
  // Retry the same classification from the persisted subject/body/attachment metadata.
  if (!raw && hasFiles) {
    result = await invokeLLM({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
    });
    raw = extractRaw(result);
  }
  if (!raw) throw new Error('classify: empty LLM response');

  return parseClassification(raw);
}
