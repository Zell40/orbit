// Google Analytics 4 — OPT-IN via config.analytics.gaId, using Google Consent
// Mode v2 (advanced), matching the marketing site. gtag.js loads for everyone but
// starts DENIED: no cookies, only anonymous cookieless pings until the visitor opts
// in via the consent banner / settings toggle, which flips it with setGaConsent().
// Consent is SHARED with tchatou.fr through the tchatou-consent key (same origin),
// so a prior grant is restored here before the first hit. Needs googletagmanager.com
// + google-analytics.com in the app CSP.
//
// SPA-aware: gtag only auto-counts the initial load, so we send a page_view on every
// channel switch (buffer.active). DM and console names are redacted before they
// reach Google — only public channels keep their name.
import { getConfig } from './config';
import { getConsent } from './consent';
import { bus } from '../modules/bus';

function pagePath(name: string): string {
  if (!name) return '/';
  const c = name[0];
  return c === '#' || c === '&' ? '/channel/' + name.replace(/^[#&]+/, '') : '/direct';
}
function pageTitle(name: string): string {
  const c = name[0];
  return c === '#' || c === '&' ? name : 'Direct';
}

let loaded = false;

// Load gtag.js in the denied-by-default consent state. Called once at boot. A prior
// grant (from this app or the marketing site) is restored before gtag.js runs.
export function initGa(): void {
  if (loaded) return;
  const id = getConfig().analytics?.gaId;
  if (!id) return;
  loaded = true;
  const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() { w.dataLayer.push(arguments); };
  w.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });
  if (getConsent() === 'granted') setGaConsent(true);
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
  w.gtag('js', new Date());
  w.gtag('config', id);
  bus.on('connected', () => w.gtag('event', 'login', { method: 'irc' }));
  bus.on('buffer.active', (name: unknown) => {
    const n = String(name ?? '');
    w.gtag('event', 'page_view', { page_path: pagePath(n), page_title: pageTitle(n) });
  });
}

// Flip the consent state (banner Accept/Refuse, settings toggle). The tag is already
// loaded by initGa(); this tells gtag whether it may use storage. This is an ad-free
// site, so ONLY audience measurement is ever granted — the ad signals (ad_storage /
// ad_user_data / ad_personalization) stay denied, matching the marketing site.
// Denying also clears any GA cookies already set.
export function setGaConsent(granted: boolean): void {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void };
  if (typeof w.gtag !== 'function') return;
  w.gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
  if (!granted) clearGaCookies();
}

function clearGaCookies(): void {
  try {
    const host = location.hostname;
    const base = host.replace(/^www\./, '');
    for (const c of document.cookie.split(';')) {
      const nm = c.split('=')[0].trim();
      if (!(nm.startsWith('_ga') || nm === '_gid' || nm === '_gat')) continue;
      for (const dom of ['', `; domain=${host}`, `; domain=.${base}`])
        document.cookie = `${nm}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${dom}`;
    }
  } catch { /* ignore */ }
}
