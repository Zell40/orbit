// Runtime configuration, webchat-style.
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
  };
  startup: {
    /** Channels auto-joined on connect (the first is the primary/active one). */
    channels: string[];
  };
  branding: {
    name: string;       // app/network name shown in the UI
    icon: string;       // logo / favicon URL
    url: string;        // homepage (used by CTCP VERSION/SOURCE too)
    tagline: string;    // connect screen — first title line
    taglineEm: string;  // connect screen — emphasised second line
    subtitle: string;   // connect screen — paragraph under the title
    projectUrl: string; // the Orbit project/source page (shown in Settings → À propos)
  };
  turnstile: {
    enabled: boolean;   // require the Cloudflare Turnstile challenge on register
    sitekey: string;
  };
  report: {
    /** Channel that user reports (/report) are sent to. */
    target: string;
  };
  /** Default preferences for a NEW user (until they change them in Settings). */
  defaults: {
    theme: string;          // 'light' | 'dark' | 'yomirc' | 'yomirc-dark'
    compact: boolean;       // denser message rows
    sound: boolean;         // blip on mention / PM
    hideJoinQuit: boolean;  // hide join/part/quit noise
    clock24: boolean;       // 24h timestamps
  };
  /** Feature switches — turn whole features off for a deployment. */
  features: {
    push: boolean;          // Web Push notifications (Settings row)
    imageUpload: boolean;   // the composer image button + paste/drag upload
    register: boolean;      // account creation (the "Créer un compte" tab)
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  server: { url: 'wss://www.swaygo.fr/irc/' },
  startup: { channels: ['#taverne'] },
  branding: {
    name: 'Tchatou',
    icon: 'https://tchatou.fr/static/img/favicon.svg',
    url: 'https://tchatou.fr',
    tagline: 'Le tchat français,',
    taglineEm: 'en direct.',
    subtitle: 'Salons publics, messages privés, modération — et zéro inscription. Choisis un pseudo et rejoins la conversation, avec toute la France.',
    projectUrl: 'https://orbit.tchatou.fr',
  },
  turnstile: { enabled: true, sitekey: '0x4AAAAAADlXGeFQ-Aj3Kitp' },
  report: { target: '#staff' },
  defaults: { theme: 'light', compact: false, sound: true, hideJoinQuit: false, clock24: true },
  features: { push: true, imageUpload: true, register: true },
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
