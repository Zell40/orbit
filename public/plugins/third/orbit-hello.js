/*
 * Template plugin — copy this to start your own. Shows the SDK essentials: a themed
 * nav panel, a slash command, and a keyboard shortcut, in a handful of lines. The
 * SDK handles theming, frame sizing, upward growth and the open animation.
 *
 * To load it, add to config.json (drop "irc" if you don't call it):
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

  // A slash command: "/hello world" -> says "hi world".
  orbit.command('hello', function (args, rest) {
    orbit.irc.say('hi ' + (rest || 'there') + '!');
  }, 'say hi in the channel');

  // A keyboard shortcut (a modifier is required).
  orbit.shortcut('mod+shift+h', function () {
    orbit.notify('Hello', 'shortcut pressed');
  });
});
