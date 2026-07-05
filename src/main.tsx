import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getTheme, hydrateTheme, useThemeStore } from './themes'
import i18n, { applyConfigDefaultLang } from './core/i18n'
import './index.css'
// Alternate themes, loaded after the base so their [data-theme] rules win.
import './themes/dark.css'
import './themes/orbit.css'
import './themes/yomirc.css'
import { initViewport } from './ui/viewport.ts'
import { loadConfig, getConfig } from './core/config.ts'
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

// A retro Win98-style tab icon for the yomirc skins: a beveled silver tile with
// a navy #, so the classic theme gets a matching classic favicon.
const MIRC_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">'
  + '<rect width="32" height="32" fill="#c0c0c0"/>'
  + '<path d="M0 0h32v2H2v30H0z" fill="#fff"/><path d="M32 0v32H0v-2h30V0z" fill="#808080"/>'
  + '<rect x="3" y="3" width="26" height="6" fill="#000080"/>'          // caption bar
  + '<rect x="3" y="9" width="26" height="20" fill="#fff"/>'            // white log
  + '<rect x="5" y="12" width="15" height="2" fill="#009300"/>'         // green line
  + '<rect x="5" y="16" width="21" height="2" fill="#00007f"/>'         // blue line
  + '<rect x="5" y="20" width="11" height="2" fill="#ff0000"/>'         // red line
  + '<rect x="5" y="24" width="18" height="2" fill="#7f7f7f"/></svg>')  // grey line

// Browser tab icon: the retro favicon under yomirc, else the configured brand
// icon (index.html ships a static default for the pre-JS paint).
function applyBrandIcon() {
  try {
    const accent = getConfig().branding?.accent
    if (accent) document.documentElement.style.setProperty('--accent', accent) // config accent token
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    const mirc = getTheme().startsWith('yomirc')
    if (mirc) link.type = 'image/svg+xml'; else link.removeAttribute('type')
    const icon = mirc ? MIRC_FAVICON : getConfig().branding?.icon
    if (icon) link.href = icon
    const name = getConfig().branding?.name
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (m && name) m.setAttribute('content', name) // iOS home-screen title
  } catch { /* keep the static favicon */ }
}
// Swap the favicon when the theme changes (into or out of yomirc).
useThemeStore.subscribe((s, prev) => { if (s.theme !== prev.theme) applyBrandIcon() })

// Load runtime config.json FIRST, then import App (so the store initialises with
// the resolved config). Keeps the client fully re-pointable/re-brandable without
// a rebuild.
loadConfig().then(async () => {
  hydrateTheme() // first-time visitors adopt the config default now config is loaded
  applyConfigDefaultLang(getConfig().defaults.lang) // honour a config-pinned default language
  void localizeManifest() // re-serve the PWA manifest with a localized name/description
  applyBrandIcon()        // browser tab favicon follows config.branding.icon
  const { default: App } = await import('./App.tsx') // also creates the store
  // Plugin subsystem: publish window.Orbit, bridge app/IRC events onto the bus,
  // then load operator-listed plugins from config. After the store exists,
  // before render (plugin-contributed UI registers reactively).
  const { initPlugins } = await import('./modules')
  initPlugins()

  // Core sandboxed features the app ships itself (isolated + capability-gated),
  // mounted by core — no config.json entry needed.
  void import('./modules/sandbox/builtins').then((m) => m.mountBuiltins())

  // Multi-network: reconnect any extra networks the user had before a reload.
  if (getConfig().features.multiNetwork) {
    try { (await import('./core/networks')).restoreNetworks() } catch { /* ignore */ }
  }

  // Site handoff: if the entry form sent us here, auto-connect with the nick and
  // channels from the URL plus any SASL password parked in sessionStorage, and
  // mark the store so the first paint is a "connecting" splash, not the join
  // form. Direct visits (no marker) fall through to the normal join screen.
  const { takeHandoff } = await import('./core/handoff')
  const handoff = takeHandoff()
  const nick = new URLSearchParams(window.location.search).get('nick')?.trim()
  if (handoff && nick) {
    const { useChat } = await import('./core/store')
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
