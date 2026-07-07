import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getTheme, hydrateTheme, useThemeStore } from './themes'
import { applyConfigDefaultLang } from './core/i18n'
import './index.css'
// Alternate themes, loaded after the base so their [data-theme] rules win.
import './themes/dark.css'
import './themes/orbit.css'
import './themes/yomirc.css'
import { initViewport } from './ui/viewport.ts'
import { registerAppUpdates, markUpdateCurtain } from './ui/appUpdate.ts'
import { loadConfig, getConfig } from './core/config.ts'
import { AppErrorBoundary } from './components/AppErrorBoundary'

// If the last load reloaded to pick up a new build, hold a themed curtain up until
// the app mounts (dismissed in App) so the fresh page fades in instead of popping.
markUpdateCurtain()

// Track the visual viewport so the layout shrinks above the on-screen keyboard.
initViewport()

// The PWA manifest is the STATIC /app/manifest.webmanifest linked in index.html.
// (We used to re-serve a localized copy as a blob: URL, but a manifest's scope /
// start_url must sit within the manifest URL's own directory — a blob: URL has no
// /app/ directory, so the browser rejected scope/start_url and the manifest broke.
// A deployer localizes/re-brands by editing the static file.)

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
  const params = new URLSearchParams(window.location.search)
  const nick = params.get('nick')?.trim()
  const { useChat } = await import('./core/store')
  const cfg = getConfig()
  // After an auto-connect, drop the entry params from the address bar so a later
  // reload/reopen is param-less and resumes cleanly (the branch below).
  const cleanUrl = () => { try { history.replaceState(null, '', window.location.pathname) } catch { /* ignore */ } }
  if (handoff && nick) {
    const channels = (params.get('channel') || cfg.startup.channels.join(','))
      .split(',').map((c) => c.trim()).filter(Boolean)
    useChat.setState({ autoConnecting: true })
    useChat.getState().connect({ url: cfg.server.url, nick, password: handoff.password, channels })
    cleanUrl()
  } else if (!nick && cfg.features.sessionResume) {
    // No fresh site entry — resume the last session (opt-in). A still-signed-in
    // member gets a fresh single-use keycard from their website session; a guest
    // just reconnects under the same nick. No password is ever read from storage.
    const { loadResume } = await import('./core/resume')
    const resume = loadResume()
    if (resume) {
      let password: string | undefined
      let resumeNick = resume.nick
      let go = !resume.account // guests reconnect unconditionally
      if (resume.account) {
        try {
          const ctrl = new AbortController()
          const to = setTimeout(() => ctrl.abort(), 4000) // never let a hung endpoint stall boot
          const r = await fetch('/accounts/api/chat_resume/', { credentials: 'include', headers: { Accept: 'application/json' }, signal: ctrl.signal }).finally(() => clearTimeout(to))
          const j = r.ok ? await r.json() : null
          if (j?.ok && j.keycard && j.nick) { password = j.keycard as string; resumeNick = j.nick as string; go = true }
        } catch { /* offline / timeout / no endpoint → fall through to the connect screen */ }
      }
      if (go) {
        useChat.setState({ autoConnecting: true })
        useChat.getState().connect({ url: resume.url || cfg.server.url, nick: resumeNick, password, channels: resume.channels })
        cleanUrl()
      }
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
})

// PWA + seamless updates: registers the service worker (installable, offline app
// shell, web push) and polls version.json so a fresh deploy refreshes the tab in
// place — a themed cross-fade instead of a manual hard reload. See ./ui/appUpdate.
registerAppUpdates()
