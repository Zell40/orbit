import i18n from '../i18n';

export type ParsedChanParam =
  | { kind: 'pair'; a: number; b: number; flag?: '*' | '~' }
  | { kind: 'countDur'; n: number; dur: string }
  | { kind: 'num'; n: number }
  | { kind: 'dur'; dur: string }
  | { kind: 'chan'; chan: string };

const LETTER_KEY: Record<string, string> = {
  B: 'anticaps',
  d: 'delaymsg',
  E: 'repeat',
  f: 'flood',
  F: 'nickflood',
  H: 'history',
  j: 'joinflood',
  J: 'kicknorejoin',
  L: 'redirect',
  W: 'antisnoop',
};

export function chanParamKey(letter: string): string {
  return LETTER_KEY[letter] || '';
}

/** Ensure +L targets a channel name (`Aide.chat` → `#Aide.chat`). */
export function normalizeRedirectTarget(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return s;
  if (/^[#&+]/.test(s)) return s;
  return `#${s.replace(/^#+/, '')}`;
}

export function formatModeToken(letter: string, raw: string): string {
  const v = String(raw || '').trim();
  return v ? `+${letter} ${v}` : `+${letter}`;
}

function ircDurationLabel(raw: string): string {
  const m = String(raw || '').trim().match(/^(\d+)\s*([smhdw])?$/i);
  if (!m) return raw;
  const n = parseInt(m[1], 10);
  const u = (m[2] || 's').toLowerCase();
  if (u === 's') return i18n.t('units.sec', { n });
  if (u === 'm') return i18n.t('units.min', { n });
  if (u === 'h') return i18n.t('units.hourMin', { h: n, m: 0 }).replace(/\s*0\s*min\s*$/, '').trim();
  if (u === 'd' || u === 'w') return i18n.t('units.day', { n: u === 'w' ? n * 7 : n });
  return raw;
}

export function parseChanParam(letter: string, raw: string): ParsedChanParam | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (letter === 'L') return { kind: 'chan', chan: normalizeRedirectTarget(v) };
  if (letter === 'H') {
    const m = v.match(/^(\d+)\s*:\s*(.+)$/);
    if (m) return { kind: 'countDur', n: parseInt(m[1], 10), dur: m[2].trim() };
  }
  if (letter === 'W') return { kind: 'dur', dur: v };
  if (letter === 'd' || letter === 'J') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return { kind: 'num', n };
  }
  const pair = v.match(/^([~*]?)(\d+)\s*:\s*(\d+)$/);
  if (pair && 'BEfFj'.includes(letter)) {
    const flag = pair[1] === '*' || pair[1] === '~' ? pair[1] as '*' | '~' : undefined;
    return { kind: 'pair', a: parseInt(pair[2], 10), b: parseInt(pair[3], 10), flag };
  }
  return null;
}

/** Plain-language reading of a type B/C value (`5:10` → « 5 utilisateurs en 10 secondes »). */
export function explainChanParam(letter: string, raw: string): string {
  const key = chanParamKey(letter);
  const parsed = parseChanParam(letter, raw);
  if (!parsed || !key) return '';
  if (parsed.kind === 'chan') return i18n.t(`chanParams.${key}.live`, { chan: parsed.chan });
  if (parsed.kind === 'num') return i18n.t(`chanParams.${key}.live`, { n: parsed.n });
  if (parsed.kind === 'dur') return i18n.t(`chanParams.${key}.live`, { dur: ircDurationLabel(parsed.dur) });
  if (parsed.kind === 'countDur') {
    return i18n.t(`chanParams.${key}.live`, { n: parsed.n, dur: ircDurationLabel(parsed.dur) });
  }
  if (parsed.kind === 'pair') {
    const extra = letter === 'f'
      ? i18n.t(parsed.flag === '*' ? 'chanParams.flood.ban' : parsed.flag === '~' ? 'chanParams.flood.notify' : 'chanParams.flood.kick')
      : '';
    if (letter === 'B') return i18n.t(`chanParams.${key}.live`, { pct: parsed.a, n: parsed.b });
    return i18n.t(`chanParams.${key}.live`, { n: parsed.a, sec: parsed.b, action: extra });
  }
  return '';
}
