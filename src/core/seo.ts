// Config-driven document metadata, applied to <head> at boot once config.json is
// resolved: description, Open Graph + Twitter cards (so a shared /app/ link unfurls
// with the brand), a canonical link, and a WebApplication JSON-LD block.
//
// This is core (trusted), not a plugin: it writes <head>, which the plugin sandbox
// deliberately can't reach. index.html ships static tags for JS-less unfurlers
// (Slack/Discord/etc. don't run scripts); this refines them per deployment for
// consumers that do render JS (search crawlers, in-app), and keeps the metadata
// consistent when config re-brands the client.
import { getConfig } from './config';

function meta(attr: 'name' | 'property', key: string, content: string): void {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

function linkRel(rel: string, href: string): void {
  if (!href) return;
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
}

export function applySeo(): void {
  try {
    const { branding: b, seo = {} } = getConfig();
    const name = b.name || document.title;
    const desc = seo.description || b.subtitle
      || document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '';
    const image = seo.image || '';
    const url = seo.canonical || (b.url ? b.url.replace(/\/+$/, '') + location.pathname : location.href);

    meta('name', 'description', desc);
    if (seo.keywords) meta('name', 'keywords', seo.keywords);
    linkRel('canonical', url);

    meta('property', 'og:type', 'website');
    meta('property', 'og:site_name', name);
    meta('property', 'og:title', name);
    meta('property', 'og:description', desc);
    meta('property', 'og:url', url);
    if (image) meta('property', 'og:image', image);

    meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    if (seo.twitterSite) meta('name', 'twitter:site', seo.twitterSite);
    meta('name', 'twitter:title', name);
    meta('name', 'twitter:description', desc);
    if (image) meta('name', 'twitter:image', image);

    const ld: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name,
      applicationCategory: 'CommunicationApplication',
      operatingSystem: 'Any',
      url,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    };
    if (desc) ld.description = desc;
    if (image) ld.image = image;
    let s = document.getElementById('orbit-jsonld') as HTMLScriptElement | null;
    if (!s) { s = document.createElement('script'); s.id = 'orbit-jsonld'; s.type = 'application/ld+json'; document.head.appendChild(s); }
    s.textContent = JSON.stringify(ld);
  } catch { /* head stays as index.html shipped it */ }
}
