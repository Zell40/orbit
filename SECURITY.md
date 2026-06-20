# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, report it privately to a maintainer — on `#orbit` (Libera.Chat or the
Tchatou network), or via the maintainer's Codeberg profile
([@reverse](https://codeberg.org/reverse)). We'll acknowledge it, work on a fix,
and credit you (if you'd like) once it's resolved.

## Supported versions

Orbit is a work in progress; only the latest `main` is supported. Fixes land
there and deploy from it.

## Scope & trust model

A few things that are intentional, not bugs:

- **Plugins run with full page privileges.** Orbit's plugin system is
  **operator-controlled** — a deployment lists plugin scripts in `config.json`,
  so they run with the same trust as the app itself. There is no user-uploaded
  plugin mechanism. Only load plugins you trust; treat them like part of your
  deployment. See the [plugin docs](https://orbit.tchatou.fr/docs/plugins/).
- **The client is static.** It holds no server-side secrets; account auth is via
  the IRC server (SASL) and the connection is TLS (`wss://`).

Things we *do* want to hear about: ways a remote party (a malicious message,
channel, or server response) could run code, steal a session, or break out of
the intended sandbox in the client.

## Hardening a deployment

### Subresource Integrity for plugins

Pin any plugin served from a third-party origin with an SRI hash, so a
compromised host can't silently swap the file. A `plugins` entry may be an
object instead of a bare URL:

```json
{
  "plugins": [
    "/app/plugins/orbit-clock.js",
    { "url": "https://cdn.example/orbit-x.js", "integrity": "sha384-…" }
  ]
}
```

Generate the hash with: `openssl dgst -sha384 -binary file.js | openssl base64 -A`
(prefix the result with `sha384-`). Same-origin plugins don't strictly need it.

### Content-Security-Policy

Orbit ships no `<meta>` CSP because the right policy depends on your deployment
(IRC WebSocket host, whether you use the Turnstile challenge, where plugins are
hosted). Set it as a response header at your edge. A good starting point, with
the parts you must adjust marked:

```nginx
# Replace wss://YOUR-IRC-HOST with config.json → server.url's origin.
# Add any off-origin plugin hosts to script-src. Drop the challenges.cloudflare.com
# lines if you don't use the Turnstile challenge.
add_header Content-Security-Policy "
  default-src 'self';
  script-src 'self' https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https:;
  connect-src 'self' wss://YOUR-IRC-HOST;
  frame-src https://challenges.cloudflare.com;
  worker-src 'self';
  manifest-src 'self';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  frame-ancestors 'self';
" always;
```

Roll it out with `Content-Security-Policy-Report-Only` first and watch the
browser console / `report-to` for violations, then switch to the enforcing
header once it's clean. Self-hosting the Google Fonts CSS/woff2 files lets you
drop the `fonts.googleapis.com` / `fonts.gstatic.com` origins entirely.
