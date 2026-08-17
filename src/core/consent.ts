// Analytics consent (opt-in) for Google Analytics. Same-origin deployments can
// share this key with the marketing site so a visitor who already chose is not
// asked again in the app. Legacy `tchatou-consent` is migrated once.
import { lsRead, lsWrite } from '@/lib/storage-keys';

const KEY = 'orbit-consent';
const LEGACY_KEY = 'tchatou-consent';
const TTL = 1000 * 60 * 60 * 24 * 180; // re-ask after ~6 months
export type Consent = 'granted' | 'denied' | 'unset';

export function getConsent(): Consent {
  try {
    const o = JSON.parse(lsRead(KEY, LEGACY_KEY) || 'null');
    if (o && o.t && Date.now() - o.t < TTL && (o.v === 'granted' || o.v === 'denied')) return o.v;
  } catch { /* bad JSON / no storage */ }
  return 'unset';
}

export function setConsent(v: 'granted' | 'denied'): void {
  lsWrite(KEY, JSON.stringify({ v, t: Date.now() }));
}
