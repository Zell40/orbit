// Persistent session resume (opt-in: config.features.sessionResume).
//
// localStorage holds ONLY non-secret context (nick, account label, channels,
// GECOS). A MonIdentité member is re-authenticated by minting a JWT from the
// HttpOnly `orbit_en_resume` cookie. A classic NickServ login parks the SASL
// password in sessionStorage (same tab / F5 only — never localStorage), same
// pattern as extra networks (`orbit-netpass`). A guest reconnects by nick.

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
  clearSaslResume();
  void expireResumeCookie();
}

/** Leave chat / `/logout`: wait until the HttpOnly cookie is expired. */
export async function endSession(): Promise<void> {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  clearSaslResume();
  await expireResumeCookie();
}

/** Drop the HttpOnly MonIdentité cookie (JS cannot delete it itself). */
function expireResumeCookie(): Promise<unknown> {
  const opts: RequestInit = { method: 'POST', credentials: 'include', cache: 'no-store' };
  return Promise.allSettled(
    ['/accounts/api/chat_logout/', '/app/accounts/api/chat_logout/'].map((url) => fetch(url, opts)),
  );
}

/** Classic join-form NickServ password — sessionStorage only (survives F5). */
const SASL_KEY = 'orbit-sasl';

export interface SaslResume {
  nick: string;
  password: string;
  account?: string;
  url?: string;
}

export function saveSaslResume(p: SaslResume): void {
  try {
    if (!p.nick || !p.password) return;
    sessionStorage.setItem(SASL_KEY, JSON.stringify({
      nick: p.nick,
      password: p.password,
      ...(p.account ? { account: p.account } : {}),
      ...(p.url ? { url: p.url } : {}),
    }));
  } catch { /* storage blocked */ }
}

export function loadSaslResume(): SaslResume | null {
  try {
    const raw = sessionStorage.getItem(SASL_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { nick?: unknown; password?: unknown; account?: unknown; url?: unknown };
    if (typeof o.nick !== 'string' || !o.nick || typeof o.password !== 'string' || !o.password) {
      clearSaslResume();
      return null;
    }
    const out: SaslResume = { nick: o.nick, password: o.password };
    if (typeof o.account === 'string' && o.account) out.account = o.account;
    if (typeof o.url === 'string' && o.url) out.url = o.url;
    return out;
  } catch { return null; }
}

export function clearSaslResume(): void {
  try { sessionStorage.removeItem(SASL_KEY); } catch { /* ignore */ }
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
