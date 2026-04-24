/**
 * Whip Claim Number Matching Utility
 *
 * Whip claim numbers follow the format: STATE-NNNN-VVVVVV-CCCCCC
 *   e.g. MD-9562-020976-523574
 *
 * The two searchable fragments embedded in every claim number are:
 *   1. Middle 6 digits (VVVVVV) — last 6 of the vehicle VIN
 *   2. Last 6 digits (CCCCCC)  — unique claim sequence
 *
 * When a caller provides a partial number (5+ digits), we try to match it
 * against both fragments using substring search. This handles the common
 * case where adjusters only have part of the claim number on file.
 */

export type ClaimMatchResult = {
  /** The full normalized claim number found, if any */
  matchedClaimNumber: string | null;
  /** How the match was made */
  matchType: "exact" | "vin_fragment" | "claim_fragment" | "partial" | "none";
  /** 0–100 confidence score */
  confidence: number;
  /** The raw input that was matched */
  inputFragment: string;
};

/**
 * Normalize a claim number string — strip spaces, dashes become consistent,
 * uppercase everything.
 */
export function normalizeClaimNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "").replace(/-+/g, "-");
}

/**
 * Extract the two searchable fragments from a full Whip claim number.
 * Format: STATE-NNNN-VVVVVV-CCCCCC
 * Returns { vinFragment: "VVVVVV", claimFragment: "CCCCCC" } or null if not parseable.
 */
export function extractClaimFragments(
  claimNumber: string
): { vinFragment: string; claimFragment: string } | null {
  const normalized = normalizeClaimNumber(claimNumber);
  // Match: 2-letter state code, 4-digit number, 6-digit VIN fragment, 6-digit claim fragment
  const match = normalized.match(/^[A-Z]{2}-\d{4}-(\d{6})-(\d{6})$/);
  if (!match) return null;
  return {
    vinFragment: match[1],
    claimFragment: match[2],
  };
}

/**
 * Given a partial input from a caller (e.g. "020976" or "52357"),
 * attempt to match it against a list of known full claim numbers.
 *
 * Matching priority:
 *   1. Exact full match (normalized)
 *   2. Exact VIN fragment match (last 6 of VIN)
 *   3. Exact claim sequence fragment match (last 6 of claim)
 *   4. Partial substring match in either fragment (5+ chars)
 *
 * Returns the best match found, or matchType "none" if nothing found.
 */
export function matchClaimNumber(
  input: string,
  knownClaimNumbers: string[]
): ClaimMatchResult {
  if (!input || input.trim().length < 4) {
    return { matchedClaimNumber: null, matchType: "none", confidence: 0, inputFragment: input };
  }

  const normalizedInput = input.trim().toUpperCase().replace(/[\s-]/g, "");

  // 1. Exact full match (normalize both sides)
  for (const known of knownClaimNumbers) {
    const normalizedKnown = normalizeClaimNumber(known).replace(/-/g, "");
    if (normalizedKnown === normalizedInput || normalizeClaimNumber(known) === normalizeClaimNumber(input)) {
      return {
        matchedClaimNumber: known,
        matchType: "exact",
        confidence: 100,
        inputFragment: input,
      };
    }
  }

  // 2 & 3. Fragment matches
  const fragmentMatches: Array<{ claim: string; type: "vin_fragment" | "claim_fragment"; confidence: number }> = [];

  for (const known of knownClaimNumbers) {
    const fragments = extractClaimFragments(known);
    if (!fragments) continue;

    if (fragments.vinFragment === normalizedInput) {
      fragmentMatches.push({ claim: known, type: "vin_fragment", confidence: 95 });
    } else if (fragments.claimFragment === normalizedInput) {
      fragmentMatches.push({ claim: known, type: "claim_fragment", confidence: 95 });
    }
  }

  if (fragmentMatches.length === 1) {
    return {
      matchedClaimNumber: fragmentMatches[0].claim,
      matchType: fragmentMatches[0].type,
      confidence: fragmentMatches[0].confidence,
      inputFragment: input,
    };
  }

  // Multiple fragment matches — lower confidence, return first
  if (fragmentMatches.length > 1) {
    return {
      matchedClaimNumber: fragmentMatches[0].claim,
      matchType: fragmentMatches[0].type,
      confidence: 60,
      inputFragment: input,
    };
  }

  // 4. Partial substring match (5+ chars required to reduce false positives)
  if (normalizedInput.length >= 5) {
    const partialMatches: Array<{ claim: string; confidence: number }> = [];

    for (const known of knownClaimNumbers) {
      const fragments = extractClaimFragments(known);
      if (!fragments) continue;

      const vinMatch = fragments.vinFragment.includes(normalizedInput) ||
        normalizedInput.includes(fragments.vinFragment.substring(0, 5));
      const claimMatch = fragments.claimFragment.includes(normalizedInput) ||
        normalizedInput.includes(fragments.claimFragment.substring(0, 5));

      if (vinMatch || claimMatch) {
        // Confidence based on how much of the fragment was matched
        const matchLen = normalizedInput.length;
        const confidence = Math.min(85, 50 + matchLen * 5);
        partialMatches.push({ claim: known, confidence });
      }
    }

    if (partialMatches.length === 1) {
      return {
        matchedClaimNumber: partialMatches[0].claim,
        matchType: "partial",
        confidence: partialMatches[0].confidence,
        inputFragment: input,
      };
    }
  }

  return { matchedClaimNumber: null, matchType: "none", confidence: 0, inputFragment: input };
}

