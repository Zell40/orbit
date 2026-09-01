import { describe, it, expect } from 'vitest';
import { forgetHistoryPrefetch, prefetchLatestHistory } from './history-prefetch';

function fake(cap: boolean) {
  const latest: string[] = [];
  const get = () => ({
    client: {
      ircv3: {
        hasCap: (c: string) => cap && c === 'draft/chathistory',
        chathistoryLatest: (t: string) => latest.push(t),
      },
    },
  });
  return { get, latest };
}

describe('prefetchLatestHistory', () => {
  it('no-ops until draft/chathistory is ACK’d, then sends once', () => {
    const asked = new Set<string>();
    const off = fake(false);
    expect(prefetchLatestHistory(off.get, asked, '#EntreNous.chat')).toBe(false);
    expect(off.latest).toEqual([]);
    expect(asked.size).toBe(0);

    const on = fake(true);
    expect(prefetchLatestHistory(on.get, asked, '#EntreNous.chat')).toBe(true);
    expect(prefetchLatestHistory(on.get, asked, '#entrenous.chat')).toBe(false);
    expect(on.latest).toEqual(['#EntreNous.chat']);
  });

  it('sends again after forgetHistoryPrefetch', () => {
    const asked = new Set<string>();
    const { get, latest } = fake(true);
    prefetchLatestHistory(get, asked, '#x');
    forgetHistoryPrefetch(asked, '#x');
    prefetchLatestHistory(get, asked, '#x');
    expect(latest).toEqual(['#x', '#x']);
  });

  it('marks the active salon as urgent', () => {
    const asked = new Set<string>();
    const latest: { t: string; urgent?: boolean }[] = [];
    const get = () => ({
      active: '#entrenous.chat',
      client: {
        ircv3: {
          hasCap: (c: string) => c === 'draft/chathistory',
          chathistoryLatest: (t: string, _n?: number, opts?: { urgent?: boolean }) => {
            latest.push({ t, urgent: opts?.urgent });
          },
        },
      },
    });
    prefetchLatestHistory(get, asked, '#EntreNous.chat');
    expect(latest).toEqual([{ t: '#EntreNous.chat', urgent: true }]);
  });
});
