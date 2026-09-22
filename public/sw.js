// Orbit service worker — installable PWA + offline app shell.
// Scope: /app/. Same-origin /app/ GETs only. IRC websocket, POST APIs, and
// GET /app/accounts/api/* (chat_resume, profile_gecos, unfurl) pass through.
const CACHE = 'orbit-__SW_BUILD__';
const SHELL = ['/app/', '/app/index.html', '/app/favicon.svg', '/app/orbit-icon.svg', '/app/manifest.webmanifest'];

// No skipWaiting: a new SW stays waiting until every tab closes, so a running tab
// keeps its cached bundle (a manual refresh still loads the new build — navigate
// is network-first). This is what makes the app not auto-reload.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Web Push (draft/webpush) ────────────────────────────────────────────────
// The browser decrypts the payload (RFC 8291) and hands us exactly one IRC
// message line. We turn PMs / channel highlights into native notifications.
function parseIrcLine(line) {
  let rest = line;
  let msgid = '';
  if (rest[0] === '@') {
    const sp = rest.indexOf(' ');
    const tags = rest.slice(1, sp === -1 ? undefined : sp);
    for (const t of tags.split(';')) { if (t.startsWith('msgid=')) msgid = t.slice(6); }
    rest = sp === -1 ? '' : rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest[0] === ':') { const sp = rest.indexOf(' '); prefix = rest.slice(1, sp === -1 ? undefined : sp); rest = sp === -1 ? '' : rest.slice(sp + 1); }
  const nick = prefix.split('!')[0];
  const sp1 = rest.indexOf(' ');
  const command = sp1 === -1 ? rest : rest.slice(0, sp1);
  rest = sp1 === -1 ? '' : rest.slice(sp1 + 1);
  const ti = rest.indexOf(' :');
  const target = ti === -1 ? rest : rest.slice(0, ti);
  const text = ti === -1 ? '' : rest.slice(ti + 2);
  return { nick, command, target, text, msgid };
}

// The deployment's own config.json (network-first, cache fallback) — the single
// source of truth for branding on every surface this worker owns.
async function configJson() {
  let r;
  try { r = await fetch('/app/config.json', { cache: 'no-store' }); } catch { r = await caches.match('/app/config.json'); }
  return r && r.ok ? r.json() : null;
}

// Brand name/icon for notifications, so a re-branded deployment's push
// notifications match its identity.
async function brand() {
  try {
    const b = ((await configJson()) || {}).branding || {};
    return { name: b.name || 'Orbit', icon: b.icon || '/app/favicon.svg' };
  } catch { return { name: 'Orbit', icon: '/app/favicon.svg' }; }
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // App already on screen (PWA/mobile often has focused=false even then) → the
    // in-chat highlighter/blip is enough. Don't stack an OS banner on top.
    if (wins.some((w) => w.visibilityState === 'visible')) return;

    let line = '';
    try { line = e.data ? e.data.text() : ''; } catch { line = ''; }
    if (!line) return;
    const m = parseIrcLine(line);
    if (m.command !== 'PRIVMSG' && m.command !== 'NOTICE') return;

    const isChannel = /^[#&]/.test(m.target || '');
    const b = await brand();
    const title = isChannel ? `${m.nick} · ${m.target}` : (m.nick || b.name);
    let body = m.text || '';
    if (body.startsWith('\x01ACTION ')) body = `* ${m.nick} ${body.slice(8).replace(/\x01$/, '')}`;

    await self.registration.showNotification(title, {
      body,
      icon: b.icon,
      badge: b.icon,
      tag: m.msgid || `${m.nick}:${m.target}`,
      renotify: true,
      data: { target: isChannel ? m.target : m.nick, url: '/app/' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.includes('/app/')) {
        if (data.target) w.postMessage({ type: 'open-buffer', target: data.target });
        return w.focus();
      }
    }
    return self.clients.openWindow(data.url || '/app/');
  })());
});

// config.branding.icon values that mean "the deployer never picked one" — the
// bundled PNGs in the static manifest are purpose-built app icons and beat a
// bare logo mark, so leave the manifest untouched for those.
const STOCK_ICONS = ['/app/orbit-icon.svg', '/app/favicon.svg'];
const ICON_TYPES = [[/\.svg(\?|$)/i, 'image/svg+xml'], [/\.png(\?|$)/i, 'image/png'],
  [/\.jpe?g(\?|$)/i, 'image/jpeg'], [/\.webp(\?|$)/i, 'image/webp']];

