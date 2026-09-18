// Pre-paint boot script. Kept as an external (non-inline) script so the page CSP
// is satisfied by script-src 'self' with no per-script hash to maintain.

// Apply the saved theme before first paint so there's no flash of the light
// default on load/reload. Full theme logic runs later in src/ui/theme.ts.
try {
  var t = localStorage.getItem('orbit-theme') || localStorage.getItem('tchatou-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}

// Start fetching the runtime config here, not in the app bundle. loadConfig()
// (src/core/config.ts) awaits this promise if it finds it, so the request flies
// while the browser is still downloading and parsing the app chunk instead of
// costing a whole round-trip after it. Same options as loadConfig's own fetch —
// they must match or the response can't be reused.
try {
  var base = (document.currentScript && document.currentScript.src || '/app/theme-init.js')
    .replace(/theme-init\.js.*$/, ''); // our own URL minus the filename = the app base
  window.__orbitConfig = fetch(base + 'config.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
} catch (e) {}

// Webfont: Geist Mono is the only family the stylesheets reference (--font,
// --display and --mono all resolve to it). Loaded as a preload that flips to a
// stylesheet on arrival, so it's fetched at high priority without blocking the
// first paint the way a plain <link rel=stylesheet> to fonts.googleapis.com does.
try {
  var f = document.createElement('link');
  f.rel = 'preload';
  f.as = 'style';
  f.href = 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..800&display=swap';
  f.onload = function () { f.rel = 'stylesheet'; };
  document.head.appendChild(f);
} catch (e) {}
