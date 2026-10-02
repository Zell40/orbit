// Pre-paint boot script. Kept as an external (non-inline) script so the page CSP
// is satisfied by script-src 'self' with no per-script hash to maintain.

// Light / dark plate colours — match .splash / --bg-soft so the first HTML paint
// continues the Android PWA splash (manifest background_color) without a flash.
var SPLASH_LIGHT = '#f4f6f8';
var SPLASH_DARK = '#23272e';

function splashIsDark() {
  try {
    var t = localStorage.getItem('orbit-theme') || localStorage.getItem('tchatou-theme') || '';
    return /(^|-)dark$|orbit-dark|midnight|yomirc-dark/i.test(t);
  } catch (e) { return false; }
}

// Apply the saved theme before first paint so there's no flash of the light
// default on load/reload. Full theme logic runs later in src/ui/theme.ts.
try {
  var t = localStorage.getItem('orbit-theme') || localStorage.getItem('tchatou-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}

try {
  var plate = splashIsDark() ? SPLASH_DARK : SPLASH_LIGHT;
  document.documentElement.style.backgroundColor = plate;
  // body may not exist yet (script is in <head>); paint the root as soon as it does.
  var paintBody = function () {
    if (document.body) document.body.style.backgroundColor = plate;
  };
  paintBody();
  if (!document.body) document.addEventListener('DOMContentLoaded', paintBody);
} catch (e) {}

// Instant loading plate under the OS splash. Android always shows its own
// splash first (cannot be disabled); matching colours + this HUD mean the handoff
// looks like one continuous "chargement" instead of navy→white→app.
function mountEarlyBoot() {
  if (document.getElementById('orbit-boot')) return;
  var dark = splashIsDark();
  var bg = dark ? SPLASH_DARK : SPLASH_LIGHT;
  var ink = dark ? '#e8eaed' : '#1a1d23';
  var muted = dark ? 'rgba(232,234,237,.72)' : '#6b7280';
  var bar = dark ? 'rgba(255,255,255,.14)' : '#eceff3';
  var fill = '#1452cc';
  var el = document.createElement('div');
  el.id = 'orbit-boot';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;'
    + 'align-items:center;justify-content:center;gap:1rem;background:' + bg
    + ';color:' + ink + ';font-family:system-ui,-apple-system,sans-serif;';
  el.innerHTML = ''
    + '<span style="width:96px;height:96px;border-radius:24px;overflow:hidden;display:grid;place-items:center">'
    + '<img src="/app/icon-192.png" alt="" width="96" height="96" style="width:100%;height:100%;object-fit:contain;display:block"/>'
    + '</span>'
    + '<p data-boot-name style="margin:0;font-weight:700;font-size:1.35rem;letter-spacing:-.02em"></p>'
    + '<p data-boot-txt style="margin:0;font-size:.95rem;color:' + muted + '">…</p>'
    + '<div style="width:min(14rem,62vw);height:4px;border-radius:999px;background:' + bar + ';overflow:hidden">'
    + '<i style="display:block;height:100%;width:12%;border-radius:inherit;background:' + fill + '"></i>'
    + '</div>';
  (document.body || document.documentElement).appendChild(el);
}

function enrichEarlyBoot(cfg) {
  var el = document.getElementById('orbit-boot');
  if (!el || !cfg || !cfg.branding) return;
  var img = el.querySelector('img');
  var name = el.querySelector('[data-boot-name]');
  if (img && cfg.branding.icon) img.src = cfg.branding.icon;
  if (name && cfg.branding.name) name.textContent = cfg.branding.name;
}

window.__orbitDismissBoot = function () {
  var el = document.getElementById('orbit-boot');
  if (el) el.remove();
};

if (document.body) mountEarlyBoot();
else document.addEventListener('DOMContentLoaded', mountEarlyBoot);

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
    .then(function (cfg) { enrichEarlyBoot(cfg); return cfg; })
    .catch(function () { return null; });
} catch (e) {}

// Webfont: Geist Mono is the only family the stylesheets reference (--font,
// --display and --mono all resolve to it). Loaded as a preload that promotes itself
// to a stylesheet on arrival, so it's fetched at high priority without blocking the
// first paint the way a plain <link rel=stylesheet> to fonts.googleapis.com does.
try {
  var f = document.createElement('link');
  f.rel = 'preload';
  f.as = 'style';
  f.href = 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..800&display=swap';
  f.onload = function () { f.rel = 'stylesheet'; };
  document.head.appendChild(f);
} catch (e) {}
