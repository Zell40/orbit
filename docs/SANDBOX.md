# The sandbox

The sandbox is a **core subsystem** (`src/modules/sandbox/`): it runs code in an
**opaque-origin iframe** (`sandbox="allow-scripts"`, no `allow-same-origin`) that
reaches the app **only** through a capability-gated message bridge. Sandboxed code
cannot read the page DOM, cookies, `localStorage` (the SASL handoff password), or
the store — only what its `permissions` grant.

Two things use it:

- **Built-in features (bundled)** — the app mounts them itself at boot via
  `src/modules/sandbox/builtins.ts` → `mountSandboxed({ name, source, permissions })`, with
  the source compiled into the app (`?raw`). They are **opt-in per deployment**: a
  built-in only mounts if its name is listed in `config.json` `"builtins": [...]`.
  Example: the `dice` 🎲/🪙 widget (`src/modules/sandbox/features/dice.js`). To add
  one, follow `src/modules/sandbox/features/README.md`.
- **Operator plugins (config)** — a `config.json` entry with `sandbox: true` is
  fetched and mounted the same way. Use for community / third-party / less-trusted
  plugins. (Plain string entries still load in-page as a trusted `<script>`.)

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
tested in `src/modules/sandbox/protocol.test.ts`.

The sandboxed API (`src/modules/sandbox/host.ts` + `public/plugin-sandbox.html`):
`orbit.log`, `orbit.on(event, fn)` (forwarded `connected` / `message` /
`buffer.active` / `status`), `orbit.irc.*`, `orbit.notify`,
`orbit.state.active/nick/account/buffers` (from a pushed snapshot, synchronous),
`orbit.server.network/isupport/hasCap/caps` (also from the snapshot, synchronous —
gate cap-dependent behaviour so a plugin never 421s a lean server; no `numeric()`
here since the sandbox gets no `raw` events), `orbit.storage.get/set`, and
`orbit.ui(slot, build)` where `build(el)` populates the plugin's own iframe and the
host sizes the frame to the content.

The app's theme CSS vars (`--bg`, `--ink`, `--accent`, `--muted`, `--border`,
`--panel`, `--green-soft`) are mirrored into the sandbox and kept in sync on theme
change, so plugin UI can use `var(--accent)` and look native in light + dark.

Examples: `src/modules/sandbox/features/dice.js` (a built-in, bundled + mounted by core) and
`public/plugins/orbit-sandbox-demo.js` (the minimal config-loaded form).

## Required CSP (APPLIED 2026-07-04)

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

Applied live in `csp-app.conf` / `chat-headers.conf` (added `'self'` to `frame-src`)
and a `location = /app/plugin-sandbox.html` block in `tchatou-app-backend.conf`.
Note: nginx *reload* cannot rekey a shared-memory zone, so activating this needed a
full `systemctl restart nginx` (an unrelated pre-existing `limit_req` key change had
been blocking reloads).
