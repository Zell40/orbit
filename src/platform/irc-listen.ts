// Refresh HttpOnly `orbit_en_listen` (cp|reg) on the Orbit origin *before* the
// IRC WebSocket opens. Apache on irc.* reads that cookie to pick InspIRCd
// Websocket-CP vs normal — join-form reconnects never hit chat_resume/handoff.
// Caller should resolve GECOS/age first; the endpoint leaves the cookie unchanged
// when age is unknown (avoids demoting a prior `cp` to `reg`).
import { parseProfileGecos } from '@/lib/profile-gecos';

export type IrcListen = 'cp' | 'reg';

export type IrcListenRefresh = {
  account?: string;
  /** Age from guest ASL / GECOS when there is no WP account lookup. */
  age?: number | string | null;
  realname?: string;
};

/**
 * Pin this tab's websocket to one listener. The orbit_en_listen cookie is
 * shared by every account in the browser, so another tab can flip it between
 * the cookie write and the handshake. The query is per connection.
 */
export function withListenQuery(url: string, listen: IrcListen): string {
  try {
    const u = new URL(url);
    u.searchParams.set('listen', listen);
    return u.toString();
  } catch {
    const base = url
      .replace(/([?&])listen=(?:cp|reg)(?=&|$)/g, '$1')
      .replace(/[?&]$/, '');
    return base + (base.includes('?') ? '&' : '?') + 'listen=' + listen;
  }
}

function listenUrls(q: string): string[] {
  return [
    `/accounts/api/chat_listen/?${q}`,
    `/app/accounts/api/chat_listen/?${q}`,
  ];
}

function ageFromOpts(o: IrcListenRefresh): number | undefined {
  if (o.age != null && o.age !== '') {
    const n = typeof o.age === 'number' ? o.age : parseInt(String(o.age).trim(), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 120) return n;
  }
  const g = parseProfileGecos(o.realname);
  if (g?.age) {
    const n = parseInt(g.age, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 120) return n;
  }
  return undefined;
}

/**
 * Best-effort cookie refresh. Never throws; connect proceeds even if the
 * endpoint is missing (dev / non-EntreNous deploys).
 * Returns the listener this account should use, when the endpoint says so.
 */
export async function refreshIrcListenCookie(o: IrcListenRefresh): Promise<IrcListen | null> {
  const account = (o.account || '').trim();
  const age = ageFromOpts(o);
  if (!account && age == null) return null;

  const params = new URLSearchParams();
  if (account) params.set('account', account);
  if (age != null) params.set('age', String(age));
  const q = params.toString();

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 3500);
  try {
    for (const url of listenUrls(q)) {
      try {
        const r = await fetch(url, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        });
        if (!r.ok) continue;
        try {
          const body = await r.json() as { listen?: unknown };
          if (body && (body.listen === 'cp' || body.listen === 'reg')) return body.listen;
        } catch { /* cookie may already be set */ }
        return null;
      } catch {
        if (ctrl.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(to);
  }
  return null;
}
