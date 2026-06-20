# Changelog

All notable changes to Orbit are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://codeberg.org/reversefr/orbit/releases/tag/v1.0.0
[0.1.0]: https://codeberg.org/reversefr/orbit/releases/tag/v0.1.0
