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

/**
 * True when a classic NickServ password parked in this tab is safe to reuse for
 * the session we're about to resume.
 *
 * The live nick may have drifted from the one saved at connect (ERR_NICKNAMEINUSE
 * suffix, a later /nick) while the account stayed the same — matching only on
 * nick would then drop a perfectly good password on the join form. A `?nick=`
 * that names someone else is still a hard no.
 */
export function saslMatchesResume(
  sasl: SaslResume,
  resume: Pick<Resume, 'nick' | 'account'> | null,
  nickParam?: string | null,
): boolean {
  const fold = (s: string) => s.toLowerCase();
  const param = (nickParam || '').trim();
  if (param) {
    const p = fold(param);
    return fold(sasl.nick) === p || (!!sasl.account && fold(sasl.account) === p);
  }
  if (!resume) return true; // password was parked in this tab; nothing else to check
  const resumeIds = [resume.nick, resume.account]
    .filter((s): s is string => typeof s === 'string' && !!s)
    .map(fold);
  if (!resumeIds.length) return true;
  const saslIds = [sasl.nick, sasl.account]
    .filter((s): s is string => typeof s === 'string' && !!s)
    .map(fold);
  return saslIds.some((id) => resumeIds.includes(id));
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
 * Why a mint attempt produced no keycard. The distinction matters: `no_session`
 * is the site telling us the handoff cookie is gone (nothing left to resume),
 * while `unreachable` means nobody answered — it says nothing about the session,
 * so it must never be treated as a reason to end one.
 */
export type MintResult =
  | { ok: true; card: ResumeKeycard }
  | { ok: false; reason: 'no_session' | 'unreachable' };

/**
 * Mint a one-time JWT from the WordPress handoff cookie.
 *
 * Tries `/app/accounts/api/chat_resume/` first (same Apache Alias tree as
 * handoff.php), then `/accounts/api/chat_resume/`. A cookie Path=/app is only
 * sent to the first URL; a host-root rewrite may also serve a different copy.
 */
export async function mintChatResumeResult(signal?: AbortSignal): Promise<MintResult> {
  let answered = false; // at least one endpoint spoke about the session itself
  for (const url of resumeMintUrls()) {
    try {
      const r = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      // 404 (wrong path for this deployment), 429 and 5xx (proxy/site hiccup)
      // tell us nothing about whether the cookie is still good.
      if (r.status === 404 || r.status === 429 || r.status >= 500) continue;
      if (!r.ok) { answered = true; continue; } // 401/403 — signed out
      const minted = parseResumeKeycard(await r.json());
      if (minted) return { ok: true, card: minted };
      answered = true; // answered `ok: false` — no session on this path
    } catch { /* abort / offline / non-JSON → try the other path */ }
  }
  return { ok: false, reason: answered ? 'no_session' : 'unreachable' };
}

export async function mintChatResume(signal?: AbortSignal): Promise<ResumeKeycard | null> {
  const r = await mintChatResumeResult(signal);
  return r.ok ? r.card : null;
}

export interface MintRetryOptions {
  /** Total attempts, first one included (default 1 — no retry). */
  attempts?: number;
  /** Abort budget for a single attempt, so a hung endpoint can't stall boot. */
  perTryMs?: number;
  /** Wait before the next attempt, doubling each time. */
  gapMs?: number;
}

/** Wait `ms`, or resolve as soon as the browser reports the network is back. */
function waitOrOnline(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const w = typeof window === 'undefined' ? null : window;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      w?.removeEventListener('online', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    w?.addEventListener('online', finish);
  });
}

/**
 * Mint a keycard, retrying only while the failure stays transient.
 *
 * A phone coming out of standby — or a tab the browser discarded and reloaded —
 * runs this with the radio still down, so the first fetch fails instantly.
 * Giving up there would drop a perfectly good session on the join form. A site
 * that answers "no session" is final: retrying cannot change that.
 */
export async function mintChatResumeRetry(o: MintRetryOptions = {}): Promise<MintResult> {
  const attempts = Math.max(1, o.attempts ?? 1);
  const perTryMs = o.perTryMs ?? 4000;
  let gap = o.gapMs ?? 800;
  let last: MintResult = { ok: false, reason: 'unreachable' };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) { await waitOrOnline(gap); gap *= 2; }
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), perTryMs);
    try { last = await mintChatResumeResult(ctrl.signal); }
    finally { clearTimeout(to); }
    if (last.ok || last.reason === 'no_session') return last;
  }
  return last;
}
