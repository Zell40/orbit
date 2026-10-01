import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeUpload, hostedFileName, uploadTtlChoices, filehostTokenFresh, extractFilehostToken } from './upload';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

function dummyJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

function fakeClient() {
  const calls: [string, unknown[]][] = [];
  const rec = (n: string) => (...a: unknown[]) => { calls.push([n, a]); };
  return { send: rec('send'), sendNow: rec('sendNow'), action: rec('action'), ircv3: { hasCap: () => false }, calls };
}

function setup() {
  const client = fakeClient();
  const state = { active: '#x', nick: 'me', client };
  const added: { name: string }[] = [];
  const lines: { name: string; text: string }[] = [];
  const get = () => state as unknown as ChatState;
  const filehost = {
    resolve: null as ((t: string) => void) | null,
    reject: null as ((e: Error) => void) | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    lateToken: null as string | null,
    lateAt: 0,
    awaitingLate: false,
  };
  const helpers = {
    addMessage: (name: string) => { added.push({ name }); },
    sysLine: (name: string, text: string) => { lines.push({ name, text }); },
  } as unknown as StoreHelpers;
  const { uploadImage, uploadAudio, deleteHostedFile } = makeUpload({ get, filehost, helpers } as Parameters<typeof makeUpload>[0]);
  return { uploadImage, uploadAudio, deleteHostedFile, client, added, lines, filehost };
}

