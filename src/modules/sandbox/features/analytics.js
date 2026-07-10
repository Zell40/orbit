/*
 * Orbit analytics — a SANDBOXED, cookieless, first-party pageview counter.
 *
 * Runs in an opaque-origin iframe. It cannot read the page, cookies, the store or
 * the network; it can only hand a small { t, p } payload to the host via the gated
 * `analytics.track` verb, and the HOST posts it to config.analytics.endpoint — the
 * plugin never chooses the destination. Enabled by setting that endpoint:
 *   "analytics": { "endpoint": "/accounts/api/analytics/", "siteId": "app" }
 */
Orbit.plugin('analytics', function (orbit, log) {
  // Never leak a private conversation: only public channels (#/&) keep their name;
  // DMs and the server console collapse to a category.
  function page(name) {
    if (!name) return '@root';
    var c = name.charAt(0);
    return c === '#' || c === '&' ? name : '@direct';
  }

  var last = '';
  var timer = 0;
  function view(name) {
    var p = page(name);
    if (p === last) return; // ignore no-op re-selects of the same buffer
    last = p;
    if (timer) clearTimeout(timer);
    // Debounce: only count a view once the user lingers, so flicking through
    // channels doesn't spam beacons (the host also rate-limits as a backstop).
    timer = setTimeout(function () { orbit.track({ t: 'pageview', p: p }); }, 700);
  }

  orbit.on('connected', function () { orbit.track({ t: 'session' }); });
  orbit.on('buffer.active', function (name) { view(name); });
  log('ready');
});
