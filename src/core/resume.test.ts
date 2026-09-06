import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mintChatResume, saveSaslResume, loadSaslResume, clearResume } from './resume';

describe('mintChatResume', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('uses the host-root endpoint first (outside the PWA /app/ SW scope)', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (String(url) === '/accounts/api/chat_resume/') {
        return {
          ok: true,
          json: async () => ({ ok: true, keycard: 'jwt', nick: 'Jessie', account: 'Jessie', realname: '40 - Femme - Paris' }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetch);
    await expect(mintChatResume()).resolves.toEqual({
      keycard: 'jwt',
      nick: 'Jessie',
      account: 'Jessie',
      realname: '40 - Femme - Paris',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe('/accounts/api/chat_resume/');
  });

  it('falls back to /app/accounts/api/chat_resume/ when the host-root has no session', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (String(url) === '/accounts/api/chat_resume/') {
        return { ok: true, json: async () => ({ ok: false, error: 'no_session' }) };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, keycard: 'jwt2', nick: 'Jessie' }),
      };
    });
    vi.stubGlobal('fetch', fetch);
    await expect(mintChatResume()).resolves.toEqual({ keycard: 'jwt2', nick: 'Jessie' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when neither path mints a keycard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, error: 'no_session' }),
    })));
    await expect(mintChatResume()).resolves.toBeNull();
  });
});

describe('sasl resume (classic NickServ login)', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    const stub = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    };
    (globalThis as unknown as { sessionStorage: typeof stub }).sessionStorage = stub;
  });
  afterEach(() => {
    delete (globalThis as unknown as { sessionStorage?: unknown }).sessionStorage;
  });

  it('round-trips nick and password in sessionStorage', () => {
    saveSaslResume({ nick: 'Quen', password: 'secret', account: 'Quen' });
    expect(loadSaslResume()).toEqual({ nick: 'Quen', password: 'secret', account: 'Quen' });
  });

  it('is cleared with the rest of the resume state', () => {
    saveSaslResume({ nick: 'Quen', password: 'secret' });
    clearResume();
    expect(loadSaslResume()).toBeNull();
  });
});
