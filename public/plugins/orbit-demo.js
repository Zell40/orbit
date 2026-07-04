/*
 * Orbit demo plugin — a minimal, self-contained example.
 *
 * Load it by adding to config.json:  "plugins": ["/app/plugins/orbit-demo.js"]
 *
 * Shows the core API surface: Orbit.plugin(), the html`` tagged-template (HTM),
 * composer-button + footer-item UI slots, an IRC action, and event hooks.
 */
Orbit.plugin('orbit-demo', (orbit, log) => {
  log('hello from the demo plugin — Orbit v' + orbit.version + ' (' + orbit.commit + ')');

  // React to app lifecycle + incoming messages.
  orbit.on('connected', ({ nick }) => log('connected as', nick));
  orbit.on('message', (m) => log('message in', m.target, 'from', m.from, '→', m.text));

  // Add a button to the composer that rolls a die into the current channel.
  orbit.addUi('composer_button', () =>
    orbit.html`
      <button
        class="composer__emoji"
        title="Roll a die (demo plugin)"
        onClick=${() => orbit.irc.say('🎲 rolled a ' + (1 + Math.floor(Math.random() * 6)))}
      >🎲</button>
    `,
  );

  // Add a button to the app footer bar (next to away / settings). Use the native
  // `appbar__act` class so it matches the built-in footer buttons.
  orbit.addUi('footer_item', () =>
    orbit.html`
      <button
        class="appbar__act"
        title=${orbit.i18n.pick({ en: 'Wave (demo plugin)', fr: 'Coucou (plugin démo)' })}
        onClick=${() => orbit.irc.say('👋')}
      >👋</button>
    `,
  );

  // Register a slash command: /roll [sides] rolls a die into the current channel.
  orbit.addCommand('roll', {
    help: 'Roll a die: /roll [sides]',
    run: (args) => orbit.irc.say('\u{1F3B2} ' + (1 + Math.floor(Math.random() * Math.max(2, +args[0] || 6)))),
  });

  // Register a keyboard shortcut: mod+shift+d fires a notification.
  orbit.addShortcut('mod+shift+d', () => orbit.notify('Demo plugin', 'shortcut fired'));
});
