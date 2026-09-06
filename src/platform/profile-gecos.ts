// Fetch the user's age/gender/city GECOS from WordPress (via same-origin proxy).
// WP profile is the source of truth; applied to ConnectOptions.realname before USER.
import { formatProfileGecos } from '@/lib/profile-gecos';

function profileGecosUrls(account: string): string[] {
  const q = `account=${encodeURIComponent(account)}`;
  // Alias /app → WEBROOT (same tree as profile-gecos.php) first; host-root
  // rewrite may 404 or hit a different copy.
  return [
    `/app/accounts/api/profile_gecos/?${q}`,
    `/accounts/api/profile_gecos/?${q}`,
  ];
}

function gecosFromPayload(j: unknown): string | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const o = j as { realname?: unknown; age?: unknown; sexe?: unknown; ville?: unknown };
  if (typeof o.realname === 'string' && o.realname.trim()) return o.realname.trim();
  if (o.age != null && o.sexe && o.ville) {
    return formatProfileGecos(o.age as string | number, String(o.sexe), String(o.ville));
  }
  return undefined;
}

export async function fetchProfileGecos(account: string): Promise<string | undefined> {
  const a = account.trim();
  if (!a) return undefined;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 4000);
  try {
    for (const url of profileGecosUrls(a)) {
      try {
        const r = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        });
        if (!r.ok) continue;
        const rn = gecosFromPayload(await r.json());
        if (rn) return rn;
      } catch {
        if (ctrl.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(to);
  }
  return undefined;
}
