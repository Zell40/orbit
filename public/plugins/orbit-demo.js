/*
 * Orbit demo plugin — a minimal, self-contained example.
 *
 * Load it by adding to config.json:  "plugins": ["/app/plugins/orbit-demo.js"]
 *
 * Shows the core API surface: Orbit.plugin(), the html`` tagged-template (HTM),
 * a composer-button UI slot, an IRC action, and event hooks.
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
});
