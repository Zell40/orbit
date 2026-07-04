/*
 * pulse — a live "how busy is this channel" meter, as a SANDBOXED feature module.
 *
 * Exercises a different slice of the sandbox API than dice: message events + a
 * state snapshot + UI, and NO privileged permissions (it only reads). See README.
 *
 * Busy-channel safe: counting is O(1) per message (per-second buckets, not a growing
 * array), and repaints are coalesced to ~2/second no matter the message rate.
 */
Orbit.plugin('pulse', function (orbit) {
  var buckets = {};                    // unix-second -> message count (rolling 60s window)
  var active = orbit.state.active();
  var pill, pending = false;

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function count() {                   // sum the window; prune expired seconds (<= 60 keys)
    var cut = nowSec() - 60, n = 0;
    for (var k in buckets) { if (+k < cut) delete buckets[k]; else n += buckets[k]; }
    return n;
  }

  function render() {
    if (!pill) return;
    var n = count();
    pill.textContent = '⚡ ' + n;
    pill.title = n + ' messages in the last minute' + (active ? ' in ' + active : '');
    var hot = Math.min(1, n / 20);     // colour ramps muted -> green -> orange
    pill.style.color = n ? 'hsl(' + Math.round(140 - hot * 140) + ',70%,45%)' : 'var(--muted,#888)';
  }

  // Coalesce repaints: a flood of messages schedules at most one render per 500ms.
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; render(); }, 500);
  }

  orbit.on('message', function (m) {
    if (m && m.target === active) { var s = nowSec(); buckets[s] = (buckets[s] || 0) + 1; schedule(); }
  });
  orbit.on('buffer.active', function (a) { active = a; buckets = {}; render(); });

  orbit.ui('footer_item', function (root) {
    pill = document.createElement('span');
    pill.style.cssText = 'font:600 12px system-ui,sans-serif;padding:.25rem .45rem;' +
      'border-radius:9px;border:1px solid var(--border,#8884);white-space:nowrap';
    root.appendChild(pill);
    render();
    setInterval(render, 3000);         // decay the window even when the room is quiet
  });
});
