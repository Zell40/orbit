import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme, getTheme } from './ui/theme.ts'
import i18n, { applyConfigDefaultLang } from './i18n'
import './index.css'
import { initViewport } from './ui/viewport.ts'
import { loadConfig, getConfig } from './config.ts'
import { AppErrorBoundary } from './components/AppErrorBoundary'

// Track the visual viewport so the layout shrinks above the on-screen keyboard.
initViewport()

// PWA install prompt: the static manifest.webmanifest is one language; re-serve
// it (as a blob) with the brand name + a description in the visitor's language.
// Icons/colors are kept from the file; root-relative icon paths still resolve.
async function localizeManifest() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}manifest.webmanifest`, { cache: 'force-cache' })
    if (!res.ok) return
    const m = await res.json()
    const brand = getConfig().branding?.name || m.short_name || 'Orbit'
    m.name = brand
    m.short_name = brand
    m.description = i18n.t('pwa.description', { defaultValue: m.description }) as string
    m.lang = i18n.language
    const url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }))
    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
    if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link) }
    link.setAttribute('href', url)
  } catch { /* keep the static manifest */ }
}

// Browser tab icon follows the configured brand icon (index.html ships a static
// default for the pre-JS paint; here we point it at config.branding.icon).
function applyBrandIcon() {
  try {
    const icon = getConfig().branding?.icon
    if (!icon) return
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = icon
    const name = getConfig().branding?.name
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (m && name) m.setAttribute('content', name) // iOS home-screen title
  } catch { /* keep the static favicon */ }
}

// Load runtime config.json FIRST, then import App (so the store initialises with
// the resolved config). Keeps the client fully re-pointable/re-brandable without
// a rebuild.
loadConfig().then(async () => {
  applyTheme(getTheme()) // re-apply now that config (default theme) is loaded
  applyConfigDefaultLang(getConfig().defaults.lang) // honour a config-pinned default language
  void localizeManifest() // re-serve the PWA manifest with a localized name/description
  applyBrandIcon()        // browser tab favicon follows config.branding.icon
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
