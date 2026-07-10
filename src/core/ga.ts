// Google Analytics 4 — OPT-IN via config.analytics.gaId. Unlike the sandboxed
// cookieless collector, this is Google's gtag.js: it runs IN-PAGE (it needs the
// page's cookies and must reach Google's servers, so it can't be sandboxed), sets
// cookies, and requires googletagmanager.com + google-analytics.com in the app CSP.
// On an EU/French site it also needs a cookie-consent banner — that's the operator's
// call; this just wires GA when a measurement id is configured.
//
// SPA-aware: gtag only auto-counts the initial load, so we send a page_view on every
// channel switch (buffer.active). DM and console names are redacted before they
// reach Google — only public channels keep their name.
import { getConfig } from './config';
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

export function initGa(): void {
  const id = getConfig().analytics?.gaId;
  if (!id) return;
  const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() { w.dataLayer.push(arguments); };
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
