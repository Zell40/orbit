# Contributing to Orbit

Thanks for your interest — contributions are welcome. Orbit is a work in
progress, so please open an issue to discuss anything substantial before
sending a large change.

## Development

Requirements: **Node 20+** and npm.

```bash
npm install
npm run dev        # Vite dev server with HMR
npm run lint       # ESLint
npm run test       # Vitest
npm run build      # type-check (tsc -b) + production build → dist/
```

Please make sure `npm run lint`, `npm run test` and `npm run build` all pass
before opening a pull request — CI runs the same three on every push and PR.

## Guidelines

- **Match the surrounding code** — TypeScript strict, React function components,
  zustand for state. Keep comments at the density of the file you're editing.
- **Keep PRs focused.** One change per PR; describe what and why.
- **Write a test** for new logic where it's practical (parser, store, plugin API,
  mode handling). Tests live next to the code as `*.test.ts`.
- **Commit messages**: concise and imperative (`fix: …`, `feat: …`, `docs: …`).
- **i18n**: user-facing strings go through `react-i18next` — add the key to all
  locale files in `src/i18n/locales/`.

## Documentation

The docs site ([orbit.tchatou.fr/docs](https://orbit.tchatou.fr/docs/)) is its
own repo: [`orbit-client-docs`](https://codeberg.org/reversefr/orbit-client-docs).
Pages are Markdown with a small `Section:` / `Order:` front-matter; drop a file
in and it appears in the nav.

## Plugins

Orbit has an operator-controlled plugin API (`window.Orbit`). See the
[plugin docs](https://orbit.tchatou.fr/docs/plugins/) and the
[`plugin-template/`](./plugin-template) starter.

## License

By contributing, you agree your contributions are licensed under the project's
**AGPL-3.0-or-later** license. See [LICENSE](./LICENSE).
