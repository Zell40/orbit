// Mobile virtual-keyboard handling.
//
// When the on-screen keyboard opens, `100dvh`/`100vh` do NOT shrink on most
// mobile browsers — and on Firefox for Android they don't shrink at all; only
// the VisualViewport shrinks, and Firefox fires `visualViewport.resize` only
// once the keyboard animation has FINISHED. Driving the layout purely off that
// event looks laggy (full-height during the slide-in, then a snap at the end).
//
// Fix: remember the keyboard's height and PRE-RESIZE the layout instantly on
// focus, then correct to the exact size when the real resize event lands.
//
// Keyboard open/closed state is driven by FOCUS, not by a height heuristic:
// browsers like Firefox Android collapse the URL bar after the first keyboard
// interaction, which changes the full viewport height and would fool any
// "is the viewport shorter than usual?" guess. We instead capture the true
// full height at focusin (before the keyboard opens) on every open, so URL-bar
// changes can't corrupt our reference.
//
// We mirror the live height into `--app-h` and the VisualViewport offset into
// `--app-top` (used by `.app` on mobile); CSS falls back to 100dvh without the
// VisualViewport API.

const root = document.documentElement;
const KB_KEY = 'tchatou-kbh'; // remembered keyboard height, persisted across reloads

let baseH = 0;       // full viewport height with the keyboard CLOSED (captured at focusin)
let kbInset = 0;     // last measured keyboard height (px)
let kbOpen = false;  // is a text field currently focused (keyboard intended open)?
let lastH = -1, lastTop = -1;
let raf = 0;

try { kbInset = parseInt(localStorage.getItem(KB_KEY) || '0', 10) || 0; } catch { /* ignore */ }

function setH(px: number): void {
  const v = Math.round(px);
  if (v !== lastH) {
    root.style.setProperty('--app-h', `${v}px`);
    lastH = v;
    // Let the message list re-pin to the bottom in step with the resize.
    window.dispatchEvent(new Event('tchatou:vh'));
  }
}
function setTop(px: number): void {
  const v = Math.round(px);
  if (v !== lastTop) { root.style.setProperty('--app-top', `${v}px`); lastTop = v; }
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

// Authoritative update from the actual VisualViewport size. While the keyboard
// is open this gives us the exact geometry to remember & correct to.
function apply(): void {
  raf = 0;
  const vv = window.visualViewport;
  if (!vv) return;
  const h = vv.height;
  if (kbOpen) {
    const inset = baseH - h;
    if (inset > 40) { // keyboard genuinely up — remember its height
      kbInset = inset;
      try { localStorage.setItem(KB_KEY, String(Math.round(inset))); } catch { /* ignore */ }
    } else if (!isEditable(document.activeElement)) {
      // We thought the keyboard was open, but the viewport is back to full
      // height and nothing editable is focused — e.g. the focused input was
      // unmounted (login succeeded) so no focusout fired. Self-heal.
      kbOpen = false;
      baseH = h;
    }
  } else {
    baseH = h; // keyboard closed: track the true full height
  }
  setH(h);
  setTop(vv.offsetTop);
}

function schedule(): void {
  if (!raf) raf = requestAnimationFrame(apply);
}

export function initViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return; // older browsers: CSS falls back to 100dvh
  baseH = vv.height;

  document.addEventListener('focusin', (e) => {
    if (!isEditable(e.target)) return;
    if (kbOpen) return;             // switching between fields — keyboard already up
    kbOpen = true;
    baseH = vv.height;              // true full height, captured BEFORE the keyboard opens
    if (kbInset > 0) setH(baseH - kbInset); // pre-resize instantly; keyboard slides into the gap
  });

  document.addEventListener('focusout', (e) => {
    if (!isEditable(e.target)) return;
    // Defer a tick: focus may just be moving to another field.
    setTimeout(() => {
      if (isEditable(document.activeElement)) return;
      kbOpen = false;
      setH(baseH); // grow back instantly
      setTop(0);
    }, 0);
  });

  // `resize` fires when the keyboard finishes opening/closing; `scroll` fires as
  // the visual viewport shifts while a field is focused.
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', () => { kbOpen = false; baseH = vv.height; schedule(); });
  apply();
}
