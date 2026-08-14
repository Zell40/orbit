import { useAvatarUrl } from '../platform/avatars';
import { hashHue } from '../lib/format';

// `account` (when known) resolves a real uploaded avatar; otherwise fall back to
// the deterministic gradient-initial avatar (the right default for guests).
// Callers that already resolved the URL (the message list, which suppresses the
// bubble entirely when there's no real avatar) can pass `url` to skip the lookup.
// `ring` draws a coloured outline (e.g. EntreNous gender colour from GECOS).
export function Avatar({
  nick, size = 40, account, url, ring,
}: {
  nick: string;
  size?: number;
  account?: string | null;
  url?: string | null;
  ring?: string | null;
}) {
  const n = nick || '?';
  const h = hashHue(n);
  const resolved = useAvatarUrl(account);
  const src = url !== undefined ? url : resolved;
  const ringStyle = ring
    ? { boxShadow: `0 0 0 2.5px ${ring}, 0 0 0 4px color-mix(in srgb, ${ring} 25%, transparent)` }
    : undefined;
  if (src) {
    return (
      <span className="avatar group__avatar avatar--img" style={{ width: size, height: size, ...ringStyle }}>
        <img src={src} alt={n} loading="lazy" decoding="async" width={size} height={size}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </span>
    );
  }
  return (
    <span
      className="avatar group__avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(140deg, hsl(${h}, var(--av-s1,80%), var(--av-l1,62%)), hsl(${(h + 45) % 360}, var(--av-s2,75%), var(--av-l2,50%)))`,
        ...ringStyle,
      }}
    >
      {n[0].toUpperCase()}
    </span>
  );
}
