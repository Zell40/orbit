// Registers the service worker (installable PWA, offline shell, web push).
// A waiting worker means a new deploy is available. We toast so the user can
// reload. Navigate is network-first, so a normal refresh loads the new build.
// skipWaiting only when the user clicks Recharger (never clients.claim — that
// used to abort the IRC websocket mid-handshake).
const UPDATE_EVT = 'orbit-app-update';

function announceUpdate() {
  window.dispatchEvent(new Event(UPDATE_EVT));
}

export function onAppUpdate(fn: () => void): () => void {
  window.addEventListener(UPDATE_EVT, fn);
  return () => window.removeEventListener(UPDATE_EVT, fn);
}

async function activateWaitingWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/app/');
  const waiting = reg?.waiting;
  if (!waiting) return;
  await new Promise<void>((resolve) => {
    const done = () => { navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
    navigator.serviceWorker.addEventListener('controllerchange', done);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // If the active SW never yields (old build without the message handler),
    // don't hang the reload forever.
    window.setTimeout(done, 1500);
  });
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
    try { await activateWaitingWorker(); } catch { /* ignore */ }
    location.reload();
  })();
}

export function registerAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).then((reg) => {
      // A waiting SW left over from a previous visit: activate it quietly.
      // Navigate is already network-first, so this page has the new shell —
      // toasting again after every F5 was wrong (skipWaiting was never asked).
      if (reg.waiting && navigator.serviceWorker.controller) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          // New deploy while this tab is open — ask the user to reload once.
          if (w.state === 'installed' && navigator.serviceWorker.controller) announceUpdate();
        });
      });
      window.setInterval(() => { void reg.update(); }, 30 * 60 * 1000);
    }).catch(() => { /* ignore */ });
  };
  // After IRC is up (or 10s on the join form) so a new SW cannot race the
  // websocket handshake. claim() is not used; this is belt and braces.
  void import('../modules/bus').then(({ bus }) => bus.once('boot:ready', start));
  window.addEventListener('load', () => { window.setTimeout(start, 10_000); }, { once: true });
}
