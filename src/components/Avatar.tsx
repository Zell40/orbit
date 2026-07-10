import { useAvatarUrl } from '../platform/avatars';
import { hashHue } from '../lib/format';

// `account` (when known) resolves a real uploaded avatar; otherwise fall back to
// the deterministic gradient-initial avatar (the right default for guests).
export function Avatar({ nick, size = 40, account }: { nick: string; size?: number; account?: string | null }) {
  const n = nick || '?';
  const h = hashHue(n);
  const url = useAvatarUrl(account);
  if (url) {
    return (
      <span className="avatar group__avatar avatar--img" style={{ width: size, height: size }}>
        <img src={url} alt={n} loading="lazy" decoding="async" width={size} height={size}
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
