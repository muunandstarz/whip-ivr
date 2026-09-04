import { afterEach, describe, expect, it, vi } from 'vitest';
import { markAssignedMailSource } from './sourceMarking.js';

describe('markAssignedMailSource', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the configured review marker to a Claims Mail Slack source and records it as handled', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[{ slack_bot_token: 'xoxb-test-token' }]])
      .mockResolvedValueOnce([[{ value: 'eyes' }]])
      .mockResolvedValueOnce([[]]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ ok: true }),
    } as Response);

    const result = await markAssignedMailSource({ execute } as any, {
      id: 445,
      source: 'mail',
      externalId: 'F012345',
      slackChannelId: 'C07R60KAC2C',
      slackMessageTs: '1725460000.000100',
    });

    expect(result).toEqual({ gmailMarkedRead: 0, slackChecked: 1, skipped: 0, errors: [] });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://slack.com/api/reactions.add',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      channel: 'C07R60KAC2C', timestamp: '1725460000.000100', name: 'eyes',
    });
    expect(execute).toHaveBeenLastCalledWith(
      'UPDATE mail_items SET source_handled_at=NOW(), slack_message_ts=? WHERE id=?',
      ['1725460000.000100', 445],
    );
  });
});
