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

async function deployedCommit(): Promise<string> {
  try {
    const r = await fetch('/app/version.json', { cache: 'no-cache' });
    if (!r.ok) return '';
    const j = (await r.json()) as { commit?: string };
    return typeof j.commit === 'string' ? j.commit : '';
  } catch {
    return '';
  }
}

function seenKey(commit: string): string {
  return commit ? `orbit-upd:${commit}` : 'orbit-upd:waiting';
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

/** Leftover waiting SW: toast once per deploy (keyed by version.json commit). */
async function offerWaitingUpdate(reg: ServiceWorkerRegistration): Promise<void> {
  const w = reg.waiting;
  if (!w || !navigator.serviceWorker.controller) return;
  const commit = await deployedCommit();
  const key = seenKey(commit);
  try {
    if (sessionStorage.getItem(key)) {
      // Already prompted for this build (e.g. after F5) — activate quietly so the
      // waiting worker does not stick forever. Navigate is network-first.
      w.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    sessionStorage.setItem(key, '1');
  } catch { /* private mode — still announce */ }
  announceUpdate();
}

export function registerAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).then((reg) => {
      // Deploy finished while we were away / in background: offer reload once.
      void offerWaitingUpdate(reg);

      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        const check = () => {
          // New deploy while this tab is open — ask the user to reload.
          // Check immediately: installing may already be "installed" before the
          // statechange listener is attached (fast cache / small SW).
          if (w.state !== 'installed' || !navigator.serviceWorker.controller) return;
          void (async () => {
            const commit = await deployedCommit();
            try { sessionStorage.setItem(seenKey(commit), '1'); } catch { /* ignore */ }
            announceUpdate();
          })();
        };
        w.addEventListener('statechange', check);
        check();
      });

      const poke = () => { void reg.update().then(() => offerWaitingUpdate(reg)); };
      window.setInterval(poke, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') poke();
      });
    }).catch(() => { /* ignore */ });
  };
  // After IRC is up (or 10s on the join form) so a new SW cannot race the
  // websocket handshake. claim() is not used; this is belt and braces.
  void import('../modules/bus').then(({ bus }) => bus.once('boot:ready', start));
  window.addEventListener('load', () => { window.setTimeout(start, 10_000); }, { once: true });
}
