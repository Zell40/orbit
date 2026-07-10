// Registers the service worker (installable PWA, offline shell, web push).
// No auto-reload: a new build applies on the next manual refresh or app reopen.
export function registerAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => { /* ignore */ });
  });
}
