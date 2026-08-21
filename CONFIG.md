# Configuration ÔÇö `config.json`

The client is configured at **runtime** by `config.json`. It is
fetched on startup (before the app renders) and deep-merged over the built-in
defaults, so you can **re-point the client at another IRC network and fully
re-brand it without rebuilding** ÔÇö just edit the deployed file and reload.

- **Source of truth:** `public/config.json` (copied into the build).
- **Served at:** `/app/config.json` (e.g. `https://tchatou.fr/app/config.json`).
- **Edit live:** the service worker serves it **network-first**, so changes to
  the deployed `/app/config.json` take effect on the next reload ÔÇö no rebuild.
- **Defaults/fallbacks:** `src/config.ts` (`DEFAULT_CONFIG`). Anything you omit
  from `config.json` falls back to these, so a missing/invalid file still boots.

Merge rules: objects merge key-by-key; **arrays and scalars replace** wholesale
(e.g. `startup.channels` is replaced, not concatenated).

## Options

| Key | Type | Default | What it does |
|-----|------|---------|--------------|
| `server.url` | string | `wss://www.swaygo.fr/irc/` | WebSocket URL of the IRCv3 server (uses the `text/binary.ircv3.net` subprotocols, with a plain-WebSocket fallback for ZNC/Kiwi gateways). The server's Origin allowlist must include where the client is served. |
| `server.bouncerUrl` | string | `""` | Default WebSocket URL pre-filled when a visitor chooses “via a bouncer”. Typically the Kiwi `webircgateway` in front of ZNC, e.g. `wss://bnc.example.org/webirc/websocket/`. |
| `server.guestIdent` | string | `Invit├®` | Ident shown for **guests** (not logged in), e.g. `Foo!Invit├®@ÔÇª`. Folded to ASCII since IRC idents are `[A-Za-z0-9._-]` (so `Invit├®`ÔåÆ`Invite`). Logged-in members use their own nick as the ident. |
| `startup.channels` | string[] | `["#accueil"]` | Channels auto-joined on connect (first = active). A `?channel=` URL param overrides this. |
| `branding.name` | string | `Tchatou` | App/network name shown in the UI, the console title, and CTCP VERSION. |
| `branding.icon` | string | tchatou favicon URL | Logo on the connect screen + default network icon. |
| `branding.url` | string | `https://tchatou.fr` | Homepage; also used in CTCP VERSION/SOURCE replies. |
| `branding.tagline` | string | `Le tchat fran├ºais,` | Connect screen ÔÇö first title line. |
| `branding.taglineEm` | string | `en direct.` | Connect screen ÔÇö emphasised second line. |
| `branding.subtitle` | string | ÔÇª | Connect screen ÔÇö paragraph under the title. |
| `branding.projectUrl` | string | `https://orbit.tchatou.fr` | Link to the Orbit project/source page (shown in Settings ÔåÆ About). |
| `turnstile.enabled` | bool | `true` | Render the anti-bot challenge inline (Cloudflare Turnstile). `false` = show the server's verification step as a link, no Cloudflare script. Whether a challenge is *required* is decided server-side. |
| `turnstile.sitekey` | string | `0x4AAAÔÇª` | Public Turnstile site key. |
| `report.service` | string | `ReportServ` | Services pseudo-client that receives reports (e.g. `ReportServ`). Preferred over `report.target` ÔÇö a service isn't blocked by a `+n` staff channel the reporter isn't in. Empty = fall back to `report.target`. |
| `report.target` | string | `#staff` | Channel that user reports (the ­ƒÜ® button) are sent to when `report.service` is empty. |
| `defaults.theme` | string | `light` | Default theme for **new** users: `light` \| `dark` \| `yomirc` \| `yomirc-dark`. |
| `defaults.compact` | bool | `false` | Default to denser message rows. |
| `defaults.sound` | bool | `true` | Default sound-on-mention/PM. |
| `defaults.hideJoinQuit` | bool | `false` | Default to hiding join/part/quit noise. |
| `defaults.clock24` | bool | `true` | Default to 24-hour timestamps. |
| `defaults.lang` | string | `""` | Force a default UI language (`en`, `es`, `de`, `it`, `nl`, `tr`, `ru`, `ne`, `pt-BR`, `pt-PT`, `fr`). Empty = auto-detect from the browser. Only seeds users who haven't picked a language. |
| `features.push` | bool | `true` | Show the Web Push notifications setting (and re-assert the subscription on connect). |
| `features.imageUpload` | bool | `true` | Enable the composer image button + paste/drag-drop upload. |
| `features.register` | bool | `true` | Account self-service: shows the "Create account" button, the "Forgot password" link, and their FAQ entries. `false` hides all of them. |
| `features.bouncer` | bool | `false` | Show “via a bouncer (ZNC)” on the connect screen. The bouncer password is sent as IRC `PASS` (`user/network:password`); optional NickServ SASL is a separate field. Leave channels empty to attach to the bouncer’s existing windows. |
| `plugins` | string[] | `[]` | Plugin script URLs loaded at startup (operator-controlled). See **[PLUGINS.md](./docs/PLUGINS.md)**. |
| `builtins` | string[] | `[]` | Built-in **sandboxed** features to enable by name (opt-in). Currently `"dice"` (a ­ƒÄ▓/­ƒ¬Ö footer widget). See **[docs/SANDBOX.md](./docs/SANDBOX.md)**. |

> `defaults.*` only seed a user's preferences the **first** time ÔÇö once someone
> changes a setting it's stored in their browser and the config no longer
> overrides it.

## Example

```json
{
  "server":   { "url": "wss://irc.example.org/ws/", "guestIdent": "Guest" },
  "startup":  { "channels": ["#lobby", "#help"] },
  "branding": {
    "name": "ExampleChat",
    "icon": "https://example.org/logo.svg",
    "url": "https://example.org",
    "tagline": "Chat with",
    "taglineEm": "everyone.",
    "subtitle": "Public rooms, private messages, no signup required.",
    "projectUrl": "https://orbit.tchatou.fr"
  },
  "turnstile": { "enabled": false, "sitekey": "" },
  "report":   { "service": "ReportServ", "target": "#staff" },
  "defaults": { "theme": "dark", "compact": true, "sound": true, "hideJoinQuit": true, "clock24": true, "lang": "" },
  "features": { "push": true, "imageUpload": true, "register": false },
  "plugins":  [],
  "builtins": ["dice"]
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
reload ÔÇö the service worker fetches it network-first.
