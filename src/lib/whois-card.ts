import { roleForPrefix } from './roles';

const PROFILE_HOST = 'https://www.reseau-entrenous.fr/profil/';
const PREFIXES = '~&!@%+';
const TOP_PREFIX = ['~', '&', '!', '@', '%', '+'];

/** Public profile of a registered NickServ account. Guests have none. */
export function profileUrl(account: string): string {
  return PROFILE_HOST + encodeURIComponent(account);
}

/** WHOIS "Profil: https://…/profil/Compte" — shown as a button, not as text. */
export function isProfileInfoLine(line: string): boolean {
  return profileAccountFromLine(line) !== '';
}

/** NickServ account named in a profile WHOIS line, or empty. */
export function profileAccountFromLine(line: string): string {
  const body = line.trim().replace(/^profil\s*:\s*/i, '');
  if (!body.toLowerCase().startsWith(PROFILE_HOST)) return '';
  try {
    const name = decodeURIComponent(new URL(body).pathname.split('/').filter(Boolean).pop() || '');
    return name.trim();
  } catch {
    return '';
  }
}

/** "is connecting from France" / "is connecting from an unknown country". */
export function connectingPlace(line: string): 'unknown' | string | null {
  const m = line.trim().match(/^is connecting from (.+)$/i);
  if (!m) return null;
  const place = m[1].trim();
  if (/^an unknown country$/i.test(place)) return 'unknown';
  return place;
}

let englishRegions: Map<string, string> | null = null;

function regionCode(englishName: string): string | undefined {
  if (!englishRegions && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    englishRegions = new Map();
    const en = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a) + String.fromCharCode(b);
        const name = en.of(code);
        if (name && name !== code) englishRegions.set(name.toLowerCase(), code);
      }
    }
  }
  return englishRegions?.get(englishName.toLowerCase());
}

/** English GeoIP country name → the active locale's name, when it is known. */
export function localCountryName(englishName: string, locale = 'fr'): string {
  const code = regionCode(englishName);
  if (!code || typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') return englishName;
  return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || englishName;
}

export type ReputationTier = 'excellent' | 'great' | 'good' | 'fair' | 'low' | 'bad';

/** 10000 is the top of the presence score. A low score is a recent presence, not a weak one. */
export function reputationTier(score: number): ReputationTier {
  if (score >= 8000) return 'excellent';
  if (score >= 5000) return 'great';
  if (score >= 2500) return 'good';
  if (score >= 500) return 'fair';
  if (score >= 0) return 'low';
  return 'bad';
}

export interface WhoisChannelTag {
  name: string;
  mark: string;
  cls: string;
}

/** `~@#salon` (multi-prefix) → the channel and its highest access mark. */
export function parseWhoisChannels(raw: string): WhoisChannelTag[] {
  const out: WhoisChannelTag[] = [];
  for (const token of raw.split(/\s+/)) {
    if (!token) continue;
    let i = 0;
    while (i < token.length && PREFIXES.includes(token[i])) i++;
    const name = token.slice(i);
    if (!name.startsWith('#') && !name.startsWith('&')) continue;
    const marks = token.slice(0, i);
    const mark = TOP_PREFIX.find((p) => marks.includes(p)) || '';
    out.push({ name, mark, cls: roleForPrefix(mark).cls });
  }
  return out;
}
