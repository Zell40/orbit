/*
 * Orbit sandboxed-plugin demo.
 *
 * Load it SANDBOXED from config.json:
 *   "plugins": [{ "url": "/app/plugins/orbit-sandbox-demo.js", "sandbox": true,
 *                 "permissions": ["irc", "storage"] }]
 *
 * It runs in an opaque-origin iframe and can only reach the app through the
 * capability bridge. With just ["irc","storage"] granted, orbit.notify() would be
 * refused by the host. It has no access to the page DOM, cookies or localStorage.
 */
Orbit.plugin('sandbox-demo', function (orbit, log) {
  log('sandboxed demo booted; nick=' + orbit.state.nick());

  orbit.ui('footer_item', function (root) {
    var btn = document.createElement('button');
    btn.textContent = '🧪 wave';
    // Explicit colours: the sandbox is isolated from the app's theme vars, so a
    // self-contained plugin ships its own visible styling (works on light + dark).
    btn.style.cssText = 'font:600 13px system-ui,sans-serif;cursor:pointer;border:0;border-radius:8px;' +
      'padding:.3rem .6rem;background:#8957e5;color:#fff;white-space:nowrap';
    btn.onclick = function () {
      var n = (orbit.storage.get('waves', 0)) + 1;
      orbit.storage.set('waves', n);
      orbit.irc.say('👋 (' + n + ' from a sandboxed plugin)');
      btn.title = n + ' waves';
    };
    root.appendChild(btn);
  });

  orbit.on('message', function (m) { log('saw a message in ' + (m && m.target)); });
});
