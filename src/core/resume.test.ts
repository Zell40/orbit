import { describe, it, expect, vi, afterEach } from 'vitest';
import { mintChatResume } from './resume';

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
