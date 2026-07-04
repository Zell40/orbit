// Host side of the sandboxed-plugin bridge. Runs on the trusted app thread.
//
// For each sandboxed plugin entry it: fetches the plugin source (same-origin),
// spins an opaque-origin iframe (the isolation boundary), hands the source to the
// guest over a MessageChannel, then services capability-checked RPC and forwards a
// curated set of events + a state snapshot in. The guest can NEVER reach the app's
// DOM, cookies, localStorage or store directly — only through the gated calls below.
import { createElement } from 'react';
import { useChat } from '../../store';
import { pluginDebug, type PluginEntry } from '../../config';
import { bus } from '../bus';
import { usePluginRegistry, type UiSlot } from '../registry';
import { pluginNotify } from '../../services/notify';
import { SandboxFrame } from './SandboxFrame';
import {
  isGranted, sanitizePermissions, FORWARDED_EVENTS,
  type StateSnapshot, type GuestToHost,
} from './protocol';

// A same-origin document served with its OWN strict CSP; sandbox="allow-scripts"
// forces it into an opaque origin, so its scripts can't touch the app's origin.
const SANDBOX_DOC = `${import.meta.env.BASE_URL}plugin-sandbox.html`;
const STORE_PREFIX = 'orbit-sbx:';

function snapshot(): StateSnapshot {
  const s = useChat.getState();
  return { active: s.active, nick: s.nick, account: s.account, buffers: Object.keys(s.buffers) };
}

// Per-plugin namespaced storage, kept in the app's localStorage (the sandbox has none).
function loadStorage(name: string): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(STORE_PREFIX + name) || '{}'); } catch { return {}; }
}
function persistStorage(name: string, key: string, value: unknown): void {
  const all = loadStorage(name);
  if (value === undefined) delete all[key]; else all[key] = value;
  try { localStorage.setItem(STORE_PREFIX + name, JSON.stringify(all)); } catch { /* quota */ }
}

// An offscreen holder keeps each iframe attached (so it loads and stays alive) until
// a UI slot adopts it via SandboxFrame.
let holderEl: HTMLElement | null = null;
function holder(): HTMLElement {
  if (!holderEl) {
    holderEl = document.createElement('div');
    holderEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;left:-9999px';
    document.body.appendChild(holderEl);
  }
  return holderEl;
}

export async function mountSandboxedPlugin(entry: Exclude<PluginEntry, string>): Promise<void> {
  const url = entry.url;
  const name = `sbx:${url.split('/').pop() || url}`;
  const permissions = sanitizePermissions(entry.permissions);

  let source: string;
  try {
    const res = await fetch(url, entry.integrity ? { integrity: entry.integrity } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    source = await res.text();
  } catch (e) { console.error(`[sandbox] ${name}: failed to fetch ${url}`, e); return; }

  const iframe = document.createElement('iframe');
  iframe.src = SANDBOX_DOC;
  iframe.setAttribute('sandbox', 'allow-scripts'); // opaque origin — the isolation boundary
  iframe.title = name;
  iframe.style.cssText = 'border:0;width:0;height:0;display:block;background:transparent;color-scheme:normal';

  const log = (...a: unknown[]) => { if (pluginDebug()) console.log(`%c[${name}]`, 'color:#8957e5', ...a); };

  let claimed = false;
  let removeUi: () => void = () => {};
  const impl: Record<string, (args: unknown[]) => unknown> = {
    log: (a) => log(...a),
    'irc.say': (a) => useChat.getState().sendInput(String(a[0] ?? '')),
    'irc.msg': (a) => useChat.getState().client?.privmsg(String(a[0]), String(a[1] ?? '')),
    'irc.send': (a) => useChat.getState().client?.send(String(a[0] ?? '')),
    'irc.join': (a) => { const s = useChat.getState(); const c = String(a[0] ?? ''); s.client?.join(c); s.setActive(c); },
    'irc.part': (a) => useChat.getState().client?.part(String(a[0] ?? '')),
    'irc.list': () => useChat.getState().client?.list(),
    notify: (a) => pluginNotify(String(a[0] ?? ''), a[1] != null ? String(a[1]) : undefined),
    'storage.set': (a) => persistStorage(name, String(a[0]), a[1]),
    'ui.claim': (a) => {
      if (claimed) return; claimed = true;
      const slot = String(a[0] ?? 'footer_item') as UiSlot;
      removeUi = usePluginRegistry.getState().addUi(slot, name, () => createElement(SandboxFrame, { iframe }));
    },
    'ui.resize': (a) => {
      const w = Math.max(0, Math.min(4000, Number(a[0]) || 0));
      const h = Math.max(0, Math.min(2000, Number(a[1]) || 0));
      if (w) iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
    },
  };

  // (Re)establish the bridge on EVERY iframe load. Adopting the iframe into a UI
  // slot reparents it, which reloads the document and neuters the transferred
  // port — so we hand the fresh guest a new MessageChannel and re-send init each
  // time (a plugin's on-load code must therefore be idempotent).
  let teardown = () => {};
  const handshake = () => {
    teardown();
    const chan = new MessageChannel();
    const port = chan.port1;
    port.onmessage = (e: MessageEvent) => {
      const m = e.data as GuestToHost;
      if (!m || m.type !== 'rpc' || typeof m.method !== 'string') return;
      if (!isGranted(permissions, m.method)) {
        log('DENIED ungranted capability', m.method);
        port.postMessage({ type: 'rpc:reply', id: m.id, error: `denied: ${m.method}` });
        return;
      }
      let result: unknown, error: string | undefined;
      try { result = impl[m.method]?.(Array.isArray(m.args) ? m.args : []); }
      catch (err) { error = String(err); }
      port.postMessage({ type: 'rpc:reply', id: m.id, result, error });
    };
    const offs = FORWARDED_EVENTS.map((ev) =>
      bus.on(ev, (...args: unknown[]) => {
        port.postMessage({ type: 'event', name: ev, args });
        if (ev === 'connected' || ev === 'buffer.active') port.postMessage({ type: 'snapshot', snapshot: snapshot() });
      }));
    teardown = () => { offs.forEach((o) => o()); port.close(); };
    iframe.contentWindow?.postMessage(
      { type: 'init', name, permissions, source, snapshot: snapshot(), storage: loadStorage(name) },
      '*', [chan.port2],
    );
    log('handshake');
  };

  iframe.addEventListener('load', handshake);
  holder().appendChild(iframe);
  void removeUi; // referenced by the (future) unload path
}
