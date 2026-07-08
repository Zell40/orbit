# Feature modules

A **feature module** is a small, self-contained first-party feature that ships
with the app and runs **sandboxed** (isolated + capability-gated). Each is one
file here with an identical shape.

## The skeleton

```js
// features/hello.js
Orbit.plugin('hello', function (orbit) {
  // `orbit` is the CONSTRAINED sandbox API only: log, on, irc.*, notify, state,
  // storage, ui — nothing else (no page/DOM/store access). See docs/SANDBOX.md.
  orbit.ui('footer_item', function (root) {
    var b = document.createElement('button');
    b.textContent = '👋';
    // Style with the app theme vars so it looks native in light + dark.
    b.style.cssText = 'border:1px solid var(--border);background:var(--panel);' +
      'color:var(--ink);border-radius:9px;padding:.3rem .5rem;cursor:pointer';
    b.onclick = function () { orbit.irc.say('👋'); };
    root.appendChild(b);
  });
});
```

## Adding one — 3 steps

1. Drop `features/<name>.js` here (the skeleton above).
2. Register it in [`../builtins.ts`](../builtins.ts):
   `{ name: '<name>', source: <name>Source, permissions: [...] }`
   — import the source with `?raw`.
3. Enable it per deployment in `config.json`: `"builtins": ["<name>"]`.

Grant the **narrowest** `permissions` the feature needs (`irc` / `notify` /
`storage`); everything else (UI, reading state) needs no grant. `dice.js` is the
canonical worked example.
