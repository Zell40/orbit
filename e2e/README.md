# End-to-end tests

Playwright drives the real built client against a live [Ergo](https://ergo.chat)
IRCv3 server over WebSocket, the same transport production uses.

## Run

```
npm run test:e2e
```

That fetches the Ergo binary (cached in `e2e/.bin/`, first run only), starts it
on a loopback WebSocket port, builds the client, serves it with `vite preview`,
and runs `e2e/*.spec.ts`. Ergo is torn down afterwards.

## Layout

- `global-setup.ts` / `global-teardown.ts`: start and stop Ergo. The config is
  generated from Ergo's bundled `default.yaml` (a plaintext loopback WebSocket
  listener, no TLS, a throwaway datastore in `$TMPDIR`).
- `config.e2e.json`: points the client at the local Ergo. `fixtures.ts` serves it
  by intercepting the client's `config.json` request, so no build output is
  rewritten.
- `install-ergo.sh`: downloads and pins the Ergo version (`ERGO_VERSION`).

CI runs the same flow in [`.forgejo/workflows/e2e.yml`](../.forgejo/workflows/e2e.yml).
