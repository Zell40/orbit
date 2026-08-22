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
