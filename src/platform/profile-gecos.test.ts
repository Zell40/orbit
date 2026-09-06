import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchProfileGecos } from './profile-gecos';

describe('fetchProfileGecos', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('uses the /app/ endpoint when it returns GECOS', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/app/accounts/api/profile_gecos/')) {
        return { ok: true, json: async () => ({ ok: true, realname: '40 - Homme - Paris' }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetch);
    await expect(fetchProfileGecos('Jessie')).resolves.toBe('40 - Homme - Paris');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toContain('/app/accounts/api/profile_gecos/');
    expect(String(fetch.mock.calls[0]![0])).toContain('account=Jessie');
  });

  it('falls back to /accounts/api/ when /app/ has no profile', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/app/accounts/api/profile_gecos/')) {
        return { ok: true, json: async () => ({ ok: true, realname: null, exists: false }) };
      }
      return { ok: true, json: async () => ({ ok: true, realname: '41 - Femme - Lyon' }) };
    });
    vi.stubGlobal('fetch', fetch);
    await expect(fetchProfileGecos('Jessie')).resolves.toBe('41 - Femme - Lyon');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns undefined when neither path has GECOS', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, realname: null }),
    })));
    await expect(fetchProfileGecos('Jessie')).resolves.toBeUndefined();
  });
});
