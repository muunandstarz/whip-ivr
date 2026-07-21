import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHmac } from 'crypto';

// Load .env manually
const envPath = resolve(process.cwd(), '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = val;
  }
} catch {}

// The user said: secret NAME = whip_us_api, secret KEY = 966b25c04c9ae6ff38b6
// So the "key" to send is 966b25c04c9ae6ff38b6 and the "secret" for signing is whip_us_api
const apiKey = '966b25c04c9ae6ff38b6';  // the actual auth token
const signingSecret = 'whip_us_api';     // used for HMAC signing

const base = 'https://snapsheetvice.com';
const testPath = '/api/v1/claims?per_page=1';

console.log('Testing with key=966b25... and signing secret=whip_us_api');

const timestamp = Math.floor(Date.now() / 1000).toString();
const sig = createHmac('sha256', signingSecret).update(`GET\n${testPath}\n${timestamp}`).digest('hex');
const sigB64 = createHmac('sha256', signingSecret).update(`GET\n${testPath}\n${timestamp}`).digest('base64');

const variants = [
  // Direct Bearer with the 20-char token
  { name: 'Bearer 966b25...', headers: { Authorization: `Bearer ${apiKey}` } },
  // Basic with 966b25 as username, whip_us_api as password
  { name: 'Basic 966b25:whip_us_api', headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${signingSecret}`).toString('base64')}` } },
  // Basic with whip_us_api as username, 966b25 as password (original order)
  { name: 'Basic whip_us_api:966b25', headers: { Authorization: `Basic ${Buffer.from(`${signingSecret}:${apiKey}`).toString('base64')}` } },
  // X-Api-Key with 966b25 token
  { name: 'X-Api-Key 966b25...', headers: { 'X-Api-Key': apiKey } },
  // HMAC signed with whip_us_api as secret, 966b25 as key
  { name: 'HMAC signed (key=966b25, secret=whip_us_api)', headers: { 'X-Api-Key': apiKey, 'X-Api-Signature': sig, 'X-Api-Timestamp': timestamp } },
  { name: 'HMAC Authorization (key=966b25, secret=whip_us_api)', headers: { Authorization: `HMAC ${apiKey}:${sig}`, 'X-Timestamp': timestamp } },
  // Try different base URLs - maybe it's a subdomain
  { name: 'Bearer on whip.snapsheetvice.com', url: `https://whip.snapsheetvice.com${testPath}`, headers: { Authorization: `Bearer ${apiKey}` } },
  { name: 'Bearer on api.snapsheetvice.com', url: `https://api.snapsheetvice.com${testPath}`, headers: { Authorization: `Bearer ${apiKey}` } },
];

for (const v of variants) {
  try {
    const url = v.url ?? `${base}${testPath}`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json', ...v.headers },
    });
    const text = await r.text();
    console.log(`\n[${v.name}] → ${r.status}`);
    console.log(text.slice(0, 250));
    if (r.status !== 401 && r.status !== 404) {
      console.log('🎉 POSSIBLE SUCCESS!');
    }
  } catch (err) {
    console.log(`[${v.name}] → ERROR:`, err.message);
  }
}
