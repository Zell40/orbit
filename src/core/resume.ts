// Persistent session resume (opt-in: config.features.sessionResume).
//
// We store ONLY non-secret context — the network URL, your nick, your account
// name (a public label, '' for a guest), open channels, and the EntreNous-style
// GECOS realname (âge - genre - ville) so reconnect restores ASL. A password is
// NEVER stored: a logged-in member is re-authenticated on reopen by minting a
// fresh single-use keycard against the still-live website session cookie
// (the /accounts/api/chat_resume/ endpoint); a guest just reconnects under the
// same nick. So an attacker reading localStorage finds nothing reusable.

const KEY = 'orbit-resume';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // a fortnight; older sessions aren't auto-resumed

export interface Resume {
  v: 1;
  url: string;
  nick: string;
  account: string; // '' for a guest
  channels: string[];
  /** IRC GECOS, e.g. "40 - Homme - Paris" — restored on USER after reconnect. */
  realname?: string;
  /** True when this session logged in through a bouncer (PASS). Prefills the
   *  join-form toggle only — bouncer sessions are never auto-resumed (ZNC flood). */
  bouncer?: boolean;
  ts: number;
}

export function saveResume(r: Omit<Resume, 'v' | 'ts'>): void {
  try {
    if (!r.nick) return;
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), ...r }));
  } catch { /* storage blocked/full — resume just won't happen */ }
}

export function loadResume(): Resume | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Resume;
    if (r?.v !== 1 || typeof r.nick !== 'string' || !r.nick || typeof r.url !== 'string') return null;
    if (typeof r.ts !== 'number' || Date.now() - r.ts > MAX_AGE_MS) { clearResume(); return null; }
    if (!Array.isArray(r.channels)) r.channels = [];
    r.account = typeof r.account === 'string' ? r.account : '';
    if (typeof r.realname !== 'string' || !r.realname.trim()) delete r.realname;
    else r.realname = r.realname.trim();
    r.bouncer = r.bouncer === true;
    return r;
  } catch { return null; }
}

export function clearResume(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Fresh SASL keycard minted from the HttpOnly `orbit_en_resume` cookie. */
export interface ResumeKeycard {
  keycard: string;
  nick: string;
  account?: string;
  realname?: string;
}

function resumeMintUrls(): string[] {
  // Prefer the host-root path: the PWA service worker scopes /app/ and used
  // to intercept /app/accounts/api/* (dropping cookies → no_session).
  return ['/accounts/api/chat_resume/', '/app/accounts/api/chat_resume/'];
}

function parseResumeKeycard(j: unknown): ResumeKeycard | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as { ok?: unknown; keycard?: unknown; nick?: unknown; account?: unknown; realname?: unknown };
  if (o.ok !== true || typeof o.keycard !== 'string' || !o.keycard
      || typeof o.nick !== 'string' || !o.nick) return null;
  const out: ResumeKeycard = { keycard: o.keycard, nick: o.nick };
  if (typeof o.account === 'string' && o.account) out.account = o.account;
  if (typeof o.realname === 'string' && o.realname.trim()) out.realname = o.realname.trim();
  return out;
}

/**
 * Mint a one-time JWT from the WordPress handoff cookie.
 *
 * Tries `/app/accounts/api/chat_resume/` first (same Apache Alias tree as
 * handoff.php), then `/accounts/api/chat_resume/`. A cookie Path=/app is only
 * sent to the first URL; a host-root rewrite may also serve a different copy.
 */
export async function mintChatResume(signal?: AbortSignal): Promise<ResumeKeycard | null> {
  for (const url of resumeMintUrls()) {
    try {
      const r = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      if (!r.ok) continue;
      const minted = parseResumeKeycard(await r.json());
      if (minted) return minted;
    } catch { /* abort / offline / non-JSON → try the other path */ }
  }
  return null;
}
