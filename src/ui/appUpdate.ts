// Seamless in-place updates.
//
// A deploy stamps dist/version.json with the git commit; the running app carries
// its own commit in __GIT_COMMIT__. We poll version.json when the tab regains
// focus (so a fresh deploy is picked up WITHOUT a manual reload) and, when it
// differs, cross-fade a themed curtain and reload — masking the browser's hard
// navigation so it reads as an internal refresh, not a page load. If the user is
// mid-message we defer until the composer is empty (or the tab is hidden) so a
// half-typed line is never yanked away.

const FLAG = 'orbit:just-updated';   // set right before reload, read on next boot
const BG_KEY = 'orbit:update-bg';    // themed --bg, restored pre-paint (index.html) to avoid a flash
const TRIED = 'orbit:update-tried';  // commit we already reloaded for — a reload-loop guard

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

let reloading = false;
let pendingCommit = '';

// The user has unsent text in the composer — don't reload out from under them.
function composerBusy(): boolean {
  const el = document.querySelector('.composer__rich');
  return !!el?.textContent && el.textContent.trim().length > 0;
}

// A full-viewport curtain in the theme's own --bg (so it and the reloaded page's
// background are one continuous colour) with a centred spinner. Reused for both
// the fade-out before reload and the cover-until-mounted after it.
function buildCurtain(opacity: string): HTMLElement {
  const existing = document.getElementById('orbit-update');
  if (existing) return existing;
  const cs = getComputedStyle(document.documentElement);
  const bg = cs.getPropertyValue('--bg').trim() || '#101012';
  const accent = cs.getPropertyValue('--accent').trim() || '#888';
  const el = document.createElement('div');
  el.id = 'orbit-update';
  el.setAttribute('style',
    `position:fixed;inset:0;z-index:2147483647;background:${bg};` +
    'display:flex;align-items:center;justify-content:center;' +
    `opacity:${opacity};transition:opacity .3s ease`);
  const spin = document.createElement('div');
  spin.setAttribute('style',
    'width:28px;height:28px;border-radius:50%;' +
    `border:2.5px solid ${accent}33;border-top-color:${accent};` +
    'animation:orbit-update-spin .7s linear infinite');
  el.appendChild(spin);
  if (!document.getElementById('orbit-update-kf')) {
    const st = document.createElement('style');
    st.id = 'orbit-update-kf';
    st.textContent = '@keyframes orbit-update-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  document.body.appendChild(el);
  return el;
}

function applyUpdate(toCommit: string): void {
  if (reloading) return;
  reloading = true;
  try {
    sessionStorage.setItem(FLAG, '1');
    if (toCommit) sessionStorage.setItem(TRIED, toCommit);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) sessionStorage.setItem(BG_KEY, bg);
  } catch { /* private mode: no persistence, still reloads */ }
  const el = buildCurtain('0');
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => window.location.reload(), 320); // let the curtain fade in first
}

// Reload now if it's a safe moment; otherwise remember the target and wait.
function requestUpdate(toCommit: string): void {
  if (reloading) return;
  if (composerBusy() && document.visibilityState === 'visible') { pendingCommit = toCommit; return; }
  applyUpdate(toCommit);
}

async function checkVersion(): Promise<void> {
  if (reloading || !__GIT_COMMIT__) return;
  let commit: string;
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    commit = (await res.json())?.commit || '';
  } catch { return; }
  if (!commit || commit === __GIT_COMMIT__) return;
  try { if (sessionStorage.getItem(TRIED) === commit) return; } catch { /* ignore */ }
  requestUpdate(commit);
}

// Boot: if the last load reloaded FOR an update, hold a themed curtain up until the
// app has mounted (dismissUpdateCurtain), so the fresh page fades in, never pops.
export function markUpdateCurtain(): void {
  try { if (sessionStorage.getItem(FLAG) !== '1') return; } catch { return; }
  try { sessionStorage.removeItem(FLAG); sessionStorage.removeItem(BG_KEY); } catch { /* ignore */ }
  buildCurtain('1');
}

export function dismissUpdateCurtain(): void {
  const el = document.getElementById('orbit-update');
  document.documentElement.style.background = ''; // drop the pre-paint bg set in index.html
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 320);
}

let lastCheck = 0;
export function registerAppUpdates(): void {
  const maybeCheck = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastCheck < 20000) return; // throttle focus storms
    lastCheck = now;
    void checkVersion();
  };

  // Pick up a fresh deploy on the next focus/visibility, plus a slow heartbeat for
  // always-open sessions. Also flush a deferred update when it's finally safe.
  document.addEventListener('visibilitychange', () => {
    if (pendingCommit && document.visibilityState === 'hidden') { const c = pendingCommit; pendingCommit = ''; applyUpdate(c); }
    maybeCheck();
  });
  window.addEventListener('focus', maybeCheck);
  document.addEventListener('input', () => {
    if (pendingCommit && !composerBusy()) { const c = pendingCommit; pendingCommit = ''; requestUpdate(c); }
  }, true);
  setInterval(maybeCheck, 15 * 60 * 1000);
  maybeCheck();

  // The service worker still powers offline + web push; a changed SW (cache bump)
  // is an update signal too. Registration stays here so it's the single owner.
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) requestUpdate(''); });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => { /* ignore */ });
    });
  }
}
