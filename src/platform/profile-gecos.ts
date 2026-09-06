// Fetch the user's age/gender/city GECOS from WordPress BEFORE IRC USER
// (same source MonIdentité POSTs in the handoff). No post-connect SETNAME.
import { formatProfileGecos } from '@/lib/profile-gecos';

const WP_PROFILE = 'https://www.reseau-entrenous.fr/wp-json/entrenous/v1/profile';
const gecosCache = new Map<string, string>();

function flattenSexe(v: unknown): string {
  if (Array.isArray(v)) return flattenSexe(v[0]);
  return String(v ?? '').trim();
}

function flattenCity(v: unknown): string {
  if (Array.isArray(v)) return flattenCity(v[0]);
  return String(v ?? '').trim();
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

function profileUrls(account: string): string[] {
  const q = `account=${encodeURIComponent(account)}`;
  return [
    `${WP_PROFILE}?${q}`,
    `/accounts/api/profile_gecos/?${q}`,
    `/app/accounts/api/profile_gecos/?${q}`,
  ];
}

export async function fetchProfileGecos(account: string): Promise<string | undefined> {
  const a = account.trim();
  if (!a) return undefined;
  const hit = gecosCache.get(a.toLowerCase());
  if (hit) return hit;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 4000);
  try {
    for (const url of profileUrls(a)) {
      try {
        const r = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!r.ok) continue;
        const rn = gecosFromPayload(await r.json());
        if (rn) {
          gecosCache.set(a.toLowerCase(), rn);
          return rn;
        }
      } catch {
        if (ctrl.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(to);
  }
  return undefined;
}
