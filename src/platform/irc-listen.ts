// Refresh HttpOnly `orbit_en_listen` (cp|reg) on the Orbit origin *before* the
// IRC WebSocket opens. Apache on irc.* reads that cookie to pick InspIRCd
// Websocket-CP vs normal — join-form reconnects never hit chat_resume/handoff.
import { parseProfileGecos } from '@/lib/profile-gecos';

export type IrcListenRefresh = {
  account?: string;
  /** Age from guest ASL / GECOS when there is no WP account lookup. */
  age?: number | string | null;
  realname?: string;
};

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
 */
export async function refreshIrcListenCookie(o: IrcListenRefresh): Promise<void> {
  const account = (o.account || '').trim();
  const age = ageFromOpts(o);
  if (!account && age == null) return;

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
        if (r.ok) return;
      } catch {
        if (ctrl.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(to);
  }
}
