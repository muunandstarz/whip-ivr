import { afterEach, describe, expect, it, vi } from 'vitest';
import { postMailBotReassignment } from './mailBot.js';

describe('postMailBotReassignment', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts a canonical Slack user mention for a valid agent user ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, ts: '1.2' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await postMailBotReassignment({
      token: 'test-token',
      hubChannelId: 'C08RUM83RS5',
      fileName: 'claim-mail.pdf',
      mailType: 'General / Other',
      sourceChannelId: 'C07R60KAC2C',
      sourceMessageTs: '1786460492.904929',
      assigneeName: 'Ana Padilla',
      assigneeSlackId: 'U091NDYN0E6',
      reason: 'Corrected routing',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.blocks[0].text.text).toContain('<@U091NDYN0E6>');
    expect(body.blocks[0].text.text).not.toContain('|Ana Padilla');
  });

  it('rejects a Slack DM/channel ID instead of emitting an untagged assignment', async () => {
    await expect(postMailBotReassignment({
      token: 'test-token',
      hubChannelId: 'C08RUM83RS5',
      fileName: 'claim-mail.pdf',
      mailType: 'General / Other',
      sourceChannelId: 'C07R60KAC2C',
      sourceMessageTs: '1786460492.904929',
      assigneeName: 'Ana Padilla',
      assigneeSlackId: 'D0AGQR5GUNP',
    })).rejects.toThrow('does not contain a Slack user ID');
  });
});
