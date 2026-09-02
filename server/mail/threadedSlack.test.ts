import { describe, expect, it } from 'vitest';
import { buildThreadReplyFileCandidate } from './jobs.js';

describe('Claims Mail thread attachment discovery', () => {
  it('carries a root reviewed marker to every reply document and retains the reply timestamp', () => {
    const candidate = buildThreadReplyFileCandidate(
      { ts: '1720000000.000001', reactions: [{ name: 'white_check_mark' }] },
      { ts: '1720000010.000002', files: [{ id: 'F_THREAD_001', name: 'estimate.pdf' }] },
      { id: 'F_THREAD_001', name: 'estimate.pdf', mimetype: 'application/pdf' },
      'C07R60KAC2C',
    );

    expect(candidate.id).toBe('F_THREAD_001');
    expect(candidate.__mailroomMessageTs).toBe('1720000010.000002');
    expect(candidate.__mailroomRootReactions).toEqual([{ name: 'white_check_mark' }]);
    expect(candidate.shares.public.C07R60KAC2C[0].ts).toBe('1720000010.000002');
  });

  it('preserves a reply’s own reactions when the original post has none', () => {
    const candidate = buildThreadReplyFileCandidate(
      { ts: '1720000000.000001' },
      { ts: '1720000010.000002', reactions: [{ name: 'eyes' }] },
      { id: 'F_THREAD_002', name: 'photos.zip' },
      'C07R60KAC2C',
    );

    expect(candidate.__mailroomRootReactions).toEqual([]);
    expect(candidate.__mailroomReplyReactions).toEqual([{ name: 'eyes' }]);
  });
});
