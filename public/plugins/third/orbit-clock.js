/*
 * Orbit clock — a live HH:MM clock in the topbar. FULLY SANDBOXED.
 *
 * Runs in an opaque-origin iframe reachable only through the capability bridge, so
 * it can touch NOTHING outside itself: no page, no store, no IRC, no storage. It
 * renders its own DOM (no React) and styles itself with the app's theme vars, which
 * are mirrored into the sandbox — so it still matches light + dark. Needs zero
 * permissions.
 *
 *   { "url": "/app/plugins/third/orbit-clock.js", "sandbox": true, "permissions": [] }
 */
Orbit.plugin('orbit-clock', function (orbit, log) {
  orbit.ui('topbar_item', function (root) {
    root.style.cssText = 'font:600 13px/1 system-ui,sans-serif;color:var(--ink,inherit);opacity:.7;white-space:nowrap';
    root.title = 'Local time';
    function tick() {
      var d = new Date();
      root.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    tick();
    setInterval(tick, 15000);
  });
  log('clock ready');
});
