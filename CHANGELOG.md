# Changelog

All notable changes to Orbit are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Keyboard shortcuts** — Ctrl/⌘-K quick switcher, Alt+↑/↓ to cycle
  conversations, Shift+Esc to mark everything read, and a `?` help sheet that
  lists them all.
- **Per-channel notification levels** — All / Mentions / Mute, picked from an
  accessible popover on the topbar bell (replaces the binary mute; existing
  muted channels migrate to Mute).
- **More plugin extension points** — `topbar_item` and `sidebar_item` UI slots,
  plus `addMessageDecorator()` for per-message UI; two new example plugins
  (`orbit-clock`, `orbit-copy`).
- **Subresource Integrity for plugins** — a `plugins` entry may be
  `{ url, integrity, crossorigin }` to pin off-origin scripts; a sample
  deployment CSP is documented in `SECURITY.md`.

### Changed
- **Accessibility** — a clear `:focus-visible` keyboard ring, a skip-to-messages
  link, landmark labels (message log, sidebar, member list) and aria-labels on
  the emoji-only message actions.

## [1.0.0]

A full, production-ready release — Orbit powers tchatou.fr.

### Added
- **IRCv3 client** negotiating 25 capabilities: chat history, message redaction
  (edit/delete), multiline, reactions, replies, account registration & SASL,
  server-time, away/typing, Web Push, and more.
- **Rich composer** — bold/italic/underline + mIRC colours, emoji picker,
  `:emoji:` / `@nick` / `/command` tab-completion, multiline, image upload, and
  per-channel drafts.
- **Installable PWA** with an offline app shell and **Web Push** notifications
  (RFC 8291 / VAPID).
- **Themes** — Light, Dark, Orbit, Orbit Dark and a classic yomIRC/IRC mode.
- **Settings** — Profile, Appearance, Notifications, Account, plus live **Server**
  (network, software, TLS, users, limits, raw ISUPPORT), **IRCv3** (per-capability
  status) and **About** panels.
- **Full internationalization** — 10 languages, browser-detected and switchable.
- **Plugin system** (`window.Orbit`) — operator-controlled, config-listed plugins
  with events, IRC actions, theming, namespaced storage and UI slots
  (`composer_button`, `settings_section`). Supports both quick `.js` plugins and
  compiled React/TSX plugins (externalized React), with a `plugin-template/`.
- **Runtime configuration** via `config.json` — re-point at any IRCv3 network and
  re-brand without rebuilding.
- Build-time **version/commit injection**, shown in the About panel.

### Notes
- The plugin API is **experimental** and may change between releases.

## [0.1.0]

- Initial public release.

[1.0.0]: https://git.devtronic.pro/orbit/orbit/releases/tag/v1.0.0
[0.1.0]: https://git.devtronic.pro/orbit/orbit/releases/tag/v0.1.0
