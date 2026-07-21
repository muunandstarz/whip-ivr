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
    const key2 = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key2]) process.env[key2] = val;
  }
} catch {}

const key = process.env.SNAPSHEET_API_KEY ?? '';
const secret = process.env.SNAPSHEET_API_SECRET ?? '';
const base = 'https://snapsheetvice.com';

console.log('Key:', key, '| Secret:', secret.slice(0, 6) + '...');

// Try token exchange / session auth endpoints
const tokenEndpoints = [
  { url: '/api/v1/auth/token', method: 'POST', body: { api_key: key, api_secret: secret } },
  { url: '/api/v1/auth/token', method: 'POST', body: { key, secret } },
  { url: '/api/v1/sessions', method: 'POST', body: { api_key: key, api_secret: secret } },
  { url: '/api/v1/login', method: 'POST', body: { api_key: key, api_secret: secret } },
  { url: '/api/auth', method: 'POST', body: { api_key: key, api_secret: secret } },
  { url: '/oauth/token', method: 'POST', body: { grant_type: 'client_credentials', client_id: key, client_secret: secret } },
];

for (const ep of tokenEndpoints) {
  try {
    const r = await fetch(`${base}${ep.url}`, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(ep.body),
    });
    const text = await r.text();
    console.log(`\n[POST ${ep.url}] → ${r.status}`);
    console.log(text.slice(0, 300));
  } catch (err) {
    console.log(`[POST ${ep.url}] → ERROR:`, err.message);
  }
}

// Also try GET with the key embedded in the URL path (some APIs use /api/v1/{key}/claims)
const pathEndpoints = [
  `/api/v1/${key}/claims?per_page=1`,
  `/api/${key}/claims?per_page=1`,
];
for (const ep of pathEndpoints) {
  try {
    const r = await fetch(`${base}${ep}`, { headers: { Accept: 'application/json' } });
    const text = await r.text();
    console.log(`\n[GET ${ep}] → ${r.status}`);
    console.log(text.slice(0, 200));
  } catch (err) {
    console.log(`[GET ${ep}] → ERROR:`, err.message);
  }
}
