import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchProfileGecos } from './profile-gecos';

describe('fetchProfileGecos', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('reads the public WordPress profile before any PHP proxy', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (String(url).includes('wp-json/entrenous/v1/profile')) {
        return { ok: true, json: async () => ({ exists: true, age: 40, sexe: ['Homme'], ville: 'Paris' }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetch);
    await expect(fetchProfileGecos('Jessie')).resolves.toBe('40 - Homme - Paris');
    expect(String(fetch.mock.calls[0]![0])).toContain('wp-json/entrenous/v1/profile');
    expect(String(fetch.mock.calls[0]![0])).toContain('account=Jessie');
  });

  it('falls back to the same-origin proxy when WP is unreachable', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (String(url).includes('wp-json')) throw new Error('cors');
      if (String(url).includes('/accounts/api/profile_gecos/')) {
        return { ok: true, json: async () => ({ ok: true, realname: '41 - Femme - Lyon' }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetch);
    await expect(fetchProfileGecos('OtherNick')).resolves.toBe('41 - Femme - Lyon');
  });

  it('returns undefined when no source has GECOS', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ exists: false, realname: null }),
    })));
    await expect(fetchProfileGecos('Nobody')).resolves.toBeUndefined();
  });
});
