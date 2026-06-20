/*
 * Orbit copy-message plugin — appends a tiny "copy" button after every message.
 * Clicking copies the text and briefly flips the icon to a green check, then
 * reverts — the familiar "copied!" confirmation pattern.
 *
 * Demonstrates the `message_decorator` hook, which runs for each rendered
 * message and receives a read-only view of it: { id, nick, text, kind, ts, mine }.
 * Because the button has its own state, it's a real component rendered via
 * orbit.h(...), so each row keeps its own copied/not-copied state. Each decorator
 * runs inside its own error boundary, so a throw here can never take down the list.
 *
 * Load via config.json:  "plugins": ["/app/plugins/orbit-copy.js"]
 */
Orbit.plugin('orbit-copy', (orbit, log) => {
  const { useState, useRef, useEffect } = orbit.React;

  function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(0);
    // Clear the pending revert if the row unmounts mid-animation.
    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = () => {
      const flash = () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flash).catch(() => {});
      }
    };

    return orbit.html`
      <button
        title=${copied ? 'Copied!' : 'Copy message text'}
        aria-label=${copied ? 'Copied' : 'Copy message text'}
        onClick=${copy}
        style=${{
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
          fontSize: '.78rem',
          lineHeight: 1,
          color: copied ? '#2ea043' : 'inherit',
          opacity: copied ? 1 : 0.45,
          transform: copied ? 'scale(1.15)' : 'scale(1)',
          transition: 'opacity .15s ease, color .15s ease, transform .15s ease',
        }}
      >${copied ? '✓' : '⧉'}</button>
    `;
  }

  orbit.addMessageDecorator((m) => orbit.h(CopyButton, { text: m.text }));
  log('copy decorator ready');
});
