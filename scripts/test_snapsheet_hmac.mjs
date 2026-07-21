import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHmac, createHash } from 'crypto';

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

const apiKey = process.env.SNAPSHEET_API_KEY ?? '';
const apiSecret = process.env.SNAPSHEET_API_SECRET ?? '';
const base = 'https://snapsheetvice.com';

console.log('Key:', apiKey, '| Secret:', apiSecret.slice(0, 6) + '...');

/**
 * Build HMAC-signed headers for Snapsheet API.
 * Common HMAC patterns:
 *   signature = HMAC-SHA256(secret, method + "\n" + path + "\n" + timestamp)
 *   or: HMAC-SHA256(secret, timestamp + apiKey + body_hash)
 */
function buildHmacHeaders(method, path, body = '') {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Date.now().toString();
  const bodyHash = createHash('md5').update(body).digest('hex');
  const bodyHashSha = createHash('sha256').update(body).digest('hex');

  // Pattern 1: method + \n + path + \n + timestamp
  const msg1 = `${method}\n${path}\n${timestamp}`;
  const sig1 = createHmac('sha256', apiSecret).update(msg1).digest('hex');

  // Pattern 2: timestamp + apiKey + bodyHash
  const msg2 = `${timestamp}${apiKey}${bodyHash}`;
  const sig2 = createHmac('sha256', apiSecret).update(msg2).digest('hex');

  // Pattern 3: apiKey + timestamp + path
  const msg3 = `${apiKey}${timestamp}${path}`;
  const sig3 = createHmac('sha256', apiSecret).update(msg3).digest('hex');

  // Pattern 4: base64 of HMAC(key + timestamp)
  const msg4 = `${apiKey}:${timestamp}`;
  const sig4 = createHmac('sha256', apiSecret).update(msg4).digest('base64');

  return { timestamp, nonce, bodyHash, bodyHashSha, sig1, sig2, sig3, sig4 };
}

const testPath = '/api/v1/claims?per_page=1';
const { timestamp, sig1, sig2, sig3, sig4 } = buildHmacHeaders('GET', testPath);

const hmacVariants = [
  {
    name: 'HMAC-1: X-Api-Key + X-Api-Signature (method+path+ts)',
    headers: {
      'X-Api-Key': apiKey,
      'X-Api-Signature': sig1,
      'X-Api-Timestamp': timestamp,
    },
  },
  {
    name: 'HMAC-2: Authorization: HMAC key:sig1',
    headers: {
      Authorization: `HMAC ${apiKey}:${sig1}`,
      'X-Timestamp': timestamp,
    },
  },
  {
    name: 'HMAC-3: Authorization: key:sig2 (ts+key+bodyHash)',
    headers: {
      Authorization: `${apiKey}:${sig2}`,
      'X-Timestamp': timestamp,
    },
  },
  {
    name: 'HMAC-4: X-Auth-Key + X-Auth-Signature',
    headers: {
      'X-Auth-Key': apiKey,
      'X-Auth-Signature': sig1,
      'X-Auth-Timestamp': timestamp,
    },
  },
  {
    name: 'HMAC-5: Authorization: HMAC key:sig4 (base64)',
    headers: {
      Authorization: `HMAC ${apiKey}:${sig4}`,
      'X-Timestamp': timestamp,
    },
  },
  {
    name: 'HMAC-6: X-Api-Key + X-Signature (key+ts+path)',
    headers: {
      'X-Api-Key': apiKey,
      'X-Signature': sig3,
      'X-Timestamp': timestamp,
    },
  },
  {
    name: 'HMAC-7: Authorization: Signature keyId=key,signature=sig1',
    headers: {
      Authorization: `Signature keyId="${apiKey}",algorithm="hmac-sha256",signature="${sig1}"`,
      'X-Date': timestamp,
    },
  },
];

for (const variant of hmacVariants) {
  try {
    const r = await fetch(`${base}${testPath}`, {
      headers: { Accept: 'application/json', ...variant.headers },
    });
    const text = await r.text();
    console.log(`\n[${variant.name}] → ${r.status}`);
    console.log(text.slice(0, 200));
    if (r.status !== 401) {
      console.log('🎉 SUCCESS! Headers:', JSON.stringify(variant.headers, null, 2));
    }
  } catch (err) {
    console.log(`[${variant.name}] → ERROR:`, err.message);
  }
}
