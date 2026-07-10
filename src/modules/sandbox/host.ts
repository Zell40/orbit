// Host side of the sandbox bridge — a core subsystem. Runs on the trusted app thread.
//
// `mountSandboxed(spec)` takes plugin SOURCE, spins an opaque-origin iframe (the
// isolation boundary), hands the source to the guest over a MessageChannel, then
// services capability-checked RPC and forwards a curated set of events + a state
// snapshot in. The guest can NEVER reach the app's DOM, cookies, localStorage or
// store directly — only through the gated calls below. It powers both first-party
// features the app bundles (see ./builtins) and operator-listed sandboxed plugins.
import { createElement } from 'react';
import { activeStore } from '../../core/networks';
import { useThemeStore } from '../../themes';
import { getConfig, pluginDebug, type PluginEntry } from '../../core/config';
import { bus } from '../bus';
import { usePluginRegistry, type UiSlot } from '../registry';
import { pluginNotify } from '../../platform/notify';
import { SandboxFrame } from './SandboxFrame';
import {
  isGranted, sanitizePermissions, FORWARDED_EVENTS, THEME_VARS,
  type StateSnapshot, type GuestToHost,
} from './protocol';

// A same-origin document served with its OWN strict CSP; sandbox="allow-scripts"
// forces it into an opaque origin, so its scripts can't touch the app's origin.
const SANDBOX_DOC = `${import.meta.env.BASE_URL}plugin-sandbox.html`;
const STORE_PREFIX = 'orbit-sbx:';

function snapshot(): StateSnapshot {
  const s = activeStore().getState();
  const cl = s.client;
  return {
    active: s.active, nick: s.nick, account: s.account, buffers: Object.keys(s.buffers),
    network: cl?.server.network ?? '',
    isupport: { ...(cl?.server.isupport ?? {}) },
    caps: cl?.ircv3.listCaps() ?? [],
  };
}

// Current values of the app's themeable CSS vars, mirrored into the sandbox.
function themeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const v of THEME_VARS) out[v] = cs.getPropertyValue(v).trim();
  return out;
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

// A sandboxed feature: a name, its JS source, and the capabilities it may use.
export interface SandboxSpec { name: string; source: string; permissions?: readonly string[]; }

