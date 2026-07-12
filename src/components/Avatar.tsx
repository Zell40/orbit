import { useAvatarUrl } from '../platform/avatars';
import { hashHue } from '../lib/format';

// `account` (when known) resolves a real uploaded avatar; otherwise fall back to
// the deterministic gradient-initial avatar (the right default for guests).
// Callers that already resolved the URL (the message list, which suppresses the
// bubble entirely when there's no real avatar) can pass `url` to skip the lookup.
export function Avatar({ nick, size = 40, account, url }: { nick: string; size?: number; account?: string | null; url?: string | null }) {
  const n = nick || '?';
  const h = hashHue(n);
  const resolved = useAvatarUrl(account);
  const src = url !== undefined ? url : resolved;
  if (src) {
    return (
      <span className="avatar group__avatar avatar--img" style={{ width: size, height: size }}>
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
        // S/L are theme-overridable (CSS vars) so night themes can dim the bubble; hue stays per-nick.
        background: `linear-gradient(140deg, hsl(${h}, var(--av-s1,80%), var(--av-l1,62%)), hsl(${(h + 45) % 360}, var(--av-s2,75%), var(--av-l2,50%)))`,
      }}
    >
      {n[0].toUpperCase()}
    </span>
  );
}
