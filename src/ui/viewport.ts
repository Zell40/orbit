// Mobile virtual-keyboard handling.
//
// The app is `position: fixed; top: var(--app-top); height: min(100dvh, var(--app-h))`
// on phones (see index.css). We mirror the VisualViewport — the slice of screen NOT
// covered by the keyboard — into --app-h / --app-top.
//
// Android: `interactive-widget=resizes-content` (index.html) shrinks the layout in
// step with the keyboard; the layout and visual viewport shrink together so our
// height inset reads ~0 and the JS stays out of the way — 100dvh does the work.
//
// iOS is the hard case: the layout does NOT shrink and `visualViewport.resize` fires
// only once the keyboard has finished sliding, so reacting to it alone snaps late.
// Approach (matches the community's "native-feeling" recipe):
//   1. On focus, drop --app-h to the remembered keyboard height so the composer
//      starts rising at t=0, and a CSS transition on `.ios .app`
//      (height .25s cubic-bezier(.32,.72,0,1) — the iOS keyboard curve) glides it up
//      in step with the keyboard.
//   2. HEIGHT only changes on `resize` (settled on iOS) and only when the open/close
//      state actually flips (>60px) — this ignores the predictive/suggestion bar
//      toggling, whose small resizes were making the layout jitter.
//   3. OFFSET (--app-top) tracks every `scroll` frame so the fixed app follows the
//      visual viewport.

const root = document.documentElement;
const KB_KEY = 'tchatou-kbh'; // remembered keyboard height, persisted across reloads
const ua = navigator.userAgent;
const isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const OPEN_THRESHOLD = 60; // px; below this a viewport change isn't the keyboard (suggestion bar, url bar)

let kbInset = 0;
let kbOpen = false;
let lastH = -1, lastTop = -1, hRaf = 0, topRaf = 0;
try { kbInset = parseInt(localStorage.getItem(KB_KEY) || '0', 10) || 0; } catch { /* ignore */ }

function setH(px: number): void {
  const v = Math.round(px);
  if (v === lastH) return;
  root.style.setProperty('--app-h', `${v}px`);
  lastH = v;
  window.dispatchEvent(new Event('tchatou:vh')); // re-pin the message list to the bottom
}
function setTop(px: number): void {
  const v = Math.round(px);
  if (v === lastTop) return;
  root.style.setProperty('--app-top', `${v}px`);
  lastTop = v;
}
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable;
}

// Height: only when the keyboard genuinely opens/closes (state flip past the
// threshold), so the suggestion bar can't jitter the layout. On the flip we snap
// to the exact above-keyboard height; the CSS transition smooths the tiny gap from
// the focus-time estimate.
function onResize(): void {
  hRaf = 0;
  const vv = window.visualViewport;
  if (!vv) return;
  const inset = window.innerHeight - vv.height;
  const open = inset > OPEN_THRESHOLD;
  if (open !== kbOpen) {
    kbOpen = open;
    if (open) {
      kbInset = Math.round(inset);
      try { localStorage.setItem(KB_KEY, String(kbInset)); } catch { /* ignore */ }
      setH(vv.height);
    } else {
      setH(window.innerHeight);
    }
  }
  setTop(vv.offsetTop);
}
function onScroll(): void {
  topRaf = 0;
  const vv = window.visualViewport;
  if (vv) setTop(vv.offsetTop);
}

export function initViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return; // older browsers fall back to CSS 100dvh

  if (isIOS) {
    root.classList.add('ios'); // enables the CSS height transition
    let kbTimer = 0;
    document.addEventListener('focusin', (e) => {
      if (!isEditable(e.target)) return;
      const kb = kbInset || Math.round(window.innerHeight * 0.4); // estimate on the first-ever open
      setH(window.innerHeight - kb); // start the glide now; the transition matches the keyboard
      clearTimeout(kbTimer);
      // Self-heal: no keyboard came up (hardware keyboard / programmatic focus) → undo.
      kbTimer = window.setTimeout(() => { if (vv.height >= window.innerHeight - 40) { kbOpen = false; setH(vv.height); } }, 500);
    });
    document.addEventListener('focusout', (e) => {
      if (!isEditable(e.target)) return;
      clearTimeout(kbTimer);
      setTimeout(() => { if (!isEditable(document.activeElement)) { kbOpen = false; setH(window.innerHeight); } }, 0);
    });
  }

  vv.addEventListener('resize', () => { if (!hRaf) hRaf = requestAnimationFrame(onResize); });
  vv.addEventListener('scroll', () => { if (!topRaf) topRaf = requestAnimationFrame(onScroll); });
  window.addEventListener('orientationchange', () => { kbOpen = false; if (!hRaf) hRaf = requestAnimationFrame(onResize); });
  onResize();
}
