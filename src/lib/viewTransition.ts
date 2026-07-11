import { flushSync } from 'react-dom';

// Run a store update inside a View Transition so the message region (tagged
// view-transition-name: chatview) cross-fades to the newly selected channel.
// flushSync forces React to apply the update synchronously so the browser can
// snapshot the "after" state. Falls back to a plain update where the API is
// missing or the user prefers reduced motion — the transition is cosmetic and
// never required for correctness.
export function switchWithTransition(update: () => void): void {
  const start = (document as unknown as {
    startViewTransition?: (cb: () => void) => unknown;
  }).startViewTransition;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!start || reduce) { update(); return; }
  start.call(document, () => flushSync(update));
}
