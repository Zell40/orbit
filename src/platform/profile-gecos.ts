// Fetch the user's age/gender/city GECOS from WordPress (via same-origin proxy).
// WP profile is the source of truth; applied to ConnectOptions.realname before USER.
import { formatProfileGecos } from '@/lib/profile-gecos';

export async function fetchProfileGecos(account: string): Promise<string | undefined> {
  const a = account.trim();
  if (!a) return undefined;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`/accounts/api/profile_gecos/?account=${encodeURIComponent(a)}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(to));
    if (!r.ok) return undefined;
    const j = await r.json() as { ok?: boolean; realname?: string | null; age?: number; sexe?: string; ville?: string };
    if (typeof j.realname === 'string' && j.realname.trim()) return j.realname.trim();
    // Defensive: if the proxy ever returns raw fields instead of GECOS.
    if (j.age != null && j.sexe && j.ville) {
      return formatProfileGecos(j.age, j.sexe, j.ville);
    }
  } catch { /* offline / no endpoint */ }
  return undefined;
}
