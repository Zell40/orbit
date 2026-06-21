import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, getTheme } from './ui/theme.ts'
import './i18n'
import { applyConfigDefaultLang } from './i18n'
import './index.css'
import { initViewport } from './ui/viewport.ts'
import { loadConfig, getConfig } from './config.ts'
import { AppErrorBoundary } from './components/AppErrorBoundary'

// Track the visual viewport so the layout shrinks above the on-screen keyboard.
initViewport()

// Load runtime config.json FIRST, then import App (so the store initialises with
// the resolved config). Keeps the client fully re-pointable/re-brandable without
// a rebuild.
loadConfig().then(async () => {
  applyTheme(getTheme()) // re-apply now that config (default theme) is loaded
  applyConfigDefaultLang(getConfig().defaults.lang) // honour a config-pinned default language
  const { default: App } = await import('./App.tsx') // also creates the store
  // Plugin subsystem: publish window.Orbit, bridge app/IRC events onto the bus,
  // then load operator-listed plugins from config. After the store exists,
  // before render (plugin-contributed UI registers reactively).
  const { initPlugins } = await import('./plugins')
  initPlugins()

  // Site handoff: if the entry form sent us here, auto-connect with the nick and
  // channels from the URL plus any SASL password parked in sessionStorage, and
  // mark the store so the first paint is a "connecting" splash, not the join
  // form. Direct visits (no marker) fall through to the normal join screen.
  const { takeHandoff } = await import('./handoff')
  const handoff = takeHandoff()
  const nick = new URLSearchParams(window.location.search).get('nick')?.trim()
  if (handoff && nick) {
    const { useChat } = await import('./store')
    const cfg = getConfig()
    const channels = (new URLSearchParams(window.location.search).get('channel') || cfg.startup.channels.join(','))
      .split(',').map((c) => c.trim()).filter(Boolean)
    useChat.setState({ autoConnecting: true })
    useChat.getState().connect({ url: cfg.server.url, nick, password: handoff.password, channels })
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
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
