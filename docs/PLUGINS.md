# Plugins

Orbit has a small, **operator-controlled** plugin system inspired by webchat's
`window.kiwi`. A deployment lists plugin scripts in `config.json`; each is loaded
at startup and registers against a global `Orbit` object to hook events, read
state, send IRC, theme the UI, and add UI in predefined slots.

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
| `Orbit.plugin(name, fn)` | register a plugin; `fn(orbit, log)` |
| `Orbit.on/once/off/emit(event, …)` | the app event bus |
| `Orbit.config()` | the resolved runtime config |
| `Orbit.React` / `Orbit.h` / `Orbit.html` | render primitives |

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

More slots (settings panel, message decorators, side panels) will be added as
the core grows stable homes for them.

## Intentionally not exposed

Unlike webchat, Orbit does **not** offer `require()`/`replaceModule()`-style
access to internal modules or component replacement. Those couple plugins to
internals that are still moving; the API above is the deliberately stable
surface. Ask (or open an issue) if you need a hook that isn't here.

See [`public/plugins/orbit-demo.js`](../public/plugins/orbit-demo.js) for a
complete working example.
