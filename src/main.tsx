import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, getTheme } from './ui/theme.ts'
import './i18n'
import './index.css'
import { initViewport } from './ui/viewport.ts'
import { loadConfig } from './config.ts'

// Track the visual viewport so the layout shrinks above the on-screen keyboard.
initViewport()

// Load runtime config.json FIRST, then import App (so the store initialises with
// the resolved config). Keeps the client fully re-pointable/re-brandable without
// a rebuild.
loadConfig().then(async () => {
  applyTheme(getTheme()) // re-apply now that config (default theme) is loaded
  const { default: App } = await import('./App.tsx') // also creates the store
  // Plugin subsystem: publish window.Orbit, bridge app/IRC events onto the bus,
  // then load operator-listed plugins from config. After the store exists,
  // before render (plugin-contributed UI registers reactively).
  const { initPlugins } = await import('./plugins')
  initPlugins()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// PWA: register the service worker (installable + offline app shell) and
// auto-apply updates. The SW calls skipWaiting()+clients.claim(), so when a new
// build is deployed it takes control and fires `controllerchange` — we reload
// once (guarded against loops) so users always get the latest app without a
// manual hard-refresh.
if ('serviceWorker' in navigator) {
  // Only an *existing* controller means this is an update (not the first-ever
  // install, where clients.claim() also fires controllerchange).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })
      .then((reg) => {
        // Poll for a new SW occasionally (e.g. long-lived PWA sessions).
        setInterval(() => { void reg.update(); }, 60 * 60 * 1000);
      })
      .catch(() => { /* ignore */ });
  });
}
