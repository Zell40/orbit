// Loads operator-listed plugins from config.json (`plugins: ["url.js", …]`) by
// injecting <script> tags. These are deployment-controlled (same trust level as
// the app), NOT user-uploaded.
import { getConfig } from '../config';

export function loadPlugins(): void {
  const list = (getConfig().plugins ?? []).filter(Boolean);
  for (const url of list) {
    const el = document.createElement('script');
    el.src = url;
    el.async = true;
    el.dataset.orbitPlugin = url;
    el.onerror = () => console.error('[plugins] failed to load', url);
    document.head.appendChild(el);
  }
  if (list.length) console.log(`[plugins] loading ${list.length} plugin(s)`, list);
}
