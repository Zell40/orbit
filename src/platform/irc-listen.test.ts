import { describe, it, expect, vi, afterEach } from 'vitest';
import { refreshIrcListenCookie } from './irc-listen';

describe('refreshIrcListenCookie', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('calls chat_listen with the account before any age fallback', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, listen: 'reg' }) }));
    vi.stubGlobal('fetch', fetch);
    await refreshIrcListenCookie({ account: 'Zell', realname: '40 - Homme - BENQUET' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe(
      '/accounts/api/chat_listen/?account=Zell&age=40',
    );
    expect(fetch.mock.calls[0]![1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('uses guest GECOS age when there is no account', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, listen: 'reg' }) }));
    vi.stubGlobal('fetch', fetch);
    await refreshIrcListenCookie({ realname: '40 - Homme - Paris' });
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
    await refreshIrcListenCookie({ age: 15 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]![0])).toBe('/app/accounts/api/chat_listen/?age=15');
  });

  it('no-ops without account or age', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await refreshIrcListenCookie({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('swallows network errors so connect still proceeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(refreshIrcListenCookie({ account: 'Zell' })).resolves.toBeUndefined();
  });
});
