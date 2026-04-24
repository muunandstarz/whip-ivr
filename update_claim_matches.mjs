/**
 * Update seeded intake records with claim match data
 * Runs the claimMatch logic against all existing records
 * Run: node update_claim_matches.mjs
 */
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

// Get all intake records with claim numbers
const [records] = await conn.execute(
  "SELECT id, whipClaimNumber FROM intake_records WHERE whipClaimNumber IS NOT NULL AND whipClaimNumber != ''"
);

// Get all known claim numbers
const [allRecords] = await conn.execute(
  "SELECT whipClaimNumber FROM intake_records WHERE whipClaimNumber IS NOT NULL AND whipClaimNumber != ''"
);
const knownClaimNumbers = allRecords.map(r => r.whipClaimNumber);

console.log(`Found ${records.length} records with claim numbers`);
console.log(`Known claim numbers pool: ${knownClaimNumbers.length}`);

// Simple claim matching logic (mirrors claimMatch.ts)
function normalizeClaimNumber(raw) {
  return raw.trim().toUpperCase().replace(/\s+/g, "").replace(/-+/g, "-");
}

function extractClaimFragments(claimNumber) {
  const normalized = normalizeClaimNumber(claimNumber);
  const match = normalized.match(/^[A-Z]{2}-\d{4}-(\d{6})-(\d{6})$/);
  if (!match) return null;
  return { vinFragment: match[1], claimFragment: match[2] };
}

function matchClaimNumber(input, knownClaimNumbers) {
  if (!input || input.trim().length < 4) {
    return { matchedClaimNumber: null, matchType: "none", confidence: 0 };
  }

  const normalizedInput = input.trim().toUpperCase().replace(/[\s-]/g, "");

  // 1. Exact full match
  for (const known of knownClaimNumbers) {
    const normalizedKnown = normalizeClaimNumber(known).replace(/-/g, "");
    if (normalizedKnown === normalizedInput || normalizeClaimNumber(known) === normalizeClaimNumber(input)) {
      return { matchedClaimNumber: known, matchType: "exact", confidence: 100 };
    }
  }

  // 2 & 3. Fragment matches
  const fragmentMatches = [];
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
    return { matchedClaimNumber: fragmentMatches[0].claim, matchType: fragmentMatches[0].type, confidence: fragmentMatches[0].confidence };
  }
  if (fragmentMatches.length > 1) {
    return { matchedClaimNumber: fragmentMatches[0].claim, matchType: fragmentMatches[0].type, confidence: 60 };
  }

  // 4. Partial match
  if (normalizedInput.length >= 5) {
    const partialMatches = [];
    for (const known of knownClaimNumbers) {
      const fragments = extractClaimFragments(known);
      if (!fragments) continue;
      const vinMatch = fragments.vinFragment.includes(normalizedInput) || normalizedInput.includes(fragments.vinFragment.substring(0, 5));
      const claimMatch = fragments.claimFragment.includes(normalizedInput) || normalizedInput.includes(fragments.claimFragment.substring(0, 5));
      if (vinMatch || claimMatch) {
        const confidence = Math.min(85, 50 + normalizedInput.length * 5);
        partialMatches.push({ claim: known, confidence });
      }
    }
    if (partialMatches.length === 1) {
      return { matchedClaimNumber: partialMatches[0].claim, matchType: "partial", confidence: partialMatches[0].confidence };
    }
  }

  return { matchedClaimNumber: null, matchType: "none", confidence: 0 };
}

function buildSnapsheetClaimUrl(claimNumber) {
  if (!claimNumber) return null;
  const encoded = encodeURIComponent(normalizeClaimNumber(claimNumber));
  return `https://snapsheetvice.com/claims/${encoded}`;
}

let updated = 0;
for (const record of records) {
  const matchResult = matchClaimNumber(record.whipClaimNumber, knownClaimNumbers);
  const snapsheetUrl = matchResult.matchedClaimNumber 
    ? buildSnapsheetClaimUrl(matchResult.matchedClaimNumber)
    : buildSnapsheetClaimUrl(record.whipClaimNumber);

  await conn.execute(
    "UPDATE intake_records SET claimMatchType = ?, claimMatchConfidence = ?, snapsheetClaimUrl = ? WHERE id = ?",
    [matchResult.matchType, matchResult.confidence, snapsheetUrl, record.id]
  );
  updated++;
  console.log(`  #${record.id}: ${record.whipClaimNumber} → ${matchResult.matchType} (${matchResult.confidence}%)`);
}

await conn.end();
console.log(`\nUpdated ${updated} records with claim match data.`);
