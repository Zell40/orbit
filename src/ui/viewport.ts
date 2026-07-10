// Mobile virtual-keyboard handling.
//
// The app is `position: fixed; top: var(--app-top); height: min(100dvh, var(--app-h))`
// on phones (see index.css). We mirror the VisualViewport — the slice of screen NOT
// covered by the keyboard — into --app-h / --app-top.
//
// Android: `interactive-widget=resizes-content` (index.html) shrinks the layout in
// step with the keyboard, so mirroring is smooth for free.
//
// iOS does NOT resize the layout and fires `visualViewport.resize` only once the
// keyboard has FINISHED sliding up — so mirroring alone makes the app snap up late
// ("the keyboard opens faster than the app"). Fix: on iOS, the instant a field is
// focused we drop --app-h to the remembered keyboard height and a CSS transition
// (`.ios .app` in index.css) glides the composer up in step with the keyboard; the
// real resize event then corrects to the exact height. The transition also smooths
// that correction, so an imperfect estimate never snaps.

const root = document.documentElement;
const KB_KEY = 'tchatou-kbh'; // remembered keyboard height, persisted across reloads
const ua = navigator.userAgent;
const isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let kbInset = 0;
let lastH = -1, lastTop = -1, raf = 0;
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

function apply(): void {
  raf = 0;
  const vv = window.visualViewport;
  if (!vv) return;
  // While the keyboard is up the layout height (innerHeight) stays full on iOS, so
  // innerHeight - vv.height is the true keyboard inset — remember it for next time.
  const inset = window.innerHeight - vv.height;
  if (inset > 80) {
    kbInset = Math.round(inset);
    try { localStorage.setItem(KB_KEY, String(kbInset)); } catch { /* ignore */ }
  }
  setH(vv.height);
  setTop(vv.offsetTop);
}
function schedule(): void { if (!raf) raf = requestAnimationFrame(apply); }

export function initViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return; // older browsers fall back to CSS 100dvh

  if (isIOS) {
    root.classList.add('ios'); // enables the CSS height transition
    let kbTimer = 0;
    document.addEventListener('focusin', (e) => {
      if (!isEditable(e.target)) return;
      const kb = kbInset || Math.round(window.innerHeight * 0.4); // estimate on the first-ever open
      setH(window.innerHeight - kb); // start the composer rising now; the CSS transition glides it up
      // Self-heal: if no keyboard actually came up (hardware keyboard / programmatic
      // focus), the resize event never fires — undo the pre-resize after it should have.
      clearTimeout(kbTimer);
      kbTimer = window.setTimeout(() => { if (vv.height >= window.innerHeight - 40) setH(vv.height); }, 450);
    });
    document.addEventListener('focusout', (e) => {
      if (!isEditable(e.target)) return;
      clearTimeout(kbTimer);
      // Defer a tick — focus may just be moving to another field.
      setTimeout(() => { if (!isEditable(document.activeElement)) setH(window.innerHeight); }, 0);
    });
  }

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  apply();
}
