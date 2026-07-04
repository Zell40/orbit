# Sandboxed plugins

Orbit loads two kinds of plugin, chosen per entry in `config.json`:

- **In-page (default)** — a trusted `<script>` on the app origin, same trust level
  as deploying the app. Gets the full React plugin API. Use for first-party
  plugins the operator wrote or fully vets.
- **Sandboxed** — runs in an **opaque-origin iframe** (`sandbox="allow-scripts"`,
  no `allow-same-origin`) and reaches the app **only** through a capability-gated
  message bridge. It cannot read the page DOM, cookies, `localStorage` (the SASL
  handoff password), or the store. Use for community / third-party / less-trusted
  plugins.

```jsonc
"plugins": [
  "/app/plugins/orbit-clock.js",                                  // in-page (trusted)
  { "url": "/app/plugins/community-thing.js",                     // sandboxed
    "sandbox": true, "permissions": ["irc", "storage"] }
]
```

## Capabilities

A sandboxed plugin can do nothing privileged unless the operator grants the
matching permission. Everything else (reading a cached state snapshot, rendering
UI inside its own iframe) needs no grant because it is already contained.

| permission | unlocks |
|---|---|
| `irc`     | `orbit.irc.say/msg/send/join/part/list` — acts as the user |
| `notify`  | `orbit.notify(title, body)` |
| `storage` | `orbit.storage.set(k, v)` (namespaced, persisted host-side) |

Ungranted or unknown calls are refused host-side (fail-closed). The gate is unit
tested in `src/plugins/sandbox/protocol.test.ts`.

The sandboxed API (`src/plugins/sandbox/host.ts` + `public/plugin-sandbox.html`):
`orbit.log`, `orbit.on(event, fn)` (forwarded `connected` / `message` /
`buffer.active` / `status`), `orbit.irc.*`, `orbit.notify`,
`orbit.state.active/nick/account/buffers` (from a pushed snapshot, synchronous),
`orbit.storage.get/set`, and `orbit.ui(slot, build)` where `build(document.body)`
populates the plugin's own iframe and the host sizes it to the content.

## Required CSP (staged — not yet applied to prod)

The sandbox iframe needs two nginx changes in `chat-headers.conf`. Both are
contained: the sandbox doc is opaque-origin, so its looser script policy cannot
touch the app.

1. Let the app embed the sandbox document — add `'self'` to the app `frame-src`:

   ```
   frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com;
   ```

2. Serve `/app/plugin-sandbox.html` with its **own** tight CSP that allows the
   bootstrap to run and `eval` plugin code, but blocks all network egress
   (so even a malicious sandboxed plugin cannot phone home — it may only talk over
   the postMessage bridge):

   ```
   location = /app/plugin-sandbox.html {
     add_header Content-Security-Policy "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-ancestors 'self'" always;
   }
   ```

Until (1) is applied, the app's current `frame-src` (no `'self'`) blocks the
sandbox iframe, so sandboxed plugins are inert — in-page plugins are unaffected.
