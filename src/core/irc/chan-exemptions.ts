// InspIRCd exemptchanops (+X) restriction names (docs.inspircd.org/4/exemptions).
// Entry format on the wire: `<restriction>:<prefix>` e.g. `anticaps:o`.

import i18n from '../i18n';

export type ChanExemption = {
  /** Restriction token stored in the +X list. */
  name: string;
  /** Related channel mode letter (to hide when the ircd lacks that module). */
  mode: string;
  /** i18n key under `chanExemptions.*`. */
  key: string;
};

/** Prefix ranks offered when adding a +X exemption (InspIRCd PREFIX). */
export const EXEMPT_PREFIXES = ['o', 'h', 'v', 'a', 'q', '*'] as const;

export const CHAN_EXEMPTIONS: ChanExemption[] = [
  { name: 'topiclock', mode: 't', key: 'topiclock' },
  { name: 'anticaps', mode: 'B', key: 'anticaps' },
  { name: 'auditorium-see', mode: 'u', key: 'auditoriumSee' },
  { name: 'auditorium-vis', mode: 'u', key: 'auditoriumVis' },
  { name: 'blockcolor', mode: 'c', key: 'blockcolor' },
  { name: 'blockhighlight', mode: 'V', key: 'blockhighlight' },
  { name: 'delaymsg', mode: 'd', key: 'delaymsg' },
  { name: 'filter', mode: 'g', key: 'filter' },
  { name: 'flood', mode: 'f', key: 'flood' },
  { name: 'nickflood', mode: 'F', key: 'nickflood' },
  { name: 'noctcp', mode: 'C', key: 'noctcp' },
  { name: 'nonick', mode: 'N', key: 'nonick' },
  { name: 'nonotice', mode: 'T', key: 'nonotice' },
  { name: 'opmoderated', mode: 'U', key: 'opmoderated' },
  { name: 'regmoderated', mode: 'M', key: 'regmoderated' },
  { name: 'repeat', mode: 'E', key: 'repeat' },
  { name: 'stripcolor', mode: 'S', key: 'stripcolor' },
];

/** Parse `anticaps:o` → { restriction, prefix }. */
export function parseExemptEntry(raw: string): { restriction: string; prefix: string } | null {
  const s = String(raw || '').trim();
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  return { restriction: s.slice(0, i), prefix: s.slice(i + 1) };
}

export function formatExemptEntry(restriction: string, prefix: string): string {
  return `${restriction}:${prefix || 'o'}`;
}

/** Exemptions whose related mode letter is advertised on this network. */
export function advertisedExemptions(letters: Set<string>): ChanExemption[] {
  if (!letters.size) return CHAN_EXEMPTIONS;
  return CHAN_EXEMPTIONS.filter((e) => letters.has(e.mode));
}

/** Human gloss for `flood:h` → « exception au flood pour les halfops ». */
export function explainExemptEntry(raw: string): string {
  const p = parseExemptEntry(raw);
  if (!p) return String(raw || '').trim();
  const ex = CHAN_EXEMPTIONS.find((e) => e.name === p.restriction);
  const what = ex
    ? i18n.t(`chanExemptions.${ex.key}.what`, i18n.t(`chanExemptions.${ex.key}.label`, p.restriction))
    : p.restriction;
  if (p.prefix === '*') return i18n.t('modeline.exemptAny', { what });
  const who = i18n.t(`modeline.exemptWho.${p.prefix}`, p.prefix);
  return i18n.t('modeline.exemptDetail', { what, who });
}
