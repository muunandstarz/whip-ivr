import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('document-upload storage key handoff', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'server/_core/index.ts'),
    'utf8',
  );

  it('returns and signs the collision-safe key returned by storagePut', () => {
    expect(source).toContain('const { url, key: storageKey } = await storagePut(key, buffer, mimetype);');
    expect(source).toContain('const signedUrl = await storageGetSignedUrl(storageKey).catch(() => url);');
    expect(source).toContain('res.json({ url, signedUrl, key: storageKey, filename: originalname, mimetype });');
    expect(source).not.toContain('const signedUrl = await storageGetSignedUrl(key).catch(() => url);');
  });
});
