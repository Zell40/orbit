/*
 * Orbit copy-message plugin — adds a copy button to each message's hover action
 * toolbar (next to reply / react). Clicking copies the text and briefly flips the
 * icon to a green check, then reverts — the familiar "copied!" confirmation.
 *
 * Demonstrates the `message_action` hook, which adds a button to every message's
 * action toolbar and receives a read-only view of the message:
 * { id, nick, text, raw, kind, ts, mine } — `text` is formatting-stripped (so the
 * copy is clean), `raw` keeps the mIRC codes. The button inherits the toolbar styling,
 * so it sits cleanly beside the built-in actions. Each contribution runs inside
 * its own error boundary, so a throw here can never take down the message list.
 *
 * (For inline badges/chips after the text instead, see `addMessageDecorator`.)
 *
 * Load via config.json:  "plugins": ["/app/plugins/orbit-copy.js"]
 */
Orbit.plugin('orbit-copy', (orbit, log) => {
  const { useState, useRef, useEffect } = orbit.React;

  function CopyAction({ text }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(0);
    // Cancel a pending revert if the row unmounts mid-animation.
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

    // No layout styles — inherit the toolbar button look; only tint green when copied.
    return orbit.html`
      <button
        title=${copied ? orbit.i18n.t('plugins.copy.copied') : orbit.i18n.t('plugins.copy.title')}
        aria-label=${copied ? orbit.i18n.t('plugins.copy.copiedShort') : orbit.i18n.t('plugins.copy.title')}
        onClick=${copy}
        style=${{ color: copied ? '#2ea043' : undefined }}
      >${copied ? '✓' : '⧉'}</button>
    `;
  }

  orbit.addMessageAction((m) => orbit.h(CopyAction, { text: m.text }));
  log('copy action ready');
});
