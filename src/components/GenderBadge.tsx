import type { GenderKind } from '@/lib/profile-gecos';
import { GENDER_COLOR } from '@/lib/profile-gecos';

const TITLE: Record<GenderKind, string> = {
  m: 'Homme',
  f: 'Femme',
  x: 'Autre',
};

/** Compact gender mark — only render when GECOS matched a known profile shape. */
export function GenderBadge({
  gender,
  size = 'sm',
}: {
  gender: GenderKind;
  size?: 'sm' | 'md';
}) {
  const cls = `gender-badge gender-badge--${gender} gender-badge--${size}`;
  const glyph = gender === 'm' ? '♂' : gender === 'f' ? '♀' : '◇';
  return (
    <span
      className={cls}
      title={TITLE[gender]}
      aria-label={TITLE[gender]}
      style={{ background: GENDER_COLOR[gender], color: '#fff' }}
    >
      {glyph}
    </span>
  );
}
