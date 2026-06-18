import { useAvatarUrl } from '../services/avatars';

function hue(nick: string): number {
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) % 360;
  return h;
}

// `account` (when known) resolves a real uploaded avatar; otherwise fall back to
// the deterministic gradient-initial avatar (the right default for guests).
export function Avatar({ nick, size = 40, account }: { nick: string; size?: number; account?: string | null }) {
  const n = nick || '?';
  const h = hue(n);
  const url = useAvatarUrl(account);
  if (url) {
    return (
      <span className="avatar group__avatar avatar--img" style={{ width: size, height: size }}>
        <img src={url} alt={n} loading="lazy" width={size} height={size}
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
        background: `linear-gradient(140deg, hsl(${h},80%,62%), hsl(${(h + 45) % 360},75%,50%))`,
      }}
    >
      {n[0].toUpperCase()}
    </span>
  );
}
