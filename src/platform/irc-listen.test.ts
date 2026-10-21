import { describe, it, expect, vi, afterEach } from 'vitest';
import { refreshIrcListenCookie, withListenQuery } from './irc-listen';

describe('refreshIrcListenCookie', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('calls chat_listen with the account before any age fallback', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true, json: async () => ({ ok: true, listen: 'reg' }),
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(refreshIrcListenCookie({ account: 'Zell', realname: '40 - Homme - BENQUET' })).resolves.toBe('reg');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe(
      '/accounts/api/chat_listen/?account=Zell&age=40',
    );
    expect(fetch.mock.calls[0]![1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('uses guest GECOS age when there is no account', async () => {
    const fetch = vi.fn(async (_url: string) => ({
      ok: true, json: async () => ({ ok: true, listen: 'reg' }),
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(refreshIrcListenCookie({ realname: '40 - Homme - Paris' })).resolves.toBe('reg');
    expect(String(fetch.mock.calls[0]![0])).toBe('/accounts/api/chat_listen/?age=40');
  });

  it('falls back to /app/accounts/api/chat_listen/ when the first path fails', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (String(url).startsWith('/accounts/api/')) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ ok: true, listen: 'cp' }) };
    });
    vi.stubGlobal('fetch', fetch);
    await expect(refreshIrcListenCookie({ age: 15 })).resolves.toBe('cp');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]![0])).toBe('/app/accounts/api/chat_listen/?age=15');
  });

  it('no-ops without account or age', async () => {
    const fetch = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetch);
    await refreshIrcListenCookie({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('swallows network errors so connect still proceeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => { throw new Error('offline'); }));
    await expect(refreshIrcListenCookie({ account: 'Zell' })).resolves.toBeNull();
  });

  it('pins listen on the websocket URL without dropping an existing query', () => {
    expect(withListenQuery('https://irc.entrenous.chat/', 'reg'))
      .toBe('https://irc.entrenous.chat/?listen=reg');
    expect(withListenQuery('https://irc.entrenous.chat/?listen=cp', 'reg'))
      .toBe('https://irc.entrenous.chat/?listen=reg');
    expect(withListenQuery('wss://irc.entrenous.chat/ws?x=1', 'cp'))
      .toBe('wss://irc.entrenous.chat/ws?x=1&listen=cp');
  });
});
