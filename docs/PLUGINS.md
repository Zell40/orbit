# Plugins

Orbit has a small, **operator-controlled** plugin system. A deployment lists
plugin scripts in `config.json`; each is loaded at startup and registers against
a global `Orbit` object to hook events, read state, send IRC, theme the UI, and
add UI in predefined slots.

> **Status: experimental.** Orbit is a work in progress and this API may change
> between releases. Plugins are deployment-controlled (same trust level as the
> app itself) — there is no user-uploaded plugin marketplace, by design.

## Enabling plugins

Add script URLs to `plugins` in [`config.json`](../CONFIG.md):

```json
{ "plugins": ["/app/plugins/orbit-demo.js"] }
```

They load in order, after the app boots. Host them anywhere the page can reach
(same-origin recommended).

## Writing a plugin

A plugin is a plain `.js` file that calls `Orbit.plugin()`:

```js
Orbit.plugin('my-plugin', (orbit, log) => {
  log('loaded, Orbit v' + orbit.version);

  orbit.on('message', (m) => log(m.from, 'said', m.text, 'in', m.target));

  orbit.addUi('composer_button', () =>
    orbit.html`<button class="composer__emoji" title="Shrug"
      onClick=${() => orbit.irc.say('¯\\_(ツ)_/¯')}>🤷</button>`);
});
```

UI is authored with the `html` tagged template ([HTM](https://github.com/developit/htm),
bound to the app's React) — runtime template markup, no build step. Prefer
`orbit.h(...)` (`React.createElement`) if you'd rather not use templates.

## The `Orbit` API

### Global
| Member | Description |
|---|---|
| `Orbit.version` / `Orbit.commit` | app version + git commit (build-time) |
| `Orbit.apiVersion` | plugin API contract version (bumped on breaking changes) — guard with `if (Orbit.apiVersion < N) …` |
| `Orbit.plugin(name, fn)` | register a plugin; `fn(orbit, log)` |
| `Orbit.on/once/off/emit(event, …)` | the app event bus |
| `Orbit.config()` | the resolved runtime config |
| `Orbit.React` / `Orbit.ReactDOM` / `Orbit.jsxRuntime` / `Orbit.Fragment` / `Orbit.h` / `Orbit.html` | render primitives (externalization targets for compiled plugins) |

### Inside `Orbit.plugin(name, (orbit) => …)`
| Member | Description |
|---|---|
| `orbit.on/once/off/emit` | event bus (see events below) |
| `orbit.state.active()` | active buffer name |
| `orbit.state.nick()` / `account()` | your nick / logged-in account |
| `orbit.state.buffers()` | open buffer names |
| `orbit.state.get()` | full store snapshot (read-only) |
| `orbit.irc.send(line)` | send a raw IRC line |
| `orbit.irc.msg(target, text)` | PRIVMSG a target |
| `orbit.irc.say(text)` | send to the active buffer |
| `orbit.irc.join(chan)` / `part(chan)` | join / part |
| `orbit.irc.list()` | request the channel list |
| `orbit.themes.current()/list()/set(id)` | read/set the theme |
| `orbit.storage.get(key, def)/set(key, val)` | namespaced persistence |
| `orbit.addUi(slot, render)` | add UI to a slot (returns a remover) |
| `orbit.addSettingsSection({label, icon?, render})` | add a whole Settings section |
| `orbit.addMessageDecorator(m => …)` | append UI to every message; `m` = `{id, nick, text, kind, ts, mine}` |
| `orbit.h / orbit.html` | render helpers |
| `log(…)` | namespaced console logger |

### Events
`ready`, `connected` (`{nick}`), `status` (connection status string),
`buffer.active` (buffer name), `message` (`{from, target, text, self}`),
`raw` (the parsed `IrcMessage`).

### UI slots
| Slot | Where |
|---|---|
| `composer_button` | a button in the message composer toolbar |
| `topbar_item` | an item in the channel topbar action row (next to search / notifications) |
| `sidebar_item` | an item in the conversation sidebar header (next to the compose button) |
| `settings_section` | a whole section in Settings (own nav entry + pane) — use `orbit.addSettingsSection()` |

Message decorators are added with `orbit.addMessageDecorator(m => …)` rather than
a slot — the callback runs for every rendered message and receives a read-only
view of it. Every contributed slot and decorator renders inside its own error
boundary, so a crashing plugin renders nothing instead of taking down the app.

## Compiled plugins (write real React)

The example above is an *uncompiled* `.js` plugin. For anything substantial,
build a plugin like a normal project and compile it to one droppable file — a
compiled, externalized-React plugin model.

The trick: mark `react`, `react-dom` and `react/jsx-runtime` **external** and map
them to `Orbit.React` / `Orbit.ReactDOM` / `Orbit.jsxRuntime`, so your bundle
shares Orbit's single React instance and never carries its own. (Bundling your
own React breaks hooks with "invalid hook call".) Then author normal TSX with
hooks/state and render it into a slot:

```tsx
import { useState } from 'react';
Orbit.plugin('my-plugin', (orbit) => {
  orbit.addSettingsSection({ label: 'My plugin', icon: '🧩', render: () => <Panel orbit={orbit} /> });
});
```

A ready-to-copy starter (Vite config with the externals already set up, tsconfig,
ambient types and an example) lives in [`plugin-template/`](../plugin-template).
`npm install && npm run build` → one `dist/*.js` you drop in and list in
`config.json`.

## Intentionally not exposed

Orbit does **not** offer access to internal modules or runtime component
replacement. Those would couple plugins to internals that are still moving; the
API above is the deliberately stable surface. Ask (or open an issue) if you need
a hook that isn't here.

## Working examples

| File | Shows |
|---|---|
| [`orbit-demo.js`](../public/plugins/orbit-demo.js) | events, a `composer_button`, an IRC action |
| [`orbit-clock.js`](../public/plugins/orbit-clock.js) | a `topbar_item` with live React-hook state |
| [`orbit-copy.js`](../public/plugins/orbit-copy.js) | a `message_decorator` (per-message copy button) |
