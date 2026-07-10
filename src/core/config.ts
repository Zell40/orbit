// Runtime configuration.
//
// A static `config.json` is fetched at startup (before the app renders) and
// deep-merged over these defaults, so the client can be re-pointed at another
// IRC network and fully re-branded WITHOUT a rebuild — a deployer just edits
// /app/config.json next to the build. Anything omitted from config.json falls
// back to the defaults below.

export interface AppConfig {
  server: {
    /** WebSocket URL of the IRCv3 server (text/binary.ircv3.net subprotocols). */
    url: string;
    /** Ident for guests (not logged in). Logged-in members use their own nick.
     *  IRC idents are ASCII, so accents are folded (e.g. "Invité" → "Invite"). */
    guestIdent?: string;
  };
  startup: {
    /** Channels auto-joined on connect (the first is the primary/active one). */
    channels: string[];
    /** Suggested channels offered in the connect-screen channel picker (datalist). */
    suggestions?: string[];
    /** Channels each "j'ai envie de…" intent lands the visitor in on the connect
     *  screen. Omitted intents fall back to `channels`; the whole block is
     *  optional (no block → the intent picker isn't shown). */
    intents?: { chat?: string[]; love?: string[]; play?: string[] };
  };
  branding: {
    name: string;       // app/network name shown in the UI
    icon: string;       // logo / favicon URL
    url: string;        // homepage (used by CTCP VERSION/SOURCE too)
    tagline: string;    // connect screen — first title line
    taglineEm: string;  // connect screen — emphasised second line
    subtitle: string;   // connect screen — paragraph under the title
    projectUrl: string; // the Orbit project/source page (shown in Settings → À propos)
    links?: { label: string; url: string }[]; // extra links shown in Settings → About (rules, donate, …)
    accent?: string;    // optional accent colour override (the --accent CSS token)
  };
  turnstile: {
    // Render the anti-bot challenge inline with Cloudflare Turnstile. false = no
    // Cloudflare script; the challenge (if the SERVER requires one) is shown as a
    // link to the verification page instead. Whether a challenge is required at
    // all is decided server-side, not here.
    enabled: boolean;
    sitekey: string;
  };
  report: {
    /**
     * Services pseudo-client that receives reports (e.g. ReportServ). When set,
     * reports are sent as "REPORT <target> <reason>" to this service, which
     * queues them for staff. Preferred over `target`: a service is not blocked
     * by a +n staff channel the reporter isn't in. Empty = use `target`.
     */
    service: string;
    /** Fallback channel reports are sent to when `service` is empty. */
    target: string;
  };
  /** Default preferences for a NEW user (until they change them in Settings). */
  defaults: {
    theme: string;          // 'light' | 'dark' | 'yomirc' | 'yomirc-dark'
    compact: boolean;       // denser message rows
    sound: boolean;         // blip on mention / PM
    hideJoinQuit: boolean;  // hide join/part/quit noise
    clock24: boolean;       // 24h timestamps
    lang?: string;          // force a default UI language (e.g. 'en'); omit to auto-detect from the browser
  };
  /** Feature switches — turn whole features off for a deployment. */
  features: {
    push: boolean;          // Web Push notifications (Settings row)
    imageUpload: boolean;   // the composer image button + paste/drag upload
    register: boolean;      // account creation (the "Créer un compte" tab)
    linkPreviews: boolean;  // rich link-preview cards (via the server unfurl endpoint)
    multiNetwork: boolean;  // connect to several IRC networks at once (network switcher UI)
    sessionResume: boolean; // reopen the tab straight back into the last session (needs a same-origin keycard endpoint for logged-in members; guests just reconnect)
    passkeySasl: boolean;   // offer passkey (WebAuthn) sign-in on the connect screen — needs the server's SASL WEBAUTHN mechanism enabled
    saslScram: boolean;     // authenticate a typed password over SASL SCRAM-SHA-256 (password stays off the wire) with automatic PLAIN fallback; needs the server to offer SCRAM-SHA-256
  };
  /**
   * Operator-listed plugin scripts loaded at startup. Each entry is a URL, or an
   * object adding Subresource Integrity (recommended for off-origin plugins):
   *   "plugins": ["/app/plugins/x.js", { "url": "https://cdn/y.js", "integrity": "sha384-…" }]
   * See docs/PLUGINS.md.
   */
  plugins?: PluginEntry[];
  /** Built-in sandboxed features to enable, by name (opt-in). Currently: "dice".
   *  These ship with the app and run isolated; listing one here mounts it. */
  builtins?: string[];
  /** Optional top navbar (rendered by the built-in orbit-navbar plugin): a brand and
   *  a row of external portal links. Omit it and the bar simply doesn't appear. Brand
   *  fields default to the `branding` name/icon/url. */
  navbar?: {
    brand?: { text?: string; logo?: string; href?: string };
    links?: { label: string; icon?: string; href: string }[];
  };
  /** Search/link-unfurl metadata. Applied to <head> at boot by src/core/seo.ts
   *  (description + Open Graph/Twitter cards + canonical + JSON-LD). Fields default
   *  to `branding` (title = name, image = a preview screenshot). index.html ships a
   *  static copy for JS-less unfurlers; this overrides it per deployment. */
  seo?: {
    description?: string; // meta + og/twitter description (else branding.subtitle)
    image?: string;       // absolute URL to a ~1200×630 preview image (og:image)
    keywords?: string;
    canonical?: string;   // canonical URL (else branding.url + current path)
    twitterSite?: string; // @handle
  };
  /** Cookieless, first-party analytics. Setting `endpoint` enables the sandboxed
   *  analytics feature (no `builtins` entry needed): it beacons `session` +
   *  `pageview` events to `endpoint` (POST, no cookies) via the gated
   *  analytics.track verb. Public channel names are sent; DMs/console are redacted
   *  to a category. A same-origin `endpoint` needs no CSP change. */
  analytics?: {
    endpoint: string; // POST target for pageview beacons
    siteId?: string;  // tag each beacon to separate deployments
  };
}

