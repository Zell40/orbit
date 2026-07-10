// Analytics consent (opt-in) for Google Analytics. SHARED with the Django site:
// tchatou.fr and tchatou.fr/app are the same origin, so we read/write the exact same
// localStorage entry the marketing site's static/js/consent.js uses — key
// `tchatou-consent`, value `{v:'granted'|'denied', t:epochMs}`, re-asked after ~6
// months. A visitor who already chose on tchatou.fr is never asked again in the app;
// the app's own banner only appears for someone who opens /app/ directly (e.g. the
// installed PWA) and writes the same shared entry so the choice stays in sync.
const KEY = 'tchatou-consent';
const TTL = 1000 * 60 * 60 * 24 * 180; // re-ask after ~6 months (matches consent.js)
export type Consent = 'granted' | 'denied' | 'unset';

export function getConsent(): Consent {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && o.t && Date.now() - o.t < TTL && (o.v === 'granted' || o.v === 'denied')) return o.v;
  } catch { /* bad JSON / no storage */ }
  return 'unset';
}

export function setConsent(v: 'granted' | 'denied'): void {
  try { localStorage.setItem(KEY, JSON.stringify({ v, t: Date.now() })); } catch { /* private mode / quota */ }
}
