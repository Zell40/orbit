// Registers the service worker (installable PWA, offline shell, web push).
// A waiting worker means a new deploy is available. We toast so the user can
// reload. Navigate is network-first, so a normal refresh loads the new build
// without skipWaiting (which would claim the page and kill the IRC websocket).
const UPDATE_EVT = 'orbit-app-update';

function announceUpdate() {
  window.dispatchEvent(new Event(UPDATE_EVT));
}

export function onAppUpdate(fn: () => void): () => void {
  window.addEventListener(UPDATE_EVT, fn);
  return () => window.removeEventListener(UPDATE_EVT, fn);
}

export function applyAppUpdate(): void {
  void (async () => {
    try {
      const { armLeaveWithoutPrompt } = await import('../core/direct-reconnect');
      armLeaveWithoutPrompt();
      const { useNetworks } = await import('../core/networks');
      for (const n of useNetworks.getState().networks) {
        try { n.store.getState().client?.disconnect('Mise à jour'); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    window.setTimeout(() => location.reload(), 200);
  })();
}

export function registerAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
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
  };
  // After IRC is up (or 10s on the join form) so a new SW cannot race the
  // websocket handshake. claim() is no longer used; this is belt and braces.
  void import('../modules/bus').then(({ bus }) => bus.once('boot:ready', start));
  window.addEventListener('load', () => { window.setTimeout(start, 10_000); }, { once: true });
}
