/*
 * Template plugin — copy this to start your own. A themed nav panel in ~15 lines,
 * built entirely with the SDK (orbit.panel + orbit.el). The SDK handles theming,
 * the frame sizing, upward growth and the open animation — you just declare content.
 *
 * To load it, add to config.json (drop "irc" from permissions if you don't call it):
 *   { "url": "/app/plugins/third/orbit-hello.js", "sandbox": true, "permissions": ["irc"] }
 */
Orbit.plugin('orbit-hello', function (orbit) {
  orbit.panel({
    slot: 'nav_item',
    icon: '👋',
    label: 'Hello',
    title: 'Hello',
    render: function (body, panel) {
      body.appendChild(orbit.el.row('You are ' + (orbit.state.nick() || '…'), 'in ' + (orbit.state.active() || '—')));
      var say = orbit.el.button('Say hi 👋', function () {
        orbit.irc.say('hi from a plugin!');
        panel.close();
      });
      say.style.marginTop = '8px';
      body.appendChild(say);
    },
  });
});
