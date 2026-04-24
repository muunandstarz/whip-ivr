/**
 * Snapsheet Claims API Integration
 * 
 * Option 3 Hybrid: Snapsheet claim lookup → fallback to caller-stated handler
 * 
 * To activate: Set SNAPSHEET_API_URL and SNAPSHEET_API_KEY in environment secrets.
 * Until then, the lookup returns null and the system falls back to caller-stated handler.
 */

const SNAPSHEET_BASE_URL = process.env.SNAPSHEET_API_URL ?? null;
const SNAPSHEET_API_KEY = process.env.SNAPSHEET_API_KEY ?? null;
const SNAPSHEET_API_SECRET = process.env.SNAPSHEET_API_SECRET ?? null;

export interface SnapsheetClaimResult {
  claimNumber: string;
  handlerName: string | null;
  handlerEmail: string | null;
  claimantName: string | null;
  insuredName: string | null;
  status: string | null;
  dateOfLoss: string | null;
  market: string | null;
}

/**
 * Look up a claim in Snapsheet by claim number.
 * Returns null if Snapsheet is not configured or the claim is not found.
 */
export async function lookupClaimInSnapsheet(
  claimNumber: string
): Promise<SnapsheetClaimResult | null> {
  // Not configured — fall back to caller-stated handler
  if (!SNAPSHEET_BASE_URL || !SNAPSHEET_API_KEY) {
    console.log(`[Snapsheet] Not configured — skipping lookup for claim ${claimNumber}`);
    return null;
  }

  try {
    // Normalize claim number — strip spaces and common prefixes for lookup
    const normalized = claimNumber.replace(/\s+/g, "").toUpperCase();

    // Try lookup by claim number
    const auth = SNAPSHEET_API_SECRET
      ? Buffer.from(`${SNAPSHEET_API_KEY}:${SNAPSHEET_API_SECRET}`).toString("base64")
      : null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (auth) {
      headers["Authorization"] = `Basic ${auth}`;
    } else {
      headers["Authorization"] = `Bearer ${SNAPSHEET_API_KEY}`;
    }

    // Primary: search by claim number
    const searchUrl = `${SNAPSHEET_BASE_URL}/v1/claims?claim_number=${encodeURIComponent(normalized)}`;
    const response = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      console.warn(`[Snapsheet] Claim lookup returned ${response.status} for ${claimNumber}`);
      return null;
    }

    const data = await response.json() as any;

    // Handle both array and single-object responses
    const claim = Array.isArray(data) ? data[0] : (data.claims?.[0] ?? data.claim ?? data);
    if (!claim) return null;

    // Extract handler — field names vary by Snapsheet configuration
    const handlerName =
      claim.adjuster?.name ??
      claim.handler?.name ??
      claim.assigned_to?.name ??
      claim.examiner?.name ??
      null;

    const handlerEmail =
      claim.adjuster?.email ??
      claim.handler?.email ??
      claim.assigned_to?.email ??
      null;

    return {
      claimNumber: claim.claim_number ?? claim.claimNumber ?? claimNumber,
      handlerName,
      handlerEmail,
      claimantName: claim.claimant?.name ?? claim.claimant_name ?? null,
      insuredName: claim.insured?.name ?? claim.insured_name ?? null,
      status: claim.status ?? null,
      dateOfLoss: claim.date_of_loss ?? claim.dateOfLoss ?? null,
      market: claim.market ?? claim.branch ?? null,
    };
  } catch (err) {
    console.error(`[Snapsheet] Lookup error for claim ${claimNumber}:`, err);
    return null;
  }
}

/**
 * Option 3 Hybrid: Try Snapsheet first, fall back to caller-stated handler name.
 * Returns the best available handler name and email.
 */
export async function resolveHandlerFromClaim(
  whipClaimNumber: string | null,
  callerStatedHandler: string | null
): Promise<{
  handlerName: string | null;
  handlerEmail: string | null;
  source: "snapsheet" | "caller_stated" | "default";
  snapsheetData: SnapsheetClaimResult | null;
}> {
  // Step 1: Try Snapsheet lookup if we have a claim number
  if (whipClaimNumber) {
    const snapsheetResult = await lookupClaimInSnapsheet(whipClaimNumber);
    if (snapsheetResult?.handlerName) {
      console.log(
        `[Snapsheet] Found handler "${snapsheetResult.handlerName}" for claim ${whipClaimNumber}`
      );
      return {
        handlerName: snapsheetResult.handlerName,
        handlerEmail: snapsheetResult.handlerEmail,
        source: "snapsheet",
        snapsheetData: snapsheetResult,
      };
    }
  }

  // Step 2: Fall back to what the caller stated
  if (callerStatedHandler) {
    return {
      handlerName: callerStatedHandler,
      handlerEmail: null,
      source: "caller_stated",
      snapsheetData: null,
    };
  }

  // Step 3: No handler identified
  return {
    handlerName: null,
    handlerEmail: null,
    source: "default",
    snapsheetData: null,
  };
}

export const snapsheetConfigured = !!(SNAPSHEET_BASE_URL && SNAPSHEET_API_KEY);
