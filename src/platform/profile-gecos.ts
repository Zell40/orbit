// Fetch the user's WordPress profile (ASL + account) from reseau-entrenous.fr
// BEFORE IRC USER (same source MonIdentité POSTs in the handoff). No post-connect SETNAME.
import { formatProfileGecos, parseProfileGecos } from '@/lib/profile-gecos';

const WP_PROFILE = 'https://www.reseau-entrenous.fr/wp-json/entrenous/v1/profile';
const gecosCache = new Map<string, string>();
const profileCache = new Map<string, WpProfile>();

export type WpProfile = {
  exists: boolean;
  login?: string;
  displayName?: string;
  age?: string;
  gender?: string;
  city?: string;
  avatar?: string;
  profileUrl?: string;
  registered?: string;
};

function flattenSexe(v: unknown): string {
  if (Array.isArray(v)) return flattenSexe(v[0]);
  return String(v ?? '').trim();
}

function flattenCity(v: unknown): string {
  if (Array.isArray(v)) return flattenCity(v[0]);
  return String(v ?? '').trim();
}

function httpUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!/^https?:\/\//i.test(s)) return undefined;
  return s;
}

function gecosFromPayload(j: unknown): string | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const o = j as { realname?: unknown; age?: unknown; sexe?: unknown; gender?: unknown; ville?: unknown; city?: unknown; exists?: unknown };
  if (typeof o.realname === 'string' && o.realname.trim()) return o.realname.trim();
  const sexe = flattenSexe(o.sexe ?? o.gender);
  const ville = flattenCity(o.ville ?? o.city);
  if (o.age != null && sexe && ville) {
    return formatProfileGecos(o.age as string | number, sexe, ville);
  }
  return undefined;
}

function parseWpProfile(j: unknown): WpProfile | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const o = j as Record<string, unknown>;
  if (o.exists === false) return { exists: false };
  const login = typeof o.login === 'string' && o.login.trim()
    ? o.login.trim()
    : (typeof o.account === 'string' && o.account.trim() ? o.account.trim() : '');
  const displayName = typeof o.display_name === 'string' ? o.display_name.trim() : '';
  let gender = flattenSexe(o.sexe ?? o.gender);
  let city = flattenCity(o.ville ?? o.city);
  let age = o.age == null || o.age === '' ? '' : String(o.age).trim();
  if (typeof o.realname === 'string' && o.realname.trim()) {
    const g = parseProfileGecos(o.realname);
    if (g) {
      if (!age && g.age) age = g.age;
      if (!gender && g.genderLabel) gender = g.genderLabel;
      if (!city && g.city) city = g.city;
    }
  }
  const avatar = httpUrl(o.avatar);
  const profileUrl = httpUrl(o.profile_url);
  const registered = typeof o.registered === 'string' ? o.registered.trim() : '';
  const exists = o.exists === true || !!(displayName || login || age || gender || city || avatar);
  if (!exists) return { exists: false };
  return {
    exists: true,
    ...(login ? { login } : {}),
    ...(displayName ? { displayName } : {}),
    ...(age ? { age } : {}),
    ...(gender ? { gender } : {}),
    ...(city ? { city } : {}),
    ...(avatar ? { avatar } : {}),
    ...(profileUrl ? { profileUrl } : {}),
    ...(registered ? { registered } : {}),
  };
}

function profileUrls(account: string): string[] {
  const q = `account=${encodeURIComponent(account)}`;
  return [
    `${WP_PROFILE}?${q}`,
    `/accounts/api/profile_gecos/?${q}`,
    `/app/accounts/api/profile_gecos/?${q}`,
  ];
}

async function fetchFirstJson(
  account: string,
  accept: (j: unknown) => boolean,
): Promise<unknown> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 4000);
  try {
    for (const url of profileUrls(account)) {
      try {
        const r = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!r.ok) continue;
        const j = await r.json();
        if (accept(j)) return j;
      } catch {
        if (ctrl.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(to);
  }
  return undefined;
}

function remember(account: string, j: unknown): void {
  const parsed = parseWpProfile(j);
  if (parsed) profileCache.set(account.toLowerCase(), parsed);
  const rn = gecosFromPayload(j);
  if (rn) gecosCache.set(account.toLowerCase(), rn);
}

export async function fetchProfileGecos(account: string): Promise<string | undefined> {
  const a = account.trim();
  if (!a) return undefined;
  const hit = gecosCache.get(a.toLowerCase());
  if (hit) return hit;
  const j = await fetchFirstJson(a, (body) => !!gecosFromPayload(body));
  if (j === undefined) return undefined;
  remember(a, j);
  return gecosFromPayload(j);
}

export async function fetchWpProfile(account: string): Promise<WpProfile | undefined> {
  const a = account.trim();
  if (!a) return undefined;
  const hit = profileCache.get(a.toLowerCase());
  if (hit) return hit;
  const j = await fetchFirstJson(a, (body) => parseWpProfile(body) != null);
  if (j === undefined) return undefined;
  remember(a, j);
  return parseWpProfile(j);
}
