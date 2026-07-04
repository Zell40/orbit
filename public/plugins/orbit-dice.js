/*
 * Orbit dice — a small, real, SANDBOXED plugin.
 *
 * Runs in an opaque-origin iframe reachable only through the capability bridge.
 * Load it from config.json:
 *   { "url": "/app/plugins/orbit-dice.js", "sandbox": true, "permissions": ["irc", "storage"] }
 *
 * With just ["irc","storage"] it can post rolls and remember a tally — it has no
 * access to the page, cookies, localStorage or the store. It styles itself with the
 * app's theme vars (mirrored into the sandbox), so it looks native in light + dark.
 */
Orbit.plugin('dice', function (orbit, log) {
  var rolls = orbit.storage.get('rolls', 0);

  function pill(label, title) {
    var b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.style.cssText =
      'font:600 13px system-ui,sans-serif;cursor:pointer;line-height:1;' +
      'padding:.3rem .5rem;border-radius:9px;white-space:nowrap;' +
      'border:1px solid var(--border,#8884);background:var(--panel,transparent);color:var(--ink,inherit)';
    b.onmouseenter = function () { b.style.background = 'var(--green-soft,rgba(127,127,127,.14))'; };
    b.onmouseleave = function () { b.style.background = 'var(--panel,transparent)'; };
    return b;
  }

  function bump() { rolls += 1; orbit.storage.set('rolls', rolls); }

  orbit.ui('footer_item', function (root) {
    root.style.cssText = 'display:flex;gap:.3rem;align-items:center';

    var die = pill('🎲', 'Roll a die');
    die.onclick = function () {
      var n = 1 + Math.floor(Math.random() * 6);
      orbit.irc.say('🎲 rolled a ' + n);
      bump();
    };

    var coin = pill('🪙', 'Flip a coin');
    coin.onclick = function () {
      orbit.irc.say('🪙 ' + (Math.random() < 0.5 ? 'heads' : 'tails'));
      bump();
    };

    root.appendChild(die);
    root.appendChild(coin);
  });

  log('dice ready (' + rolls + ' rolls remembered)');
});