// True when the manifest ships a maskable asset that is a SEPARATE file from its
// `any` icons. Only a deployment that generated a real icon set does that — an
// adaptive icon needs a bled-out background and a 40% safe zone, so it cannot be
// the same PNG. Orbit's stock manifest reuses one square for both, so this never
// matches the bundled default; it matches exactly the deployments where swapping
// in the config icon would replace purpose-built icons with a website logo.
function hasOwnIconSet(icons) {
  const any = new Set();
  const maskable = [];
  for (const i of icons) {
    const purpose = (i.purpose || 'any').split(/\s+/);
    if (purpose.includes('any')) any.add(i.src);
    if (purpose.includes('maskable')) maskable.push(i.src);
  }
  return maskable.some((src) => !any.has(src));
}

// Static manifest + the deployment's icon on top. Returns the untouched response
// whenever anything is off, so a missing/odd config.json can never cost the app
// its manifest (and with it, installability).
async function brandedManifest(req) {
  const res = await fetch(req).then((r) => {
    if (r.ok && r.type === 'basic') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req));
  if (!res || !res.ok) return res || Response.error();
  try {
    const manifest = await res.clone().json();
    const icon = (((await configJson()) || {}).branding || {}).icon;
    if (!icon || STOCK_ICONS.includes(icon)) return res;
    if (!Array.isArray(manifest.icons)) return res;
    if (hasOwnIconSet(manifest.icons)) return res;
    const type = (ICON_TYPES.find(([re]) => re.test(icon)) || [])[1];
    // Swap the source of the declared `any` entries rather than prepend a new
    // one: we cannot measure the image (it is usually cross-origin, so
    // createImageBitmap has nothing to decode) and a `sizes: "any"` entry parses
    // to 0x0, which Android's icon picker scores poorly. Reusing the sizes the
    // deployer already declared keeps selection predictable.
    //
    // `maskable` is left alone on purpose. It is a different kind of asset — it
    // needs a bled-out background and a 40% safe zone — and a logo stretched
    // into that role gets its edges cropped. Reaching here at all means the
    // maskable entry reuses an `any` square (see hasOwnIconSet).
    manifest.icons = manifest.icons.map((i) => {
      const purpose = (i.purpose || 'any').split(/\s+/);
      if (!purpose.includes('any')) return i;
      return Object.assign({}, i, { src: icon, purpose: 'any' }, type ? { type } : null);
    });
    return new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' },
    });
  } catch { return res; }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/app/')) return;
  // PHP APIs under Alias /app (chat_resume, profile_gecos, unfurl, avatars).
  // Never intercept: a cached 200 {ok:false} would block session resume, and a
  // SW re-fetch can drop credentials:include cookies.
  if (url.pathname.includes('/accounts/api/')) return;

  // Navigations: network-first so new builds load; fall back to the cached
  // shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/app/index.html')));
    return;
  }
  // version.json: the update probe — always straight to network, never cached, so
  // a poll (src/ui/appUpdate.ts) sees the freshly deployed build id immediately.
  if (url.pathname === '/app/version.json') { e.respondWith(fetch(req)); return; }
  // config.json: network-first so a deployer's edits apply WITHOUT a rebuild;
  // fall back to the last cached copy when offline.
  if (url.pathname === '/app/config.json') {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  // manifest.webmanifest: the install icon has to follow config.branding.icon
  // like every other surface (tab favicon, notifications), but the page cannot
  // build a manifest itself — scope/start_url must resolve under the manifest's
  // own directory, which a blob: URL has not got. Serving it from here keeps the
  // real /app/ URL and one source of truth. A first, uncontrolled load still gets
  // the static file, so this is never worse than shipping it alone.
  if (url.pathname === '/app/manifest.webmanifest') { e.respondWith(brandedManifest(req)); return; }
  // /app/assets/ is content-hashed → immutable, so cache-first (fast; a new build
  // ships new filenames, so this never goes stale).
  if (url.pathname.startsWith('/app/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }
  // Everything else under /app/ — plugins, icons, manifest — has a STABLE
  // (unhashed) URL and is therefore mutable: network-first, or a cached copy would
  // pin an old build forever (this is what stuck a fixed plugin stale). Falls back
  // to cache when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
