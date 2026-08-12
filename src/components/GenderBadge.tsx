import type { GenderKind } from '@/lib/profile-gecos';

const TITLE: Record<GenderKind, string> = {
  m: 'Homme',
  f: 'Femme',
  x: 'Genre non indiqué',
};

/** Compact gender mark for member list / profile (colour + glyph). */
export function GenderBadge({
  gender,
  size = 'sm',
}: {
  gender: GenderKind;
  size?: 'sm' | 'md';
}) {
  const cls = `gender-badge gender-badge--${gender} gender-badge--${size}`;
  const glyph = gender === 'm' ? '♂' : gender === 'f' ? '♀' : '○';
  return (
    <span className={cls} title={TITLE[gender]} aria-label={TITLE[gender]}>
      {glyph}
    </span>
  );
}
