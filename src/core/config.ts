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
    /** When true, guests from the original join form use their nick as ident
     *  (`Ada!Ada@host`) instead of `guestIdent` (`Ada!ENuser@host`). Logged-in
     *  members always use their nick. */
    guestIdentFromNick?: boolean;
    /** Default WebSocket URL of a bouncer gateway (ZNC / KiwiBNC via webircgateway). */
    bouncerUrl?: string;
    /** webircgateway HOST target so Orbit hits ZNC, not a random [upstream.N].
     *  Same shape as Kiwi: `host:+port` (leading `+` = TLS). */
    bouncerHost?: string;
    /** Default ZNC network name pre-filled on the bouncer form (Kiwi’s « Réseau »). */
    bouncerNetwork?: string;
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
    /** Public WordPress (or site) registration URL — guest prompt CTA. */
    registerUrl?: string;
    /** Site chat-login page. The bouncer “reconnect without bouncer” CTA sends
     *  members here (`?direct=1&channel=…`) so they only click Connect. Empty =
     *  Orbit’s own join form. */
    loginUrl?: string;
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
    /**
     * When set, the profile "Report" action opens a query with this nick
     * (e.g. SignalMoi) and prefills a natural-language draft naming the target,
     * instead of the report modal. No REPORT command is inserted — HelpServ
     * handles the ticket after the user's first real message.
     */
    query?: string;
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
    /** When true (default), WEBPUSH needs a NickServ account — toggling push while
     *  a guest shows an error instead of silently ignoring the click. */
    pushRequireAccount?: boolean;
    imageUpload: boolean;   // the composer image button + paste/drag upload
    register: boolean;      // account creation (the "Créer un compte" tab)
    linkPreviews: boolean;  // rich link-preview cards (via the server unfurl endpoint)
    multiNetwork: boolean;  // connect to several IRC networks at once (network switcher UI)
    sessionResume: boolean; // reopen the tab straight back into the last session (needs a same-origin keycard endpoint for logged-in members; guests just reconnect)
    passkeySasl: boolean;   // offer passkey (WebAuthn) sign-in on the connect screen — needs the server's SASL WEBAUTHN mechanism enabled
    saslScram: boolean;     // authenticate a typed password over SASL SCRAM-SHA-256 (password stays off the wire) with automatic PLAIN fallback; needs the server to offer SCRAM-SHA-256
    saslOauthBearer: boolean; // site handoff / keycard uses SASL OAUTHBEARER (RFC 7628) with the JWT as Bearer token; falls back to PLAIN if the server does not offer it
    webmcp: boolean;        // expose the chat as WebMCP tools for AI agents (browsers that support document.modelContext); no-op elsewhere
    bouncer: boolean;       // offer "via a bouncer (ZNC)" on the connect screen — PASS login, optional SASL
  };
  /** Composer /upload retention. Server `filehost-upload.php` must match. */
  filehost?: {
    /** Default hours before a shared image/voice file is deleted (default 24). */
    retentionHours?: number;
    /** Durations the user may pick at send time (hours). Empty = no picker. */
    retentionChoices?: number[];
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
  /** Analytics — two independent, opt-in backends (set either, both, or neither):
   *  - `endpoint`: the cookieless first-party collector. Enables the sandboxed
   *    analytics feature; beacons `session`+`pageview` (POST, no cookies) via the
   *    gated analytics.track verb. Same-origin needs no CSP change.
   *  - `gaId`: a Google Analytics 4 measurement id (G-XXXX). Loads gtag.js IN-PAGE
   *    (see src/core/ga.ts) and sends a page_view per channel switch. Third-party +
   *    cookies: needs googletagmanager.com/google-analytics.com in the app CSP and,
   *    on an EU site, a cookie-consent banner. DMs/console are redacted either way. */
  analytics?: {
    endpoint?: string; // POST target for the cookieless first-party collector
    siteId?: string;   // tag each first-party beacon to separate deployments
    gaId?: string;     // Google Analytics 4 measurement id (G-XXXXXXX)
  };
  /** The network's securitygroup names, for the securitygroup extban quick-pick.
   *  The ircd doesn't advertise them, so list them here to click instead of type. */
  /** Optional Jitsi conference plugin settings (orbit-conference). */
  conference?: {
    /** Jitsi Meet domain, e.g. meet.example.com (no https://). */
    server?: string;
    /** JWT / EXTJWT auth against a self-hosted Jitsi (not public meet.jit.si). */
    secure?: boolean;
    /** Value of the +entrenous.fr/conference client tag. */
    tagID?: string;
    channels?: boolean;
    queries?: boolean;
    enabledInChannels?: string[];
    disabledInChannels?: string[];
    viewHeight?: string;
    inviteText?: string;
    joinText?: string;
    joinButtonText?: string;
    /** Require a logged-in IRC account to start or join (cannot be relaxed per channel). */
    requireAccount?: boolean;
    /** On channels, only ops (~&@, optionally %) may start a conference. */
    requireChannelOp?: boolean;
    /** Prefixes allowed to start (default "~&@"). */
    startPrefixes?: string;
    /** Security-group name fragments that forbid join/start (matched in WHOIS special). */
    denyGroups?: string[];
    /** If set, user must match at least one (WHOIS special / account heuristics). */
    requireGroups?: string[];
    /** Soft cap passed to Jitsi configOverwrite (server MAX_PARTICIPANTS is authoritative). */
    maxParticipantsChannel?: number;
    maxParticipantsQuery?: number;
    /** Channels where any registered member may start (ops still get Jitsi moderator). */
    anyoneCanStartIn?: string[];
    /** Per-channel overrides (requireChannelOp, maxParticipants). requireAccount stays global. */
    channelRules?: Record<string, { requireChannelOp?: boolean; maxParticipants?: number }>;
    /** Append public Meet URL in the IRC invite (for non-Orbit clients). */
    publicLinkInInvite?: boolean;
    /** Hide tagged conference IRC lines in Orbit (Join banner instead). */
    hideInviteForOrbit?: boolean;
  };
  /** Optional ASL (age / gender / city) gate on the connect screen (orbit-asl).
   *  Only applied when `orbit-asl` is listed in `plugins`. */
  asl?: {
    /** Block connect when age is empty. */
    requireAge?: boolean;
    /** Block connect when gender is not chosen. */
    requireGender?: boolean;
    /** Block connect when city is empty. */
    requireCity?: boolean;
    /** Block connect when age is below this number (also requires a filled age). */
    minAge?: number;
  };
  securityGroups?: string[];
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
  server: { url: 'wss://www.swaygo.fr/irc/', guestIdent: 'Invité', guestIdentFromNick: false },
  startup: { channels: ['#accueil'], suggestions: ['#accueil', '#taverne', '#musique', '#devs', '#orbit'] },
  branding: {
    name: 'Orbit',
    icon: '/app/orbit-icon.svg',
    url: '',
    tagline: '',      // empty → connect screen falls back to the localised connect.tagline
    taglineEm: '',
    subtitle: '',
    projectUrl: '',
  },
  turnstile: { enabled: true, sitekey: '0x4AAAAAADlXGeFQ-Aj3Kitp' },
  report: { service: 'ReportServ', target: '#staff' },
  defaults: { theme: 'light', compact: false, sound: true, hideJoinQuit: false, clock24: true },
  features: { push: true, pushRequireAccount: true, imageUpload: true, register: true, linkPreviews: true, multiNetwork: false, sessionResume: false, passkeySasl: false, saslScram: false, saslOauthBearer: false, webmcp: true, bouncer: false },
  filehost: { retentionHours: 24, retentionChoices: [1, 6, 24, 72] },
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

/** True when an operator-listed plugin URL contains `needle` (e.g. `orbit-asl`). */
export function pluginListed(needle: string, config = getConfig()): boolean {
  const n = needle.toLowerCase();
  return (config.plugins ?? []).some((p) => {
    const url = typeof p === 'string' ? p : p.url;
    return (url || '').toLowerCase().includes(n);
  });
}

// Plugin console logging is off in production so a visitor's DevTools stays clean.
// Enabled in dev builds, or opt in on a live site with localStorage['orbit-debug']='1'.
export function pluginDebug(): boolean {
  try { return import.meta.env.DEV || localStorage.getItem('orbit-debug') === '1'; }
  catch { return import.meta.env.DEV; }
}
