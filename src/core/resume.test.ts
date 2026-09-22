import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  mintChatResume, mintChatResumeResult, mintChatResumeRetry,
  saveSaslResume, loadSaslResume, clearResume,
} from './resume';

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

describe('mintChatResumeResult — why the mint failed', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('reports no_session when the site answers that the cookie is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, error: 'no_session' }),
    })));
    await expect(mintChatResumeResult()).resolves.toEqual({ ok: false, reason: 'no_session' });
  });

  it('reports unreachable when nothing answers (offline / aborted)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(mintChatResumeResult()).resolves.toEqual({ ok: false, reason: 'unreachable' });
  });

  it('treats a 5xx as unreachable, not as a signed-out session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    await expect(mintChatResumeResult()).resolves.toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('mintChatResumeRetry', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('retries an unreachable endpoint and succeeds once the network is back', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls <= 2) throw new TypeError('Failed to fetch'); // two mint URLs, first attempt
      return { ok: true, status: 200, json: async () => ({ ok: true, keycard: 'jwt', nick: 'Jessie' }) };
    }));
    await expect(mintChatResumeRetry({ attempts: 3, gapMs: 1 })).resolves.toEqual({
      ok: true,
      card: { keycard: 'jwt', nick: 'Jessie' },
    });
  });

  it('does not retry once the site has answered that there is no session', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: 'no_session' }),
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(mintChatResumeRetry({ attempts: 3, gapMs: 1 })).resolves
      .toEqual({ ok: false, reason: 'no_session' });
    expect(fetch).toHaveBeenCalledTimes(2); // both paths tried once — final, no second attempt
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
