# Orbit plugin template

A starter for a **compiled** Orbit plugin — write real React/TSX with hooks and
build it down to a single droppable `.js` file (a compiled, externalized-React
plugin model, in React/Vite).

## Build

```bash
npm install
npm run build      # → dist/orbit-plugin-template.js
```

`react`, `react-dom` and `react/jsx-runtime` are marked **external** in
`vite.config.ts` and mapped to `Orbit.React` / `Orbit.ReactDOM` /
`Orbit.jsxRuntime`. So your bundle does **not** contain its own React — at
runtime it shares Orbit's single instance. (Bundling your own React would break
hooks with "invalid hook call".)

## Deploy

1. Copy `dist/orbit-plugin-template.js` to where Orbit can fetch it, e.g.
   `/app/plugins/orbit-plugin-template.js`.
2. List it in the deployed `config.json` (no rebuild of Orbit needed):

   ```json
   { "plugins": ["/app/plugins/orbit-plugin-template.js"] }
   ```

3. Reload. The example adds a 🤷 composer button and a **Template** section in
   Settings.

## Write your plugin

Edit `src/index.tsx`. The `Orbit` global and the per-plugin `orbit` API are typed
in `src/orbit.d.ts`. See Orbit's [`docs/PLUGINS.md`](../docs/PLUGINS.md) for the
full API and event list.
