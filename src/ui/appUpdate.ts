// Registers the service worker (installable PWA, offline shell, web push).
// A waiting worker means a new deploy is cached: we toast so the user can
// reload (skipWaiting) instead of staying on a stale bundle.
const UPDATE_EVT = 'orbit-app-update';

function announceUpdate() {
  window.dispatchEvent(new Event(UPDATE_EVT));
}

export function onAppUpdate(fn: () => void): () => void {
  window.addEventListener(UPDATE_EVT, fn);
  return () => window.removeEventListener(UPDATE_EVT, fn);
}

export function applyAppUpdate(): void {
  void navigator.serviceWorker?.getRegistration().then((reg) => {
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    location.reload();
  });
}

export function registerAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) announceUpdate();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) announceUpdate();
        });
      });
      window.setInterval(() => { void reg.update(); }, 30 * 60 * 1000);
    }).catch(() => { /* ignore */ });
  });
}
