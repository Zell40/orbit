import { describe, it, expect } from 'vitest';
import { forgetHistoryPrefetch, prefetchLatestHistory } from './history-prefetch';

function fake(cap: boolean, over: {
  prefs?: { historyOnReconnect?: boolean };
  buffers?: Record<string, { messages?: unknown[] }>;
  active?: string;
} = {}) {
  const latest: string[] = [];
  const get = () => ({
    active: over.active,
    prefs: over.prefs ?? { historyOnReconnect: false },
    buffers: over.buffers ?? {},
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
      prefs: { historyOnReconnect: false },
      buffers: {},
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

  it('skips CHATHISTORY when the buffer already has messages and historyOnReconnect is off', () => {
    const asked = new Set<string>();
    const { get, latest } = fake(true, {
      prefs: { historyOnReconnect: false },
      buffers: { '#x': { messages: [{ id: '1' }] } },
    });
    expect(prefetchLatestHistory(get, asked, '#x')).toBe(false);
    expect(latest).toEqual([]);
    expect(asked.has('#x')).toBe(true);
  });

  it('fetches when the buffer already has messages but historyOnReconnect is on', () => {
    const asked = new Set<string>();
    const { get, latest } = fake(true, {
      prefs: { historyOnReconnect: true },
      buffers: { '#x': { messages: [{ id: '1' }] } },
    });
    expect(prefetchLatestHistory(get, asked, '#x')).toBe(true);
    expect(latest).toEqual(['#x']);
  });

  it('fetches when the buffer is empty even if historyOnReconnect is off', () => {
    const asked = new Set<string>();
    const { get, latest } = fake(true, {
      prefs: { historyOnReconnect: false },
      buffers: { '#x': { messages: [] } },
    });
    expect(prefetchLatestHistory(get, asked, '#x')).toBe(true);
    expect(latest).toEqual(['#x']);
  });
});
