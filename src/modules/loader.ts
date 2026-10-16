// Loads operator-listed plugins from config.json (`plugins: ["url.js", …]`) by
// injecting <script> tags. These are deployment-controlled (same trust level as
// the app), NOT user-uploaded.
//
// An entry may be a bare URL string, or `{ url, integrity, crossorigin }` to pin
// the script with Subresource Integrity — strongly recommended for any plugin
// served from a third-party origin, so a compromised host can't swap the file.
import { getConfig, pluginDebug, type PluginEntry } from '../core/config';
import { pluginsRegistered, priorityPluginIds } from '../lib/boot-ready';
import { onPluginFactory, registeredPluginIds } from './api';

export interface ScriptAttrs { url: string; integrity?: string; crossorigin?: string }

// Pure: resolve a config entry to the <script> attributes it implies. An SRI
// hash forces a CORS request, so default crossorigin to 'anonymous' when set.
export function scriptAttrs(entry: PluginEntry): ScriptAttrs {
  const e = typeof entry === 'string' ? { url: entry } : entry;
  const out: ScriptAttrs = { url: e.url };
  if (e.integrity) { out.integrity = e.integrity; out.crossorigin = e.crossorigin ?? 'anonymous'; }
  else if (e.crossorigin) { out.crossorigin = e.crossorigin; }
  return out;
}

const PLUGIN_WAIT_MS = 8000;

/** Games / extras — parse+run on the main thread after the shell is usable.
 *  Also copy/invite/ircop/anope/helpserv-welcome: not click-now chrome. */
const DEFERRED_PLUGIN_RE =
  /orbit-(petitbac|echecs|harrypotter|rss|memoserv|radio|clock|copy|invite|ircop|helpserv-welcome|anope)\b/i;

export function isDeferredPluginUrl(url: string): boolean {
  return DEFERRED_PLUGIN_RE.test(url);
}

function injectScript(p: ScriptAttrs): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(); };
    const el = document.createElement('script');
    el.src = p.url;
    el.async = true;
    el.dataset.orbitPlugin = p.url;
    if (p.integrity) el.integrity = p.integrity;
    if (p.crossorigin) el.crossOrigin = p.crossorigin;
    const t = window.setTimeout(finish, PLUGIN_WAIT_MS);
    el.onload = () => { clearTimeout(t); finish(); };
    el.onerror = () => {
      clearTimeout(t);
      console.error('[plugins] failed to load', p.url);
      if (pluginDebug()) {
        void fetch(p.url, { method: 'HEAD', cache: 'no-store' })
          .then((r) => console.error('[plugins]', p.url, '→ HTTP', r.status))
          .catch((e) => console.error('[plugins]', p.url, '→', e));
      }
      finish();
    };
    document.head.appendChild(el);
  });
}

let pluginTotal = 0;
let pluginSettled = 0;
let pluginsPromise = Promise.resolve();
let deferredInPage: ScriptAttrs[] = [];
let deferredSandboxed: Exclude<PluginEntry, string>[] = [];
let deferredStarted = false;

export function pluginLoadStats(): { settled: number; total: number } {
  return { settled: pluginSettled, total: pluginTotal };
}

/** Resolves when boot-critical in-page plugins have loaded (not games / extras). */
export function whenPluginsLoaded(): Promise<void> {
  return pluginsPromise;
}

function pluginUrlsFromConfig(): string[] {
  return (getConfig().plugins ?? []).map((e) => typeof e === 'string' ? e : e.url);
}

/** Script onload ≠ factory finished — wait until click-now Orbit.plugin() ids exist. */
function whenPriorityFactoriesReady(): Promise<void> {
  const needed = priorityPluginIds(pluginUrlsFromConfig());
  if (pluginsRegistered(needed, registeredPluginIds())) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(t);
      off();
      resolve();
    };
    const t = window.setTimeout(done, PLUGIN_WAIT_MS);
    const off = onPluginFactory(() => {
      if (pluginsRegistered(needed, registeredPluginIds())) done();
    });
    if (pluginsRegistered(needed, registeredPluginIds())) done();
  });
}

function idleGap(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 800 });
    } else {
      window.setTimeout(resolve, 40);
    }
  });
}

function preloadBigBootScripts(list: ScriptAttrs[]): void {
  if (typeof document === 'undefined') return;
  for (const p of list) {
    if (!/orbit-(conference|chanserv|callerid|room-gallery)\b/i.test(p.url)) continue;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'script';
    link.href = p.url;
    if (p.crossorigin) link.crossOrigin = p.crossorigin;
    document.head.appendChild(link);
  }
}

function startDeferredPlugins(): void {
  if (deferredStarted) return;
  deferredStarted = true;
  const extra = deferredInPage;
  const boxed = deferredSandboxed;
  deferredInPage = [];
  deferredSandboxed = [];
  if (pluginDebug() && (extra.length || boxed.length)) {
    console.log(`[plugins] deferred wave ${extra.length} in-page, ${boxed.length} sandboxed`);
  }
  void (async () => {
    for (const p of extra) {
      await idleGap();
      await injectScript(p);
    }
    if (boxed.length) {
      const { mountSandboxedPlugin } = await import('./sandbox/host');
      for (const entry of boxed) {
        await idleGap();
        void mountSandboxedPlugin(entry);
      }
    }
  })();
}

export function loadPlugins(): void {
  const entries = (getConfig().plugins ?? []).filter(Boolean);
  // `sandbox: true` entries run in an opaque-origin iframe via the sandbox host;
  // everything else is a trusted in-page <script> (same trust as the app).
  const sandboxed = entries.filter((e): e is Exclude<typeof e, string> => typeof e !== 'string' && !!e.sandbox);
  const inPage = entries.filter((e) => typeof e === 'string' || !e.sandbox).map(scriptAttrs).filter((p) => p.url);

  const now = inPage.filter((p) => !isDeferredPluginUrl(p.url));
  deferredInPage = inPage.filter((p) => isDeferredPluginUrl(p.url));
  deferredSandboxed = sandboxed.filter((e) => isDeferredPluginUrl(e.url));
  const sandboxedNow = sandboxed.filter((e) => !isDeferredPluginUrl(e.url));

  pluginTotal = now.length;
  pluginSettled = 0;
  deferredStarted = false;

  preloadBigBootScripts(now);
  const waits = now.map((p) => injectScript(p).then(() => { pluginSettled += 1; }));
  pluginsPromise = (waits.length ? Promise.all(waits).then(() => undefined) : Promise.resolve())
    .then(() => whenPriorityFactoriesReady());

  if (sandboxedNow.length) {
    void import('./sandbox/host').then(({ mountSandboxedPlugin }) => {
      for (const entry of sandboxedNow) void mountSandboxedPlugin(entry);
    });
  }

  // Second wave after the splash unlocks — or 12s if connect never finishes.
  void import('./bus').then(({ bus }) => {
    bus.once('boot:ready', startDeferredPlugins);
  });
  window.setTimeout(startDeferredPlugins, 12_000);

  if ((inPage.length || sandboxed.length) && pluginDebug()) {
    console.log(`[plugins] boot ${now.length} in-page, defer ${deferredInPage.length}+${deferredSandboxed.length}`);
  }
}
