import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAvatar, rememberAvatar } from './avatars';

describe('rememberAvatar', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('keeps the WordPress photo when the batch still has the previous one', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => gate.then(() => ({
      ok: true,
      json: async () => ({ avatars: { photouser: 'https://old.example/a.jpg' } }),
    }))));
    const pending = fetchAvatar('PhotoUser');
    rememberAvatar('PhotoUser', 'https://new.example/b.jpg');
    release();
    await expect(pending).resolves.toBe('https://new.example/b.jpg');
    await expect(fetchAvatar('PhotoUser')).resolves.toBe('https://new.example/b.jpg');
  });
});
