/**
 * Transcribe all closed records with real audio and re-route them.
 * Uses manus-speech-to-text CLI + LLM extraction + routing rules.
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import { execSync } from 'child_process';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Load sweep results
const sweepResults = JSON.parse(fs.readFileSync('/tmp/sweep-results.json', 'utf8'));
const records = sweepResults.withRealAudio;

console.log(`Processing ${records.length} records with real audio...\n`);

// Handler routing rules (same as server/aircall.ts)
const HANDLERS = {
  madeline:  { id: 30004, name: 'Madeline Green' },
  jayla:     { id: 30006, name: 'Jayla Bernard' },
  demily:    { id: 30005, name: 'Demily Flores' },
  carlito:   { id: 30007, name: 'Carlito Legarde Jr' },
  lorraine:  { id: 30002, name: 'Lorraine Tria' },
  jovel:     { id: 30003, name: 'Jovel Villa' },
  natashia:  { id: 30001, name: 'Natashia Edulan' },
  annie:     { id: 30008, name: 'Annie Ortiz' },
  mj:        { id: 30009, name: 'MJ Ramirez' },
  daryl:     { id: 30010, name: 'Daryl Santos' },
};

const FIRST_PARTY = [HANDLERS.lorraine, HANDLERS.jovel, HANDLERS.natashia, HANDLERS.annie];
let fpIndex = 0;
const TRIAGE = [HANDLERS.mj, HANDLERS.daryl];
let triageIndex = 0;

function resolveHandler(transcript, callerType) {
  const t = transcript.toLowerCase();
  
  // Specific handler name mentioned
  if (t.includes('jovel') || t.includes('jobs')) return HANDLERS.jovel;
  if (t.includes('lorraine') || t.includes('raine')) return HANDLERS.lorraine;
  if (t.includes('natashia') || t.includes('natasha')) return HANDLERS.natashia;
  if (t.includes('annie')) return HANDLERS.annie;
  if (t.includes('madeline')) return HANDLERS.madeline;
  if (t.includes('jayla')) return HANDLERS.jayla;
  if (t.includes('carlito')) return HANDLERS.carlito;
  if (t.includes('demily')) return HANDLERS.demily;
  
  // Subro / demand / payment / settlement → Madeline
  if (t.match(/subrogat|demand letter|payment|settlement|subro/)) return HANDLERS.madeline;
  
  // PIP / BI / bodily injury / lawsuit → Jayla
  if (t.match(/\bpip\b|bodily injury|\bbi\b|personal injury|lawsuit|litigation|attorney|law office|legal/)) return HANDLERS.jayla;
  
  // Total loss → Demily
  if (t.match(/total loss|totaled|salvage|constructive total/)) return HANDLERS.demily;
  
  // PD / 3rd party → Carlito
  if (t.match(/property damage|\bpd\b|third.party|3rd.party|claimant vehicle|other vehicle/)) return HANDLERS.carlito;
  
  // Active repairs / claim status / estimate → First Party round-robin
  if (t.match(/repair|body shop|estimate|claim status|supplement|rental|tow|storage|active claim/)) {
    const h = FIRST_PARTY[fpIndex % FIRST_PARTY.length];
    fpIndex++;
    return h;
  }
  
  // Carrier type with no keywords → First Party
  if (callerType === 'carrier' || callerType === 'member') {
    const h = FIRST_PARTY[fpIndex % FIRST_PARTY.length];
    fpIndex++;
    return h;
  }
  
  // Law office / medical → Jayla
  if (callerType === 'law_office' || callerType === 'medical_provider') return HANDLERS.jayla;
  
  // Unknown → Triage
  const h = TRIAGE[triageIndex % TRIAGE.length];
  triageIndex++;
  return h;
}

// LLM extraction via Forge API
async function extractFromTranscript(transcript) {
  const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
  const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
  
  const prompt = `Extract caller information from this voicemail transcript. Return JSON only.

Transcript:
${transcript}

Return this exact JSON structure (use null for missing fields):
{
  "callerName": "first and last name of the person calling",
  "callerOrg": "company or organization name",
  "callerType": "one of: carrier, law_office, medical_provider, member, claimant, police, unknown",
  "callbackPhone": "phone number to call back (digits only, with country code)",
  "callbackEmail": "email address if mentioned",
  "whipClaimNumber": "Whip claim number if mentioned (format: XX-NNNN-NNNNNN-NNNNNN or similar)",
  "callerRefNumber": "their own claim or reference number",
  "message": "2-3 sentence summary of why they called and what action is needed"
}`;

  try {
    const res = await fetch(`${FORGE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FORGE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

let processed = 0;
let skipped = 0;
let errors = 0;

for (const record of records) {
  try {
    const audioPath = record.audioPath;
    
    if (!fs.existsSync(audioPath)) {
      console.log(`SKIP ${record.aircallCallId}: audio file not found`);
      skipped++;
      continue;
    }
    
    // Transcribe
    let transcript = '';
    try {
      const txtPath = audioPath.replace('.mp3', '_transcript.txt');
      execSync(`manus-speech-to-text ${audioPath} 2>/dev/null`, { timeout: 60000 });
      // Find the generated transcript file
      const files = fs.readdirSync('/tmp').filter(f => f.startsWith(`sweep-vm-${record.aircallCallId}`) && f.endsWith('.txt'));
      if (files.length > 0) {
        transcript = fs.readFileSync(`/tmp/${files[0]}`, 'utf8').trim();
      }
    } catch (err) {
      // Try reading any existing transcript file
      const files = fs.readdirSync('/tmp').filter(f => f.startsWith(`sweep-vm-${record.aircallCallId}`) && f.endsWith('.txt'));
      if (files.length > 0) {
        transcript = fs.readFileSync(`/tmp/${files[0]}`, 'utf8').trim();
      }
    }
    
    if (!transcript) {
      console.log(`SKIP ${record.aircallCallId}: transcription failed`);
      skipped++;
      continue;
    }
    
    // Check for spam
    const tLower = transcript.toLowerCase();
    const isSpam = tLower.match(/fema\.gov|irs\.gov|social security|medicare benefit|car warranty|amazon.*account|press 1 to speak|this is a final notice/);
    if (isSpam) {
      console.log(`SPAM ${record.aircallCallId}: keeping closed`);
      skipped++;
      continue;
    }
    
    // Extract caller info
    const extracted = await extractFromTranscript(transcript);
    if (!extracted) {
      console.log(`ERROR ${record.aircallCallId}: LLM extraction failed`);
      errors++;
      continue;
    }
    
    // Determine handler
    const handler = resolveHandler(transcript, extracted.callerType ?? 'unknown');
    
    // Update the record: re-open it with full data
    await conn.query(`
      UPDATE intake_records SET
        status = 'open',
        callerName = ?,
        callerOrg = ?,
        callerType = ?,
        callbackPhone = ?,
        callbackEmail = ?,
        callerRefNumber = ?,
        whipClaimNumber = ?,
        message = ?,
        rawTranscript = ?,
        handlerId = ?,
        handlerName = ?,
        notes = NULL
      WHERE id = ?
    `, [
      extracted.callerName ?? null,
      extracted.callerOrg ?? null,
      extracted.callerType ?? 'unknown',
      extracted.callbackPhone ?? record.callerPhone,
      extracted.callbackEmail ?? null,
      extracted.callerRefNumber ?? null,
      extracted.whipClaimNumber ?? null,
      extracted.message ?? null,
      transcript,
      handler.id,
      handler.name,
      record.id
    ]);
    
    console.log(`✓ ${record.aircallCallId} | ${extracted.callerName ?? '?'} (${extracted.callerOrg ?? '?'}) → ${handler.name}`);
    processed++;
    
    // Small delay to avoid LLM rate limits
    await new Promise(r => setTimeout(r, 200));
    
  } catch (err) {
    console.error(`ERROR ${record.aircallCallId}:`, err.message);
    errors++;
  }
}

await conn.end();

console.log(`\n=== DONE ===`);
console.log(`Processed (re-opened): ${processed}`);
console.log(`Skipped (spam/no transcript): ${skipped}`);
console.log(`Errors: ${errors}`);
