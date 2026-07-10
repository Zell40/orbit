// Image / voice upload — the /FILEHOST flow.
//
// Both uploads share the same shape: ask the ircd for a one-time upload token
// (answered by a services NOTICE, resolved through the shared `filehost` promise
// in the messaging handler), POST the file same-origin, then share the returned
// URL as a CTCP ACTION (+ optimistic echo). Split out of store.ts, with the token
// request / POST / error mapping factored into helpers (they were duplicated
// verbatim between the two).
import i18n from '../i18n';
import { fetchTimeout } from '../../lib/net';
import { SERVER, newId } from './context';
import type { IrcClient } from '../irc/client';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface UploadDeps {
  get: StoreApi<ChatState>['getState'];
  filehost: { resolve: ((token: string) => void) | null; reject: ((err: Error) => void) | null; timer: ReturnType<typeof setTimeout> | null };
  helpers: StoreHelpers;
}

const MAX_BYTES = 16 * 1024 * 1024;

export function makeUpload({ get, filehost, helpers }: UploadDeps) {
  const { addMessage, sysLine } = helpers;

  // Request a one-time FILEHOST token, POST the file, return its public URL.
  async function uploadFile(client: IrcClient, file: File): Promise<string> {
    const token = await new Promise<string>((resolve, reject) => {
      filehost.resolve = resolve; filehost.reject = reject;
      filehost.timer = setTimeout(() => { filehost.resolve = null; filehost.reject = null; reject(new Error('timeout')); }, 10000);
      client.send('FILEHOST');
    });
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetchTimeout(`/upload?token=${encodeURIComponent(token)}`, { method: 'POST', body: fd }, 30000);
    if (!res.ok) {
      let detail = `http_${res.status}`;
      try { const j = await res.json(); if (j?.detail) detail = `${res.status}:${j.detail}`; } catch { /* ignore */ }
      throw new Error(detail);
    }
    const data = await res.json() as { url: string };
    return data.url;
  }

  // Share a caption as a CTCP ACTION (+ optimistic echo if the server won't echo).
  // Bold + italic (reset with \x0F) so the share stands out in the log everywhere.
  function share(client: IrcClient, active: string, caption: string): void {
    const styled = `\x02\x1D${caption}\x0F`;
    client.action(active, styled);
    if (!client.ircv3.hasCap('echo-message')) {
      addMessage(active, { id: newId(), bufferName: active, from: get().nick, text: styled, ts: Date.now(), kind: 'action', self: true });
    }
  }

  // Turn an upload failure into a human line; content-policy hits get an \x01ALERT\x01 card.
  function fail(active: string, e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    const isPolicyHit = msg.includes('nsfw_image') || msg.includes('violent_image')
      || msg.includes('infected') || msg.includes('scanner_unavailable');
    const human = msg === 'not_identified'
      ? i18n.t('system.uploadNeedAccount')
      : msg === 'timeout' ? i18n.t('system.uploadTimeout')
      : msg.includes('scanner_unavailable') ? i18n.t('system.uploadAvDown')
      : msg.includes('nsfw_image') ? i18n.t('system.uploadNsfw')
      : msg.includes('violent_image') ? i18n.t('system.uploadViolent')
      : msg.includes('infected') ? i18n.t('system.uploadInfected')
      : i18n.t('system.uploadFailed', { msg });
    sysLine(active, isPolicyHit ? `\x01ALERT\x01${human}` : `⚠️ ${human}`, 'system');
  }

  async function uploadImage(file: File): Promise<void> {
    const { client, active } = get();
    if (!client || !active || active === SERVER) return;
    if (!file.type.startsWith('image/')) { sysLine(active, `⚠️ ${i18n.t('system.onlyImages')}`, 'system'); return; }
    if (file.size > MAX_BYTES) { sysLine(active, `⚠️ ${i18n.t('system.imageTooLarge')}`, 'system'); return; }
    sysLine(active, `📤 ${i18n.t('system.sendingImage', { name: file.name })}`, 'system');
    try {
      // Share it as a CTCP ACTION so it reads as an action everywhere —
      // "* Mik 📷 partage une image : <url>"; the web client renders the card.
      share(client, active, `📷 ${i18n.t('system.shareImage', { url: await uploadFile(client, file) })}`);
    } catch (e) { fail(active, e); }
  }

  async function uploadAudio(blob: Blob, ext: string): Promise<void> {
    const { client, active } = get();
    if (!client || !active || active === SERVER) return;
    if (blob.size > MAX_BYTES) { sysLine(active, `⚠️ ${i18n.t('system.imageTooLarge')}`, 'system'); return; }
    sysLine(active, `📤 ${i18n.t('system.sendingVoice')}`, 'system');
    try {
      const file = new File([blob], `voice.${ext}`, { type: blob.type || 'audio/webm' });
      share(client, active, `🎤 ${i18n.t('system.shareVoice', { url: await uploadFile(client, file) })}`);
    } catch (e) { fail(active, e); }
  }

  return { uploadImage, uploadAudio };
}
