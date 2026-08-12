// One-shot handoff from the site's entry form.
//
// The page at the same origin (tchatou.fr) drops a short-lived marker in
// sessionStorage right before navigating to /app/?nick=…&channel=…. The nick and
// channels travel in the URL (not secret); a SASL password, if any, rides here in
// sessionStorage so it never lands in the URL, browser history, referer, or the
// server. We consume it exactly once on boot and auto-connect, so a visitor who
// already chose a pseudo on the site never sees the join form a second time.

const KEY = 'tchatou_handoff';
const MAX_AGE_MS = 60_000; // stale markers (old tab, back button) are ignored

export interface Handoff {
  password?: string;
  /** NickServ account when different from the display nick (OAUTHBEARER authzid). */
  account?: string;
  /** IRC GECOS / realname, e.g. "40 - Homme - Paris" (EntreNous MonIdentité). */
  realname?: string;
}

// Read and immediately clear the marker. Returns null when there is no fresh
// handoff (normal direct visits), so the join form shows as usual.
export function takeHandoff(): Handoff | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    return null; // storage blocked (private mode): just show the join form
  }
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as {
      password?: unknown; account?: unknown; realname?: unknown; t?: unknown;
    };
    if (typeof o.t !== 'number' || Date.now() - o.t > MAX_AGE_MS) return null;
    const password = typeof o.password === 'string' && o.password ? o.password : undefined;
    const account = typeof o.account === 'string' && o.account ? o.account : undefined;
    const realname = typeof o.realname === 'string' && o.realname.trim() ? o.realname.trim() : undefined;
    return { password, account, realname };
  } catch {
    return null;
  }
}
