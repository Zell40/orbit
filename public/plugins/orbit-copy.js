/*
 * Orbit copy-message plugin — appends a tiny "copy" button after every message.
 *
 * Demonstrates the `message_decorator` hook, which runs for each rendered
 * message and receives a read-only view of it: { id, nick, text, kind, ts, mine }.
 * Each decorator runs inside its own error boundary, so a throw here can never
 * take down the message list.
 *
 * Load via config.json:  "plugins": ["/app/plugins/orbit-copy.js"]
 */
Orbit.plugin('orbit-copy', (orbit, log) => {
  orbit.addMessageDecorator((m) =>
    orbit.html`
      <button
        title="Copy message text"
        style=${{ border: 0, background: 'transparent', cursor: 'pointer', opacity: 0.45, fontSize: '.78rem', padding: 0 }}
        onClick=${() => navigator.clipboard && navigator.clipboard.writeText(m.text)}
      >⧉</button>
    `,
  );
  log('copy decorator ready');
});