/**
 * Build the Snapsheet claim URL from a matched claim number.
 * Once the Snapsheet base URL is confirmed, this produces a direct link
 * to the claim in the Snapsheet UI.
 *
 * Snapsheet URL format (to be confirmed with API docs):
 *   https://snapsheetvice.com/claims/{claimNumber}
 */
export function buildSnapsheetClaimUrl(claimNumber: string): string | null {
  if (!claimNumber) return null;
  // Encode the claim number for URL safety
  const encoded = encodeURIComponent(normalizeClaimNumber(claimNumber));
  return `https://snapsheetvice.com/claims/${encoded}`;
}

/**
 * Attempt to resolve a Snapsheet claim via API lookup.
 * Returns the handler name and claim URL if found.
 *
 * This is the Option 3 hybrid: API lookup first, caller-stated as fallback.
 */
export async function resolveClaimFromSnapsheet(
  claimNumber: string,
  apiKey: string,
  apiSecret: string
): Promise<{ handlerName: string | null; claimUrl: string | null; found: boolean }> {
  const baseUrl = process.env.SNAPSHEET_BASE_URL || "https://snapsheetvice.com";

  try {
    // Basic Auth with key:secret
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    // Try the most likely Snapsheet API endpoint patterns
    const endpoints = [
      `/api/v1/claims?claim_number=${encodeURIComponent(claimNumber)}`,
      `/api/v1/claims/${encodeURIComponent(claimNumber)}`,
      `/api/claims?number=${encodeURIComponent(claimNumber)}`,
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        // Extract handler name from common Snapsheet response shapes
        const handler =
          (data as { assigned_to?: { name?: string } }).assigned_to?.name ||
          (data as { handler?: string }).handler ||
          (data as { adjuster?: string }).adjuster ||
          (data as { data?: { assigned_to?: { name?: string } } }).data?.assigned_to?.name ||
          null;

        const claimUrl = buildSnapsheetClaimUrl(claimNumber);
        return { handlerName: handler, claimUrl, found: true };
      }
    }

    // API didn't return a match — return URL stub for manual lookup
    return {
      handlerName: null,
      claimUrl: buildSnapsheetClaimUrl(claimNumber),
      found: false,
    };
  } catch (err) {
    console.warn("[Snapsheet] Claim lookup failed:", err);
    return {
      handlerName: null,
      claimUrl: buildSnapsheetClaimUrl(claimNumber),
      found: false,
    };
  }
}
