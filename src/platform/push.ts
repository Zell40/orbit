// Web Push (draft/webpush) — browser subscription manager.
//
// Registers a PushManager subscription against the server's VAPID key (from the
// VAPID ISUPPORT token) and hands the endpoint + keys to the ircd via the
// WEBPUSH command. The ircd then POSTs encrypted copies of PMs / highlights to
// the push endpoint, which the service worker (public/sw.js) turns into native
// notifications — even when the tab/PWA is backgrounded. Push-while-fully-closed
// works for logged-in accounts (the server persists the subscription by account).
import type { IrcClient } from '../core/irc/client';

const PREF_KEY = 'orbit-push';
const LEGACY_PUSH = 'tchatou-push';

export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushEnabledPref(): boolean {
  try {
    const v = localStorage.getItem(PREF_KEY) ?? localStorage.getItem(LEGACY_PUSH);
    if (v === 'on' && !localStorage.getItem(PREF_KEY)) localStorage.setItem(PREF_KEY, 'on');
    return v === 'on';
  } catch { return false; }
}

function setPref(on: boolean): void {
  try { if (on) localStorage.setItem(PREF_KEY, 'on'); else localStorage.removeItem(PREF_KEY); } catch { /* ignore */ }
}

// base64url (no padding) -> Uint8Array, for applicationServerKey.
function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ArrayBuffer -> base64url (no padding), for the p256dh/auth subscription keys.
function bytesToUrlB64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getOrCreateSubscription(vapid: string): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToBytes(vapid),
  });
}

function registerWithServer(client: IrcClient, sub: PushSubscription): void {
  const p256dh = bytesToUrlB64(sub.getKey('p256dh'));
  const auth = bytesToUrlB64(sub.getKey('auth'));
  if (!p256dh || !auth) return;
  client.ircv3.webpushRegister(sub.endpoint, `p256dh=${p256dh};auth=${auth}`);
}

// Turn push on: ask permission, subscribe, hand the endpoint to the ircd.
export async function enablePush(client: IrcClient): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (!client.server.vapid) return { ok: false, reason: 'no-vapid' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  try {
    const sub = await getOrCreateSubscription(client.server.vapid);
    if (!sub) return { ok: false, reason: 'no-subscription' };
    registerWithServer(client, sub);
    setPref(true);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

// Turn push off: tell the ircd to drop it, then unsubscribe in the browser.
export async function disablePush(client: IrcClient): Promise<void> {
  setPref(false);
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      client.ircv3.webpushUnregister(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch { /* ignore */ }
}

// Re-assert the subscription after (re)connect so it survives server expiry and
// reconnects. Cheap no-op if push was never enabled or isn't permitted.
export async function refreshPush(client: IrcClient): Promise<void> {
  if (!isPushSupported() || !pushEnabledPref() || !client.server.vapid) return;
  if (Notification.permission !== 'granted') return;
  try {
    const sub = await getOrCreateSubscription(client.server.vapid);
    if (sub) registerWithServer(client, sub);
  } catch { /* ignore */ }
}
