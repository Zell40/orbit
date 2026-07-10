// Analytics consent (opt-in). Google Analytics sets cookies, so on an EU/French
// site it must not load until the visitor agrees — gtag is gated on this. Stored in
// localStorage; 'unset' means "not asked yet" (the banner shows). Withdrawable from
// Settings. The first-party cookieless collector does NOT depend on this (no cookie).
const KEY = 'tchatou:analytics-consent';
export type Consent = 'granted' | 'denied' | 'unset';

export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : 'unset';
  } catch {
    return 'unset';
  }
}

export function setConsent(v: 'granted' | 'denied'): void {
  try { localStorage.setItem(KEY, v); } catch { /* private mode / quota */ }
}
