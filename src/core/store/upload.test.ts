import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeUpload } from './upload';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

function fakeClient() {
  const calls: [string, unknown[]][] = [];
  const rec = (n: string) => (...a: unknown[]) => { calls.push([n, a]); };
  return { send: rec('send'), action: rec('action'), ircv3: { hasCap: () => false }, calls };
}

function setup() {
  const client = fakeClient();
  const state = { active: '#x', nick: 'me', client };
  const added: { name: string }[] = [];
  const lines: { name: string; text: string }[] = [];
  const get = () => state as unknown as ChatState;
  const filehost = { resolve: null as ((t: string) => void) | null, reject: null as ((e: Error) => void) | null, timer: null as ReturnType<typeof setTimeout> | null };
  const helpers = {
    addMessage: (name: string) => { added.push({ name }); },
    sysLine: (name: string, text: string) => { lines.push({ name, text }); },
  } as unknown as StoreHelpers;
  const { uploadImage, uploadAudio } = makeUpload({ get, filehost, helpers } as Parameters<typeof makeUpload>[0]);
  return { uploadImage, uploadAudio, client, added, lines, filehost };
}

const okJson = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

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
    expect(client.calls).toEqual([['send', ['FILEHOST']]]); // token requested synchronously
    filehost.resolve!('tok123'); // messaging handler would do this on the service NOTICE
    await p;
    const action = client.calls.find(([n]) => n === 'action');
    expect(String(action![1][1])).toContain('https://h/files/x.png');
    const posted = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(posted).toMatch(/\/upload\?token=tok123$/);
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
});
