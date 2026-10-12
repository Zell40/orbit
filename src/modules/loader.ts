// Loads operator-listed plugins from config.json (`plugins: ["url.js", …]`) by
// injecting <script> tags. These are deployment-controlled (same trust level as
// the app), NOT user-uploaded.
//
// An entry may be a bare URL string, or `{ url, integrity, crossorigin }` to pin
// the script with Subresource Integrity — strongly recommended for any plugin
// served from a third-party origin, so a compromised host can't swap the file.
import { getConfig, pluginDebug, type PluginEntry } from '../core/config';

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

/** Games / extras — parse+run on the main thread after the shell is usable. */
const DEFERRED_PLUGIN_RE =
  /orbit-(petitbac|echecs|harrypotter|rss|memoserv|radio|clock)\b/i;

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
  const run = () => {
    for (const p of extra) void injectScript(p);
    if (boxed.length) {
      void import('./sandbox/host').then(({ mountSandboxedPlugin }) => {
        for (const entry of boxed) void mountSandboxedPlugin(entry);
      });
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 0);
  }
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

  const waits = now.map((p) => injectScript(p).then(() => { pluginSettled += 1; }));
  pluginsPromise = waits.length ? Promise.all(waits).then(() => undefined) : Promise.resolve();

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