/** A plugin to load: a bare URL, or a URL with options.
 *  `sandbox: true` runs it in an opaque-origin iframe reachable only through a
 *  capability-gated bridge; `permissions` lists what it may do (irc/irc-raw/notify/
 *  storage), or `["none"]` to declare zero permissions explicitly. Untrusted or
 *  community plugins should be sandboxed. Trusted first-party plugins may run in-page
 *  (the default) for the full React API. */
export type PluginEntry =
  | string
  | { url: string; integrity?: string; crossorigin?: string; sandbox?: boolean; permissions?: string[] };

const DEFAULT_CONFIG: AppConfig = {
  server: { url: 'wss://www.swaygo.fr/irc/', guestIdent: 'Invité' },
  startup: { channels: ['#accueil'], suggestions: ['#accueil', '#taverne', '#musique', '#devs', '#orbit'] },
  branding: {
    name: 'Tchatou',
    icon: 'https://tchatou.fr/static/img/favicon.svg',
    url: 'https://tchatou.fr',
    tagline: '',      // empty → connect screen falls back to the localised connect.tagline
    taglineEm: '',
    subtitle: '',
    projectUrl: 'https://orbit.tchatou.fr',
  },
  turnstile: { enabled: true, sitekey: '0x4AAAAAADlXGeFQ-Aj3Kitp' },
  report: { service: 'ReportServ', target: '#staff' },
  defaults: { theme: 'light', compact: false, sound: true, hideJoinQuit: false, clock24: true },
  features: { push: true, imageUpload: true, register: true, linkPreviews: true, multiNetwork: false, sessionResume: false, passkeySasl: false, saslScram: false },
  plugins: [],
  builtins: [],
};

let cfg: AppConfig = DEFAULT_CONFIG;

// Recursively overlay `over` onto `base`. Objects merge key-by-key; arrays and
// scalars replace wholesale (so e.g. startup.channels is replaced, not concatenated).
function deepMerge<T>(base: T, over: unknown): T {
  if (over == null || typeof over !== 'object' || Array.isArray(over)) {
    return (over ?? base) as T;
  }
  const o = over as Record<string, unknown>;
  const b = base as Record<string, unknown>;
  const out: Record<string, unknown> = { ...b };
  for (const k of Object.keys(o)) {
    out[k] = k in b ? deepMerge(b[k], o[k]) : o[k];
  }
  return out as T;
}

// Fetch and apply config.json. Call ONCE, before rendering the app.
export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-cache' });
    if (res.ok) cfg = deepMerge(DEFAULT_CONFIG, await res.json());
  } catch {
    /* no/invalid config.json — run on the built-in defaults */
  }
  return cfg;
}

export function getConfig(): AppConfig { return cfg; }

// Plugin console logging is off in production so a visitor's DevTools stays clean.
// Enabled in dev builds, or opt in on a live site with localStorage['orbit-debug']='1'.
export function pluginDebug(): boolean {
  try { return import.meta.env.DEV || localStorage.getItem('orbit-debug') === '1'; }
  catch { return import.meta.env.DEV; }
}
