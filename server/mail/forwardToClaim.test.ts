import { describe, expect, it } from 'vitest';
import { buildForwardMessage } from './forwardToClaim.js';

describe('buildForwardMessage', () => {
  it('preserves original mail context and includes recoverable attachments', () => {
    const message = buildForwardMessage({
      recipient: 'claim.file@example.com',
      item: {
        id: 42,
        source: 'email',
        externalId: 'gmail-42',
        subject: 'Carrier demand',
        bodyText: 'Please review the attached demand.',
        fromName: 'Jane Carrier',
        fromEmail: 'jane@carrier.example',
        claimNumber: 'MD-1234',
      },
      note: 'Please add to the claim file.',
      attachments: [{ filename: 'demand.pdf', contentType: 'application/pdf', bytes: Buffer.from('pdf bytes') }],
    });

    expect(message).toContain('To: claim.file@example.com');
    expect(message).toContain('Subject: FWD: Carrier demand — Claim MD-1234');
    expect(message).toContain('Original sender: Jane Carrier <jane@carrier.example>');
    expect(message).toContain('Forwarding note: Please add to the claim file.');
    expect(message).toContain('filename="demand.pdf"');
    expect(message).toContain(Buffer.from('pdf bytes').toString('base64'));
  });

  it('sanitizes newline characters from headers', () => {
    const message = buildForwardMessage({
      recipient: 'claim.file@example.com',
      item: {
        id: 7,
        source: 'mail',
        externalId: 'slack-7',
        subject: 'Subject\r\nBcc: unexpected@example.com',
        bodyText: null,
        fromName: null,
        fromEmail: null,
        claimNumber: null,
      },
      attachments: [],
    });

    expect(message).toContain('Subject: FWD: Subject Bcc: unexpected@example.com');
    expect(message).not.toContain('\r\nBcc: unexpected@example.com');
  });

  it('does not forward page markers as the source body for Claims Mail faxes', () => {
    const message = buildForwardMessage({
      recipient: 'claim.file@example.com',
      item: {
        id: 8,
        source: 'mail',
        externalId: 'F123',
        subject: 'Claims Mail fax',
        bodyText: '-- 1 of 9 --\n-- 2 of 9 --',
        fromName: null,
        fromEmail: null,
        claimNumber: null,
      },
      attachments: [],
    });

    expect(message).toContain('This correspondence was received through the Claims Mail channel. The original fax/document is attached.');
    expect(message).not.toContain('-- 1 of 9 --');
  });
});
