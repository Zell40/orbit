// Loads operator-listed plugins from config.json (`plugins: ["url.js", …]`) by
// injecting <script> tags. These are deployment-controlled (same trust level as
// the app), NOT user-uploaded.
//
// An entry may be a bare URL string, or `{ url, integrity, crossorigin }` to pin
// the script with Subresource Integrity — strongly recommended for any plugin
// served from a third-party origin, so a compromised host can't swap the file.
import { getConfig, pluginDebug, type PluginEntry } from '../config';

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

export function loadPlugins(): void {
  const entries = (getConfig().plugins ?? []).filter(Boolean);
  // `sandbox: true` entries run in an opaque-origin iframe via the sandbox host;
  // everything else is a trusted in-page <script> (same trust as the app).
  const sandboxed = entries.filter((e): e is Exclude<typeof e, string> => typeof e !== 'string' && !!e.sandbox);
  const inPage = entries.filter((e) => typeof e === 'string' || !e.sandbox).map(scriptAttrs).filter((p) => p.url);

  for (const { url, integrity, crossorigin } of inPage) {
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.dataset.orbitPlugin = url;
    if (integrity) el.integrity = integrity;
    if (crossorigin) el.crossOrigin = crossorigin;
    el.onerror = () => console.error('[plugins] failed to load', url);
    document.head.appendChild(el);
  }

  if (sandboxed.length) {
    // Loaded lazily so the sandbox subsystem (and React) isn't pulled in unless used.
    void import('./sandbox/host').then(({ mountSandboxedPlugin }) => {
      for (const entry of sandboxed) void mountSandboxedPlugin(entry);
    });
  }

  if ((inPage.length || sandboxed.length) && pluginDebug())
    console.log(`[plugins] loading ${inPage.length} in-page, ${sandboxed.length} sandboxed`);
}
