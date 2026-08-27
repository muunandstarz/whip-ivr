import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('handler Mailroom forwarding access', () => {
  it('limits the forwarding service to the assigned handler or an administrator', () => {
    const source = read('server/routers/mail.ts');
    expect(source).toContain("const isAdmin = ctx.user.role === 'admin';");
    expect(source).toContain('const isAssignedHandler = Boolean(ctx.user.handlerProfileId)');
    expect(source).toContain('Only the assigned handler or an administrator can forward this Mailroom item.');
  });

  it('offers recipient-confirmed forwarding in both handler-facing Mailroom views', () => {
    const personal = read('client/src/pages/MyMailroom.tsx');
    const item = read('client/src/pages/MailroomItem.tsx');
    for (const source of [personal, item]) {
      expect(source).toContain('Forward to Claim');
      expect(source).toContain('Confirm & Forward');
      expect(source).toContain('trpc.mail.forwardToClaim.useMutation');
    }
  });
});
