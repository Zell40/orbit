/*
 * pulse — a live "how busy is this channel" meter, as a SANDBOXED feature module.
 *
 * Exercises a different slice of the sandbox API than dice: message events + a
 * state snapshot + UI, and NO privileged permissions (it only reads). See README.
 */
Orbit.plugin('pulse', function (orbit) {
  var hits = [];                       // timestamps of recent messages in the active channel
  var active = orbit.state.active();
  var pill;

  function prune() {
    var cut = Date.now() - 60000;      // rolling 60s window
    while (hits.length && hits[0] < cut) hits.shift();
  }

  function render() {
    if (!pill) return;
    prune();
    var n = hits.length;
    pill.textContent = '⚡ ' + n;
    pill.title = n + ' messages in the last minute' + (active ? ' in ' + active : '');
    // colour ramps from muted → green → orange as the room heats up
    var hot = Math.min(1, n / 20);
    pill.style.color = n ? 'hsl(' + Math.round(140 - hot * 140) + ',70%,45%)' : 'var(--muted,#888)';
  }

  orbit.on('message', function (m) {
    if (m && m.target === active) { hits.push(Date.now()); render(); }
  });
  orbit.on('buffer.active', function (a) { active = a; hits = []; render(); });

  orbit.ui('footer_item', function (root) {
    pill = document.createElement('span');
    pill.style.cssText = 'font:600 12px system-ui,sans-serif;padding:.25rem .45rem;' +
      'border-radius:9px;border:1px solid var(--border,#8884);white-space:nowrap';
    root.appendChild(pill);
    render();
    setInterval(render, 3000);         // decay the window even when the room is quiet
  });
});
