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
