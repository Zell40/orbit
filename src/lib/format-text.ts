// Pure text formatters — i18n only, no store or DOM — so store sub-handlers and
// other leaf code can use them without pulling in the React-heavy format.tsx
// (which imports the store). format.tsx re-exports these for its consumers.
import i18n from '../core/i18n';

export function fmtDuration(sec: number): string {
  if (sec < 60) return i18n.t('units.sec', { n: sec });
  if (sec < 3600) return i18n.t('units.min', { n: Math.floor(sec / 60) });
  if (sec < 86400) return i18n.t('units.hourMin', { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60) });
  return i18n.t('units.day', { n: Math.floor(sec / 86400) });
}

// "+iwx" → "+iwx · invisible, wallops, masked host" (named where we know them).
export function formatUserModes(modes: string): string {
  const letters = modes.replace(/^\+/, '').split('').filter(Boolean);
  if (!letters.length) return '+';
  const named = letters.map((c) => i18n.t(`umodes.${c}`, '')).filter(Boolean);
  return `+${letters.join('')}${named.length ? ` · ${named.join(', ')}` : ''}`;
}

/** Soften dense service NOTICE text for readable callouts (INFO blocks, sentences). */
export function loosenNoticeText(text: string): string {
  return text
    // "| INFO | a | INFO | b" → one block per marker
    .replace(/\s*\|\s*(INFO|WARN(?:ING)?|NOTICE|ALERTE|ERROR|ERR|OK)\s*\|\s*/gi, '\n\n$1 · ')
    // New paragraph after sentence end when the next clause starts with a capital / quote
    .replace(/([.!?…])\s+(?=[A-ZÀÂÄÆÇÉÈÊËÏÎÔŒÙÛÜŸ«"(\[])/g, '$1\n\n')
    .replace(/^\s+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
