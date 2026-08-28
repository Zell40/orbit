// IRC USER ident (the "user" in nick!user@host).
// Idents are ASCII [A-Za-z0-9._-], max 10; accents are folded (Invité → Invite).

export function foldIrcIdent(value: string, fallback: string): string {
  return (value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '').slice(0, 10) || fallback;
}

/** Username sent in USER. Logged-in members always use their nick.
 *  Guests use `guestIdent` unless `guestIdentFromNick` is set (original join form). */
export function resolveConnectUsername(
  opts: {
    username?: string;
    nick: string;
    password?: string;
    passkey?: unknown;
    serverPassword?: string;
  },
  server: { guestIdent?: string; guestIdentFromNick?: boolean },
): string {
  if (opts.username) return opts.username;
  const guest = foldIrcIdent(server.guestIdent || 'Invité', 'Invite');
  const loggedIn = !!(opts.password || opts.passkey || opts.serverPassword);
  if (loggedIn || server.guestIdentFromNick) return foldIrcIdent(opts.nick, guest);
  return guest;
}
