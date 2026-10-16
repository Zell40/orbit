import { describe, it, expect } from 'vitest';
import { forgetBufferMutePrefetch, prefetchBufferMuted, prefetchJoinedBufferMutes } from './mute-prefetch';

function fake(opts: { account?: string; cap?: boolean } = {}) {
  const muted: string[] = [];
  const get = () => ({
    account: opts.account ?? 'alice',
    order: ['#x', '#y'],
    buffers: {
      '#x': { name: '#x', isChannel: true, joined: true },
      '#y': { name: '#y', isChannel: true, joined: true },
    },
    client: {
      ircv3: {
        fetchBufferMuted: (t: string) => {
          if (opts.cap === false) return false;
          muted.push(t);
          return true;
        },
      },
    },
  });
  return { get, muted };
}

describe('prefetchBufferMuted', () => {
  it('skips guests and sends once per salon', () => {
    const asked = new Set<string>();
    const guest = fake({ account: '' });
    expect(prefetchBufferMuted(guest.get, asked, '#x')).toBe(false);
    expect(guest.muted).toEqual([]);

    const on = fake();
    expect(prefetchBufferMuted(on.get, asked, '#x')).toBe(true);
    expect(prefetchBufferMuted(on.get, asked, '#X')).toBe(false);
    expect(on.muted).toEqual(['#x']);
  });

  it('sends again after forgetBufferMutePrefetch', () => {
    const asked = new Set<string>();
    const { get, muted } = fake();
    prefetchBufferMuted(get, asked, '#x');
    forgetBufferMutePrefetch(asked, '#x');
    prefetchBufferMuted(get, asked, '#x');
    expect(muted).toEqual(['#x', '#x']);
  });

  it('does not mark asked when the GET was not sent (no cap yet)', () => {
    const asked = new Set<string>();
    const off = fake({ cap: false });
    expect(prefetchBufferMuted(off.get, asked, '#x')).toBe(false);
    expect(asked.size).toBe(0);
  });

  it('prefetchJoinedBufferMutes covers every joined salon', () => {
    const asked = new Set<string>();
    const { get, muted } = fake();
    prefetchJoinedBufferMutes(get, asked);
    expect(muted).toEqual(['#x', '#y']);
    prefetchJoinedBufferMutes(get, asked);
    expect(muted).toEqual(['#x', '#y']);
  });
});
