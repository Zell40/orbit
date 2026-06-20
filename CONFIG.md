# Configuration — `config.json`

The client is configured at **runtime** by `config.json`. It is
fetched on startup (before the app renders) and deep-merged over the built-in
defaults, so you can **re-point the client at another IRC network and fully
re-brand it without rebuilding** — just edit the deployed file and reload.

- **Source of truth:** `public/config.json` (copied into the build).
- **Served at:** `/app/config.json` (e.g. `https://tchatou.fr/app/config.json`).
- **Edit live:** the service worker serves it **network-first**, so changes to
  the deployed `/app/config.json` take effect on the next reload — no rebuild.
- **Defaults/fallbacks:** `src/config.ts` (`DEFAULT_CONFIG`). Anything you omit
  from `config.json` falls back to these, so a missing/invalid file still boots.

Merge rules: objects merge key-by-key; **arrays and scalars replace** wholesale
(e.g. `startup.channels` is replaced, not concatenated).

## Options

| Key | Type | Default | What it does |
|-----|------|---------|--------------|
| `server.url` | string | `wss://www.swaygo.fr/irc/` | WebSocket URL of the IRCv3 server (uses the `text/binary.ircv3.net` subprotocols). The server's Origin allowlist must include where the client is served. |
| `startup.channels` | string[] | `["#taverne"]` | Channels auto-joined on connect (first = active). A `?channel=` URL param overrides this. |
| `branding.name` | string | `Tchatou` | App/network name shown in the UI, the console title, and CTCP VERSION. |
| `branding.icon` | string | tchatou favicon URL | Logo on the connect screen + default network icon. |
| `branding.url` | string | `https://tchatou.fr` | Homepage; also used in CTCP VERSION/SOURCE replies. |
| `branding.tagline` | string | `Le tchat français,` | Connect screen — first title line. |
| `branding.taglineEm` | string | `en direct.` | Connect screen — emphasised second line. |
| `branding.subtitle` | string | … | Connect screen — paragraph under the title. |
| `turnstile.enabled` | bool | `true` | Whether the Cloudflare Turnstile challenge is used on registration. |
| `turnstile.sitekey` | string | `0x4AAA…` | Public Turnstile site key. |
| `report.target` | string | `#staff` | Channel that user reports (the 🚩 button) are sent to. |
| `defaults.theme` | string | `light` | Default theme for **new** users: `light` \| `dark` \| `yomirc` \| `yomirc-dark`. |
| `defaults.compact` | bool | `false` | Default to denser message rows. |
| `defaults.sound` | bool | `true` | Default sound-on-mention/PM. |
| `defaults.hideJoinQuit` | bool | `false` | Default to hiding join/part/quit noise. |
| `defaults.clock24` | bool | `true` | Default to 24-hour timestamps. |
| `features.push` | bool | `true` | Show the Web Push notifications setting. |
| `features.imageUpload` | bool | `true` | Enable the composer image button + paste/drag-drop upload. |
| `features.register` | bool | `true` | Show the "Créer un compte" (account creation) tab. |
| `plugins` | string[] | `[]` | Plugin script URLs loaded at startup (operator-controlled). See **[PLUGINS.md](./docs/PLUGINS.md)**. |

> `defaults.*` only seed a user's preferences the **first** time — once someone
> changes a setting it's stored in their browser and the config no longer
> overrides it.

## Example

```json
{
  "server":   { "url": "wss://irc.example.org/ws/" },
  "startup":  { "channels": ["#lobby", "#help"] },
  "branding": {
    "name": "ExampleChat",
    "icon": "https://example.org/logo.svg",
    "url": "https://example.org",
    "tagline": "Chat with",
    "taglineEm": "everyone.",
    "subtitle": "Public rooms, private messages, no signup required."
  },
  "turnstile": { "enabled": false, "sitekey": "" },
  "report":   { "target": "#staff" },
  "defaults": { "theme": "dark", "compact": true, "sound": true, "hideJoinQuit": true, "clock24": true },
  "features": { "push": true, "imageUpload": true, "register": false }
}
```

## Deploy

```bash
npm run build
# copy the build (incl. config.json) to the web root served at /app/
sudo rm -rf /var/www/tchatou/app/assets/*
sudo cp -r dist/* /var/www/tchatou/app/
```

To tweak config only (no rebuild): edit `/var/www/tchatou/app/config.json` and
reload — the service worker fetches it network-first.
