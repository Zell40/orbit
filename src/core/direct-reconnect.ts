// After a bouncer session, send the user to the site chat-login page (or Orbit’s
// own join form) *without* the bouncer — TAGMSG games need a direct websocket.

const KEY = 'orbit-prefer-direct';

export interface DirectReconnect {
  nick: string;
  channels: string[];
}

export function peekDirectReconnect(): DirectReconnect | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as DirectReconnect;
    if (!r || typeof r.nick !== 'string' || !r.nick.trim()) return null;
    const channels = Array.isArray(r.channels)
      ? r.channels.map((c) => String(c || '').trim()).filter(Boolean)
      : [];
    return { nick: r.nick.trim(), channels };
  } catch { return null; }
}

export function saveDirectReconnect(nick: string, channels: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      nick: nick.trim(),
      channels: channels.map((c) => String(c || '').trim()).filter(Boolean),
    } satisfies DirectReconnect));
  } catch { /* storage blocked */ }
}

export function clearDirectReconnect(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** WordPress (or site) login URL with current nick/channels and no bouncer. */
export function siteLoginHref(loginUrl: string, opts: { nick?: string; channels?: string[] }): string {
  const u = new URL(loginUrl, 'https://placeholder.invalid');
  u.searchParams.set('direct', '1');
  const channels = (opts.channels || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (channels.length) u.searchParams.set('channel', channels.join(','));
  const nick = (opts.nick || '').trim();
  if (nick) u.searchParams.set('nick', nick);
  return u.toString();
}

let skipClosePrompt = false;

/** Next navigation is intentional (leave bouncer → site login) — don't nag. */
export function armLeaveWithoutPrompt(): void {
  skipClosePrompt = true;
}

export function shouldSkipClosePrompt(): boolean {
  return skipClosePrompt;
}