const okJson = (body: unknown, status = 200) =>
  vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('upload', () => {
  it('rejects a non-image without asking for a token', async () => {
    const { uploadImage, client, lines } = setup();
    await uploadImage(new File(['x'], 'doc.txt', { type: 'text/plain' }));
    expect(client.calls).toHaveLength(0);
    expect(lines.some((l) => l.text.includes('⚠️'))).toBe(true);
  });

  it('uploads an image: requests a FILEHOST token, POSTs, shares the URL as an action', async () => {
    const { uploadImage, client, filehost } = setup();
    const fetchMock = okJson({ url: 'https://h/files/x.png' });
    vi.stubGlobal('fetch', fetchMock);
    const p = uploadImage(new File(['img'], 'pic.png', { type: 'image/png' }));
    expect(client.calls).toEqual([['sendNow', ['FILEHOST']]]); // token requested immediately, not queued
    filehost.resolve!('tok123'); // messaging handler would do this on the service NOTICE
    await p;
    const action = client.calls.find(([n]) => n === 'action');
    expect(String(action![1][1])).toContain('https://h/files/x.png');
    const posted = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(posted).toMatch(/\/upload\?token=tok123$/);
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('ttl_hours')).toBe('24');
  });

  it('POSTs to /app/upload when the SPA path is under /app', async () => {
    const { uploadImage, filehost } = setup();
    vi.stubGlobal('location', { pathname: '/app/' } as Location);
    const fetchMock = okJson({ url: 'https://h/app/files/x.png' });
    vi.stubGlobal('fetch', fetchMock);
    const p = uploadImage(new File(['img'], 'pic.png', { type: 'image/png' }));
    filehost.resolve!('tok');
    await p;
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/app/upload?token=tok');
  });

  it('surfaces a content-policy rejection as an alert', async () => {
    const { uploadImage, filehost, lines } = setup();
    vi.stubGlobal('fetch', okJson({ detail: 'nsfw_image' }, 422));
    const p = uploadImage(new File(['img'], 'pic.png', { type: 'image/png' }));
    filehost.resolve!('tok');
    await p;
    expect(lines.some((l) => l.text.includes('\x01ALERT\x01'))).toBe(true);
  });

  it('uploads a voice blob through the same flow', async () => {
    const { uploadAudio, client, filehost } = setup();
    vi.stubGlobal('fetch', okJson({ url: 'https://h/files/v.webm' }));
    const p = uploadAudio(new Blob(['audio']), 'webm');
    filehost.resolve!('tok');
    await p;
    expect(client.calls.some(([n, a]) => n === 'action' && String(a[1]).includes('v.webm'))).toBe(true);
  });

  it('offers a 1-month retention choice', () => {
    expect(uploadTtlChoices()).toContain(720);
  });

  it('parses a filehost image url', () => {
    expect(hostedFileName('https://h/files/aabbccddeeff00112233445566778899.png')).toBe('aabbccddeeff00112233445566778899.png');
    expect(hostedFileName('https://h/other/pic.png')).toBeNull();
  });

  it('reuses a FILEHOST token that arrived after a previous timeout', async () => {
    const { uploadImage, client, filehost } = setup();
    const late = dummyJwt({ iss: 'FILEHOST', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
    filehost.lateToken = late;
    filehost.lateAt = Date.now();
    const fetchMock = okJson({ url: 'https://h/files/x.png' });
    vi.stubGlobal('fetch', fetchMock);
    await uploadImage(new File(['img'], 'pic.png', { type: 'image/png' }));
    expect(client.calls.filter(([n]) => n === 'sendNow')).toHaveLength(0);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(encodeURIComponent(late));
  });

  it('ignores a stale late token (bouncer playback) and asks FILEHOST again', async () => {
    const { uploadImage, client, filehost } = setup();
    filehost.lateToken = dummyJwt({ iss: 'FILEHOST', iat: 1_000_000_000, exp: 1_000_003_600 });
    filehost.lateAt = Date.now();
    const fetchMock = okJson({ url: 'https://h/files/x.png' });
    vi.stubGlobal('fetch', fetchMock);
    const p = uploadImage(new File(['img'], 'pic.png', { type: 'image/png' }));
    expect(client.calls.filter(([n]) => n === 'sendNow')).toHaveLength(1);
    filehost.resolve!('fresh');
    await p;
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('fresh');
  });

  it('retries the POST once after 401 invalid_token', async () => {
    const { uploadImage, client, filehost } = setup();
    const fetchMock = vi.fn(async (input?: RequestInfo | URL) => {
      const url = String(input ?? '');
      if (url.includes('bad')) return new Response(JSON.stringify({ detail: 'invalid_token' }), { status: 401 });
      return new Response(JSON.stringify({ url: 'https://h/files/x.png' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const p = uploadImage(new File(['img'], 'pic.png', { type: 'image/png' }));
    filehost.resolve!('bad');
    for (let i = 0; i < 40 && client.calls.filter(([n]) => n === 'sendNow').length < 2; i++) {
      await Promise.resolve();
    }
    expect(client.calls.filter(([n]) => n === 'sendNow')).toHaveLength(2);
    filehost.resolve!('good');
    await p;
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('good');
  });

  it('parses and freshness-checks FILEHOST JWTs', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(extractFilehostToken('FILEHOST https://x/upload?token=aaa.bbb.ccc>')).toBe('aaa.bbb.ccc');
    expect(filehostTokenFresh(dummyJwt({ iss: 'FILEHOST', iat: now, exp: now + 3600 }), now)).toBe(true);
    expect(filehostTokenFresh(dummyJwt({ iss: 'FILEHOST', iat: now - 600, exp: now + 3000 }), now)).toBe(false);
    expect(filehostTokenFresh('not-a-jwt', now)).toBe(false);
  });

  it('retries FILEHOST once after a timeout', async () => {
    const { uploadImage, client, filehost } = setup();
    const fetchMock = okJson({ url: 'https://h/files/x.png' });
    vi.stubGlobal('fetch', fetchMock);
    const p = uploadImage(new File(['img'], 'pic.png', { type: 'image/png' }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(client.calls.filter(([n]) => n === 'sendNow')).toHaveLength(2);
    filehost.resolve!('tok2');
    await p;
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('tok2');
  });

  it('deletes a hosted file with a FILEHOST token', async () => {
    const { deleteHostedFile, client, filehost } = setup();
    const fetchMock = okJson({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const p = deleteHostedFile('https://h/files/aabbccddeeff00112233445566778899.png');
    filehost.resolve!('tokdel');
    await expect(p).resolves.toBe(true);
    expect(client.calls).toEqual([['sendNow', ['FILEHOST']]]);
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('action')).toBe('delete');
    expect(body.get('file')).toBe('aabbccddeeff00112233445566778899.png');
  });
});
