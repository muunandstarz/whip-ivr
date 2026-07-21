import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually
const envPath = resolve(process.cwd(), '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const key = process.env.SNAPSHEET_API_KEY ?? '';
const secret = process.env.SNAPSHEET_API_SECRET ?? '';
console.log('Key length:', key.length, 'Secret length:', secret.length);

const creds = Buffer.from(`${key}:${secret}`).toString('base64');
const base = 'https://snapsheetvice.com';

// Test endpoints
const endpoints = [
  '/api/v1/claims?per_page=1',
  '/api/v1/claims',
  '/api/v1/claim_files?per_page=1',
  '/api/v1/vehicles?per_page=1',
];

// Try secret as Bearer (maybe secret is the actual token)
const secretCreds = Buffer.from(`${secret}:`).toString('base64');
const keyCreds = Buffer.from(`${key}:`).toString('base64');

const authFormats = [
  // Maybe secret IS the bearer token
  { name: 'Bearer secret', headers: { Authorization: `Bearer ${secret}` } },
  // Maybe key is username and secret is password with Basic
  { name: 'Basic key:secret (correct)', headers: { Authorization: `Basic ${Buffer.from(key + ':' + secret).toString('base64')}` } },
  // Maybe secret is the API key and key is the username
  { name: 'X-Api-Key secret', headers: { 'X-Api-Key': secret } },
  // Snapsheet may use a specific header name
  { name: 'X-Snapsheet-Key key', headers: { 'X-Snapsheet-Key': key } },
  { name: 'X-Snapsheet-Api-Key key', headers: { 'X-Snapsheet-Api-Key': key } },
  // Try with both as query params in correct order
  { name: 'api_key=secret query', url_suffix: `&api_key=${secret}` },
  // Try secret only as Basic
  { name: 'Basic secret only', headers: { Authorization: `Basic ${secretCreds}` } },
  // Try key only as Basic (key:)
  { name: 'Basic key: (no secret)', headers: { Authorization: `Basic ${keyCreds}` } },
];

const testEp = '/api/v1/claims?per_page=1';
for (const auth of authFormats) {
  try {
    const url = `${base}${testEp}${auth.url_suffix ?? ''}`;
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...auth.headers,
      },
    });
    const text = await r.text();
    console.log(`\n[${auth.name}] → ${r.status}`);
    console.log(text.slice(0, 200));
  } catch (err) {
    console.log(`[${auth.name}] → ERROR:`, err.message);
  }
}