// Core entry point: run `source` in an isolated iframe with `permissions`. Used by
// the app for its own bundled features and by the config loader for plugins.
export function mountSandboxed(spec: SandboxSpec): void {
  const name = spec.name;
  const source = spec.source;
  const permissions = sanitizePermissions(spec.permissions);

  const iframe = document.createElement('iframe');
  iframe.src = SANDBOX_DOC;
  iframe.setAttribute('sandbox', 'allow-scripts'); // opaque origin — the isolation boundary
  iframe.title = name;
  // Hidden until the guest reports its size, so it never flashes at the wrong spot
  // (an absolute frame anchors to the viewport before the slot's CSS applies).
  iframe.style.cssText = 'border:0;width:0;height:0;display:block;background:transparent;color-scheme:normal;visibility:hidden';

  const log = (...a: unknown[]) => { if (pluginDebug()) console.log(`%c[${name}]`, 'color:#8957e5', ...a); };

  let claimed = false;
  let lastNotify = 0;
  let lastBeacon = 0;
  let removeUi: () => void = () => {};
  let currentPort: MessagePort | null = null;   // the live guest port (rebuilt each handshake)
  const hooks: Record<string, () => void> = {};  // command/shortcut disposers, keyed by guest hook id
  const KNOWN_SLOTS = ['composer_button', 'settings_section', 'topbar_item', 'sidebar_item', 'footer_item', 'nav_item'];
  const hasModifier = (combo: string) => /\b(mod|ctrl|control|meta|cmd|super|alt|option)\b/i.test(combo);
  const impl: Record<string, (args: unknown[]) => unknown> = {
    log: (a) => log(...a),
    'irc.say': (a) => activeStore().getState().sendInput(String(a[0] ?? '')),
    'irc.msg': (a) => activeStore().getState().client?.privmsg(String(a[0]), String(a[1] ?? '')),
    'irc.send': (a) => activeStore().getState().client?.send(String(a[0] ?? '')),
    'irc.join': (a) => { const s = activeStore().getState(); const c = String(a[0] ?? ''); s.client?.join(c); s.setActive(c); },
    'irc.part': (a) => activeStore().getState().client?.part(String(a[0] ?? '')),
    'irc.list': () => activeStore().getState().client?.list(),
    notify: (a) => {
      const now = Date.now();
      if (now - lastNotify < 4000) return; // rate-limit: at most one desktop notification / 4s per plugin
      lastNotify = now;
      pluginNotify(String(a[0] ?? ''), a[1] != null ? String(a[1]) : undefined);
    },
    'storage.set': (a) => persistStorage(name, String(a[0]), a[1]),
    // Host-mediated egress: the guest supplies only { t, p }; WE choose the URL
    // (config.analytics.endpoint), send no cookies, and cap rate + payload. So an
    // isolated plugin can beacon a pageview but can't exfiltrate or pick a target.
    'analytics.track': (a) => {
      const an = getConfig().analytics;
      if (!an?.endpoint) return; // disabled unless an endpoint is configured
      const now = Date.now();
      // Runaway-loop backstop only — kept well under the plugin's own debounce so a
      // session event and a closely following pageview don't drop each other. Real
      // abuse limiting is per-IP at the endpoint.
      if (now - lastBeacon < 250) return;
      lastBeacon = now;
      const p = (a[0] && typeof a[0] === 'object' ? a[0] : {}) as Record<string, unknown>;
      const body = JSON.stringify({
        t: String(p.t ?? 'event').slice(0, 32),
        p: p.p != null ? String(p.p).slice(0, 128) : undefined,
        site: an.siteId || undefined,
        path: location.pathname,
        ref: document.referrer || undefined,
        lang: navigator.language,
      });
      try { void fetch(an.endpoint, { method: 'POST', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }); }
      catch { /* fire-and-forget */ }
    },
    'ui.claim': (a) => {
      if (claimed) return; claimed = true;
      const raw = String(a[0] ?? 'footer_item');
      const slot = (KNOWN_SLOTS.includes(raw) ? raw : 'footer_item') as UiSlot;
      removeUi = usePluginRegistry.getState().addUi(slot, name, () => createElement(SandboxFrame, { iframe }));
    },
    'ui.resize': (a) => {
      const w = Math.max(0, Math.min(4000, Number(a[0]) || 0));
      const h = Math.max(0, Math.min(2000, Number(a[1]) || 0));
      if (w) iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
      if (h > 0) iframe.style.visibility = 'visible';
    },
    // A plugin /command: the registry runs this handler on the app thread; we relay it
    // (args + rest string) to the guest, which invokes the plugin's callback. Whatever
    // the plugin does next still goes through the gated verbs. Re-register is idempotent
    // (teardown disposes hooks each handshake, so ids stay in sync with the guest).
    'command.register': (a) => {
      const cmd = String(a[0] ?? ''); const id = String(a[1] ?? '');
      if (!cmd || !id) return;
      hooks[id]?.();
      hooks[id] = usePluginRegistry.getState().addCommand(name, cmd,
        (args, rest) => currentPort?.postMessage({ type: 'event', name: id, args: [args, rest] }),
        a[2] != null ? String(a[2]) : undefined);
    },
    'command.dispose': (a) => { const id = String(a[0] ?? ''); hooks[id]?.(); delete hooks[id]; },
    // A plugin shortcut. Bare-key combos are refused: the shortcut loop fires even while
    // typing, so a modifier-less combo would keylog and swallow keystrokes in the composer.
    'shortcut.register': (a) => {
      const combo = String(a[0] ?? ''); const id = String(a[1] ?? '');
      if (!combo || !id) return;
      if (!hasModifier(combo)) { log('DENIED shortcut without a modifier', combo); return; }
      hooks[id]?.();
      hooks[id] = usePluginRegistry.getState().addShortcut(name, combo,
        (e) => { e.preventDefault(); currentPort?.postMessage({ type: 'event', name: id, args: [] }); });
    },
    'shortcut.dispose': (a) => { const id = String(a[0] ?? ''); hooks[id]?.(); delete hooks[id]; },
  };

  // (Re)establish the bridge on EVERY iframe load. Adopting the iframe into a UI
  // slot reparents it, which reloads the document and neuters the transferred
  // port — so we hand the fresh guest a new MessageChannel and re-send init each
  // time (a plugin's on-load code must therefore be idempotent).
  let teardown = () => {};
  const handshake = () => {
    teardown();
    iframe.style.visibility = 'hidden'; // re-hide across the adoption reload until resized
    const chan = new MessageChannel();
    const port = chan.port1;
    currentPort = port;
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
    const offTheme = useThemeStore.subscribe((s, prev) => {
      if (s.theme !== prev.theme) port.postMessage({ type: 'theme', theme: themeVars() });
    });
    teardown = () => { offs.forEach((o) => o()); offTheme(); for (const k in hooks) { hooks[k](); delete hooks[k]; } port.close(); };
    iframe.contentWindow?.postMessage(
      { type: 'init', name, permissions, source, snapshot: snapshot(), storage: loadStorage(name), theme: themeVars() },
      '*', [chan.port2],
    );
    log('handshake');
  };

  iframe.addEventListener('load', handshake);
  holder().appendChild(iframe);
  void removeUi; // referenced by the (future) unload path
}

// Operator-listed sandboxed plugin: fetch its source (same-origin, optional SRI),
// then hand off to mountSandboxed. Third-party/untrusted plugins load this way.
export async function mountSandboxedPlugin(entry: Exclude<PluginEntry, string>): Promise<void> {
  const url = entry.url;
  const name = `sbx:${url.split('/').pop() || url}`;
  try {
    const res = await fetch(url, entry.integrity ? { integrity: entry.integrity } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mountSandboxed({ name, source: await res.text(), permissions: entry.permissions });
  } catch (e) { console.error(`[sandbox] ${name}: failed to fetch ${url}`, e); }
}
