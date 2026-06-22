// Tchatou service worker — installable PWA + offline app shell.
// Scope: /app/. Only handles same-origin /app/ GETs; the IRC websocket and all
// API calls (cloudflare, change_password, upload) pass straight through.
const CACHE = 'tchatou-v73';
const SHELL = ['/app/', '/app/index.html', '/app/favicon.svg', '/app/orbit-icon.svg', '/app/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // App open & actively in front → the in-app notifier handles it; don't double up.
    if (wins.some((w) => w.focused && w.visibilityState === 'visible')) return;

    let line = '';
    try { line = e.data ? e.data.text() : ''; } catch { line = ''; }
    if (!line) return;
    const m = parseIrcLine(line);
    if (m.command !== 'PRIVMSG' && m.command !== 'NOTICE') return;

    const isChannel = /^[#&]/.test(m.target || '');
    const title = isChannel ? `${m.nick} · ${m.target}` : (m.nick || 'Tchatou');
    let body = m.text || '';
    if (body.startsWith('\x01ACTION ')) body = `* ${m.nick} ${body.slice(8).replace(/\x01$/, '')}`;

    await self.registration.showNotification(title, {
      body,
      icon: '/app/favicon.svg',
      badge: '/app/favicon.svg',
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/app/')) return;

  // Navigations: network-first so new builds load; fall back to the cached
  // shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/app/index.html')));
    return;
  }
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
  // Hashed assets (immutable): cache-first, populate on first fetch.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});
