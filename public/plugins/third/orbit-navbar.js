/*
 * Orbit navbar — a brandable bar across the very top of the app: the network's logo
 * (or name) plus a row of external portal links (rules, forum, webmail, donate, …).
 * First-party, in-page. It renders only when configured, so it stays invisible by
 * default. Inspired by the classic webchat network navbar, themed to Orbit.
 *
 * Configure in config.json (brand fields fall back to `branding`):
 *   "plugins": ["/app/plugins/third/orbit-navbar.js"],
 *   "navbar": {
 *     "brand": { "text": "My Network", "logo": "/app/logo.svg", "href": "https://example.org" },
 *     "links": [
 *       { "label": "Rules", "icon": "📜", "href": "https://…" },
 *       { "label": "Forum", "icon": "💬", "href": "https://…" }
 *     ]
 *   }
 */
Orbit.plugin('orbit-navbar', (orbit, log) => {
  const cfg = orbit.config() || {};
  const nav = cfg.navbar;
  if (!nav) return; // no navbar configured — the bar simply doesn't appear

  const links = Array.isArray(nav.links) ? nav.links : [];
  const brand = nav.brand || {};
  const b = cfg.branding || {};
  const href = brand.href != null ? brand.href : b.url;

  orbit.addUi('navbar', () => {
    // Prefer what's set explicitly, then fall back to the app branding: explicit
    // logo, else explicit text, else branding icon, else branding name.
    let inner;
    if (brand.logo) inner = orbit.html`<img class="onav__logo" src=${brand.logo} alt=${brand.text || 'home'} />`;
    else if (brand.text != null) inner = orbit.html`<span class="onav__name">${brand.text}</span>`;
    else if (b.icon) inner = orbit.html`<img class="onav__logo" src=${b.icon} alt=${b.name || 'home'} />`;
    else inner = orbit.html`<span class="onav__name">${b.name || ''}</span>`;
    return orbit.html`
      <header class="onav">
        ${href
          ? orbit.html`<a class="onav__brand" href=${href} target="_blank" rel="noopener noreferrer">${inner}</a>`
          : orbit.html`<span class="onav__brand">${inner}</span>`}
        ${links.length
          ? orbit.html`<nav class="onav__links">
              ${links.map((l, i) => orbit.html`
                <a key=${i} class="onav__link" href=${l.href} target="_blank" rel="noopener noreferrer" title=${l.label}>
                  ${l.icon ? orbit.html`<span class="onav__ic" aria-hidden="true">${l.icon}</span>` : null}
                  <span class="onav__lb">${l.label}</span>
                </a>`)}
            </nav>`
          : null}
      </header>
    `;
  });
  log('navbar ready (' + links.length + ' links)');
});
