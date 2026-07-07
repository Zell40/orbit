# Plugin SDK

A sandboxed plugin runs in an isolated iframe and reaches the app only through the
`orbit` API. The SDK gives you **high-level building blocks** so you never touch the
rough edges of the sandbox (theming, frame sizing, positioning, animations) — those
are solved once, in the framework.

Register a plugin:

```js
Orbit.plugin('my-plugin', function (orbit, log) {
  // ...
});
```

Load it via `config.json`:

```json
{ "url": "/app/plugins/third/my-plugin.js", "sandbox": true, "permissions": ["irc"] }
```

See `public/plugins/third/orbit-hello.js` for a complete ~15-line starter, and
`orbit-radio.js` for a real one.

## `orbit.panel(opts)` — a bar tab that opens a themed panel

The flagship helper. It gives you a nav trigger that matches the native tabs and a
floating panel that opens **upward, fully in view, with no flash** — regardless of
theme or how tall your content is. You only fill the panel body.

```js
var p = orbit.panel({
  slot: 'nav_item',       // where the trigger lives (nav bar)
  icon: '📻',             // emoji, or an SVG string, or a DOM node
  label: 'Radio',         // tab label (keep it short/fixed)
  title: 'Radio',         // panel header title (optional; adds a close button)
  width: 264,             // panel width in px (default 280)
  render: function (body, panel) {
    body.appendChild(orbit.el.row('FIP', 'Éclectique'));   // fill the panel
  },
  onToggle: function (open) {},   // optional
});
```

Returns a **controller**:

- `p.open()` / `p.close()` / `p.toggle()` / `p.isOpen()`
- `p.active(bool)` — tint the tab with the accent colour (e.g. "playing" / "unread")
- `p.body()` — the panel content element

**What the SDK handles for you:** matching the native tab look, the async frame
resize, growing upward out of the bar, never flashing a half-drawn panel, staying
transparent (no grey/black box), the open animation, and theming.

## `orbit.el` — themed atoms

Pre-styled elements that already match light/dark:

- `orbit.el.button(label, onClick)` — an accent button.
- `orbit.el.row(title, sub?, onClick?)` — a list row (title + optional subtitle).
- `orbit.el.slider({ min, max, step, value, onInput })` — a themed range input.

Style anything else with the theme CSS variables, which are mirrored into the frame:
`--bg`, `--ink`, `--accent`, `--muted`, `--border`. Text defaults to `--ink`, so
you rarely need to set colours yourself.

## `orbit.ui(slot, build)` — low-level slot

The primitive `panel` is built on. Use it only for custom widgets that aren't a
panel (e.g. a topbar clock). `build(root)` fills `root`; the frame is sized to it.
Slots: `nav_item`, `topbar_item`, `footer_item`, `sidebar_item`, `composer_button`,
`settings_section`.

## The rest of the API

- `orbit.state.nick()` / `.account()` / `.active()` / `.buffers()` — read-only, no permission.
- `orbit.server.network()` / `.isupport()` / `.hasCap(name)` / `.caps()` — read-only.
- `orbit.storage.get(key, fallback)` / `.set(key, value)` — needs `storage`; per-plugin, persisted.
- `orbit.irc.say(text)` / `.msg(to, text)` / `.send(line)` / `.join(chan)` / `.part(chan)` — needs `irc`.
- `orbit.notify(title, body)` — needs `notify`; rate-limited.
- `orbit.on(event, fn)` — subscribe to `message`, `connected`, `buffer.active`, … Returns an unsubscribe fn.
- `log(...)` — console log (shown when plugin debug is on).

## Permissions

Grant the least you need in `config.json`: `irc`, `storage`, `notify`, or `none`
(explicitly nothing). Read-only `state`/`server` need no permission. Anything not
granted is denied at the bridge.
