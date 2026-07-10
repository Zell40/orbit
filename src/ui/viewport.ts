// Mobile virtual-keyboard handling.
//
// On phones the app is `position: fixed; top: var(--app-top); height: min(100dvh,
// var(--app-h))` (see index.css). We mirror the VisualViewport — the slice of screen
// NOT covered by the keyboard — into --app-h / --app-top so the app always sits
// exactly above the keyboard on iOS (where the layout viewport doesn't shrink) and
// stays in sync on Android (where interactive-widget=resizes-content shrinks it).
//
// We track the VisualViewport DIRECTLY, with no pre-resize guessing. Guessing the
// keyboard height and resizing on focus fought the browser's own resize and left a
// broken first-open that needed a second tap; one authoritative source is smooth and
// self-healing (an unmounted input just fires resize and the app grows back).

const root = document.documentElement;
let lastH = -1, lastTop = -1, raf = 0;

function apply(): void {
  raf = 0;
  const vv = window.visualViewport;
  if (!vv) return;
  const h = Math.round(vv.height);
  const top = Math.round(vv.offsetTop);
  if (h !== lastH) {
    root.style.setProperty('--app-h', `${h}px`);
    lastH = h;
    window.dispatchEvent(new Event('tchatou:vh')); // re-pin the message list to the bottom
  }
  if (top !== lastTop) {
    root.style.setProperty('--app-top', `${top}px`);
    lastTop = top;
  }
}

function schedule(): void { if (!raf) raf = requestAnimationFrame(apply); }

export function initViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return; // older browsers fall back to CSS 100dvh
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  apply();
}
