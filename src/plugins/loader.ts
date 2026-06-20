// Loads operator-listed plugins from config.json (`plugins: ["url.js", …]`) by
// injecting <script> tags. These are deployment-controlled (same trust level as
// the app), NOT user-uploaded.
//
// An entry may be a bare URL string, or `{ url, integrity, crossorigin }` to pin
// the script with Subresource Integrity — strongly recommended for any plugin
// served from a third-party origin, so a compromised host can't swap the file.
import { getConfig, type PluginEntry } from '../config';

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
  const list = (getConfig().plugins ?? []).filter(Boolean).map(scriptAttrs).filter((p) => p.url);
  for (const { url, integrity, crossorigin } of list) {
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.dataset.orbitPlugin = url;
    if (integrity) el.integrity = integrity;
    if (crossorigin) el.crossOrigin = crossorigin;
    el.onerror = () => console.error('[plugins] failed to load', url);
    document.head.appendChild(el);
  }
  if (list.length) console.log(`[plugins] loading ${list.length} plugin(s)`, list.map((p) => p.url));
}
