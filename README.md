<div align="center">

<img src="public/orbit-icon.svg" width="92" height="92" alt="Orbit logo">

# Orbit

**A modern, pluggable IRCv3 web client.**
TypeScript · React · Vite · zustand. Installable as a PWA, re-brandable without a rebuild.

[![status: work in progress](https://img.shields.io/badge/status-work_in_progress-f59e0b?style=flat-square)](#-status)
[![license: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2ea043?style=flat-square)](./LICENSE)
[![IRCv3](https://img.shields.io/badge/IRCv3-25_capabilities-3d8bff?style=flat-square)](https://ircv3.net/)
[![PWA](https://img.shields.io/badge/PWA-installable-7c3aed?style=flat-square)](#-features)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](#)
[![i18n](https://img.shields.io/badge/i18n-10_languages-0ea5e9?style=flat-square)](#-internationalization)

[**Live demo**](https://tchatou.fr/app/) · [**Documentation**](https://orbit.tchatou.fr/docs/) · [**Project page**](https://orbit.tchatou.fr) · [**License**](./LICENSE)

<img src="docs/screenshot.png" width="820" alt="Orbit screenshot">

</div>

---

Orbit is a bespoke IRCv3 web client built from scratch, with no wrappers and no
bridge. It speaks modern IRCv3 directly over a WebSocket and presents it as a
polished, app-like chat experience: rich messages, reactions, replies, history,
web push, themes and full internationalization. It powers
[tchatou.fr](https://tchatou.fr) in production, and can be re-pointed at **any**
IRCv3 network and fully re-branded by editing a single runtime `config.json`,
with no rebuild required.

## 🚧 Status

> **Work in progress.** Orbit is under active development. It runs in production,
> but the UI, config keys and internal APIs are still evolving and may change
> without notice between commits. Bug reports and contributions are welcome.

## ✨ Features

- **Real IRCv3:** negotiates [25 capabilities](#-ircv3-capabilities) including chat
  history, message redaction (edit/delete), multiline, reactions, replies, account
  registration and SASL, server-time, away/typing and web push.
- **Multi-network:** connect to several IRC networks at once, each with its own
  buffers, identity and settings, and switch between them from the network bar.
- **Rich composer:** bold/italic/underline and mIRC colours, an emoji picker,
  `:emoji:` / `@nick` / `/command` tab-completion, multiline, image upload
  (paste and drag-drop), and per-channel drafts.
- **Conversations:** channels and DMs, a member list with roles, whois/profile
  panels, friends with online alerts, channel admin (modes, bans, topic), and
  link/image/YouTube unfurling.
- **Installable PWA:** an offline app shell via a service worker, plus **Web Push**
  notifications (RFC 8291 / VAPID) that work even when the app is closed.
- **Themes:** Light, Dark, Orbit, Orbit Dark, and a classic yomIRC skin (light and
  night).
- **Settings that surface the protocol:** a live **Server** panel (network,
  software, TLS, users, limits, raw ISUPPORT) and an **IRCv3** panel showing
  exactly which capabilities your server supports.
- **Fully internationalized:** 10 languages, browser-detected and switchable live
  (see [Internationalization](#-internationalization)).
- **Plugins:** an experimental, operator-controlled plugin API (`window.Orbit`) for
  events, IRC actions, theming and UI slots. See the
  [plugin docs](https://orbit.tchatou.fr/docs/plugins/).

## 📚 Documentation

Full docs are hosted at **[orbit.tchatou.fr/docs](https://orbit.tchatou.fr/docs/)**:

| | |
|---|---|
| [Overview](https://orbit.tchatou.fr/docs/overview/) | what Orbit is, and why |
| [Quick start](https://orbit.tchatou.fr/docs/quick-start/) | run your own in a minute |
| [Configuration](https://orbit.tchatou.fr/docs/config/) | every `config.json` option |
| [Branding & themes](https://orbit.tchatou.fr/docs/branding/) | re-brand without a rebuild |
| [Plugin system](https://orbit.tchatou.fr/docs/plugins/) | the `window.Orbit` API |
| [Compiled plugins](https://orbit.tchatou.fr/docs/compiled-plugins/) | real React plugins |
| [Build & deploy](https://orbit.tchatou.fr/docs/deploy/) | self-hosting |
| [IRCv3 capabilities](https://orbit.tchatou.fr/docs/ircv3/) | the protocol features |
| [Architecture](https://orbit.tchatou.fr/docs/architecture/) | how it's built |

There's also a [user wiki](https://orbit.tchatou.fr/wiki/) and an [FAQ](https://orbit.tchatou.fr/faq/).

## 🔌 IRCv3 capabilities

Orbit requests every capability it knows how to use and lights up a live status
panel (Settings → IRCv3) showing what the connected server actually supports.
The full set it negotiates lives in [`src/core/irc/caps.ts`](./src/core/irc/caps.ts),
including `draft/chathistory`, `draft/event-playback`, `draft/message-redaction`,
`draft/multiline`, `draft/account-registration`, `draft/webpush`, `sasl`,
`server-time`, `message-tags`, `echo-message`, `batch`, `labeled-response`,
`multi-prefix`, `away-notify`, `chghost`, and more.

## 🚀 Quick start

Requirements: **Node 20+** and npm.

```bash
npm install
npm run dev        # Vite dev server with HMR
npm run build      # type-check (tsc -b) + production build → dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright, drives the app against a real Ergo IRC server
```

## ⚙️ Configuration

Orbit is configured at **runtime** by `config.json`, fetched on
startup and deep-merged over built-in defaults. Point it at another IRC network
and fully re-brand it **without rebuilding**: just edit the deployed file and
reload (the service worker serves it network-first).

→ **[Configuration docs](https://orbit.tchatou.fr/docs/config/)** cover every
option, merge rules, and examples (source: [CONFIG.md](./CONFIG.md)).

```jsonc
{
  "server":   { "url": "wss://irc.example.org/ws/" },
  "startup":  { "channels": ["#lobby", "#help"] },
  "branding": { "name": "ExampleChat", "url": "https://example.org" }
}
```

## 📦 Deployment

Static output: copy `dist/*` (including `config.json`) to the web root served at
`/app/`. To change only the config later, edit the deployed `/app/config.json`
and reload. Full steps in the [Build & deploy guide](https://orbit.tchatou.fr/docs/deploy/).

## 🗂️ Project structure

```
src/
  core/
    irc/        IRCv3 client, parser, capabilities, numerics, modes
    store.ts    zustand store: connection, buffers, messages, actions
    store/      message handler, helpers, persistence
    services/   IRC services logic (NickServ/ChanServ routing, credential masking)
    networks.ts multi-network registry
    i18n/       react-i18next setup and 10 locale files
  components/   chat UI (sidebar, composer, message list, members, modals)
  modules/      the plugin system (the window.Orbit API and sandbox)
  platform/     browser services: notifications, web push, avatars
  themes/       theme stylesheets
  ui/ lib/      theming, formatting, editor helpers
public/         config.json, icons, manifest, service worker
```

## 🌍 Internationalization

Every user-facing string is translated across **10 languages**: English,
French, German, Spanish, Italian, Portuguese (Portugal & Brazil), Russian,
Turkish and Nepali. The language is browser-detected, persisted, and switchable
live from Settings. Strings live in [`src/core/i18n/locales/`](./src/core/i18n/locales).

## 🧪 Development & CI

Every push runs the full gate before anything ships: **lint** (ESLint), **unit
tests** (Vitest), **end-to-end tests** (Playwright driving the app against a real
[Ergo](https://ergo.chat) IRC server), then a production **build**. Nothing is
deployed unless all of it passes. A [Forgejo Actions](https://forgejo.org/docs/latest/user/actions/)
workflow example lives in [`.forgejo/`](./.forgejo).

## 📄 License

Licensed under the **GNU Affero General Public License v3.0 or later**
(AGPL-3.0). If you run a modified version of Orbit as a network service, you must
make your modified source available to its users. See [LICENSE](./LICENSE).

<div align="center"><sub>Built with React and modern IRCv3 · <a href="https://orbit.tchatou.fr">orbit.tchatou.fr</a></sub></div>
