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

const PREFIX_MODES = new Set(['q', 'a', 'o', 'h', 'v']);
const LIST_MODES = new Set(['b', 'e', 'I']);
const ALWAYS_PARAM = new Set(['k']);
const SET_PARAM = new Set(['l']);
const FLAG_LABEL: Record<string, string> = {
  i: 'invite', m: 'moderated', n: 'noExternal', t: 'topicLock', s: 'secret', p: 'private',
  c: 'blockColor', C: 'noCtcp', S: 'stripColor', R: 'regOnly', M: 'regModerated',
  O: 'operOnly', z: 'tlsOnly', N: 'noNickChange', K: 'noKnock', P: 'permanent',
};

function modeDisplayLabel(letter: string): string {
  if (PREFIX_MODES.has(letter)) return i18n.t(`modeline.prefix.${letter}`, letter);
  const flag = FLAG_LABEL[letter];
  if (flag) return i18n.t(`chanFlags.${flag}.label`, letter);
  if (LIST_MODES.has(letter)) return i18n.t(`modeline.list.${letter}`, letter);
  if (letter === 'k') return i18n.t('modeline.param.key', 'key');
  if (letter === 'l') return i18n.t('modeline.param.limit', 'limit');
  return letter;
}

function modeConsumesParam(letter: string, add: boolean): boolean {
  if (PREFIX_MODES.has(letter) || LIST_MODES.has(letter) || ALWAYS_PARAM.has(letter)) return true;
  return SET_PARAM.has(letter) && add;
}

/** One grouped MODE change for the callout (merge same nick, human-readable labels). */
export interface ModeDisplayGroup {
  add: boolean;
  labels: string[];
  letters: string[];
  target?: string;
}

/** Parse a channel MODE string into display groups (+oq nick nick → one row). */
export function groupModeDisplay(modestring: string, args: string[] = []): ModeDisplayGroup[] {
  const entries: Array<{ add: boolean; label: string; letter: string; target?: string }> = [];
  let add = true;
  let ai = 0;
  for (const ch of modestring) {
    if (ch === '+') { add = true; continue; }
    if (ch === '-') { add = false; continue; }
    const param = modeConsumesParam(ch, add) ? (args[ai++] ?? '?') : undefined;
    entries.push({ add, label: modeDisplayLabel(ch), letter: ch, target: param });
  }
  const groups: ModeDisplayGroup[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.add === e.add && e.target && last.target === e.target) {
      last.labels.push(e.label);
      last.letters.push(e.letter);
    } else {
      groups.push({ add: e.add, labels: [e.label], letters: [e.letter], target: e.target });
    }
  }
  return groups;
}

/** True when the grouped change is only +b/-b (shown as a BAN callout). */
export function isBanModeGroup(g: ModeDisplayGroup): boolean {
  return g.letters.length > 0 && g.letters.every((l) => l === 'b');
}

/** Nick to show for a ban mask (`user!*@*` → `user`; host/extban masks stay as-is). */
export function banTargetLabel(mask: string, hits = ''): string {
  const hit = hits.trim();
  if (hit) return hit;
  const nick = (mask.split('!')[0] || '').trim();
  if (nick && nick !== '*' && !/[~$*@]/.test(nick)) return nick;
  return mask;
}

/** Split a MODE string into prefix/flag groups vs +b/-b groups. */
export function splitModeAndBans(modestring: string, args: string[] = []): { groups: ModeDisplayGroup[]; bans: ModeDisplayGroup[] } {
  const all = groupModeDisplay(modestring, args);
  return {
    groups: all.filter((g) => !isBanModeGroup(g)),
    bans: all.filter((g) => isBanModeGroup(g) && g.target),
  };
}

/** Rebuild a MODE payload without +b/-b (those have their own BAN callout). */
export function modeStringWithoutBans(modestring: string, args: string[] = []): string | null {
  const { groups } = splitModeAndBans(modestring, args);
  if (!groups.length) return null;
  let modes = '';
  const outArgs: string[] = [];
  let lastAdd: boolean | undefined;
  for (const g of groups) {
    if (lastAdd !== g.add) { modes += g.add ? '+' : '-'; lastAdd = g.add; }
    modes += g.letters.join('');
    if (g.target) outArgs.push(g.target);
  }
  return outArgs.length ? `${modes} ${outArgs.join(' ')}` : modes;
}

/** Join role labels for a MODE sentence ("Opérateur et Fondateur"). */
export function joinModeLabels(labels: string[]): string {
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return i18n.t('modeline.twoRoles', { a: labels[0], b: labels[1] });
  return i18n.t('modeline.manyRoles', { head: labels.slice(0, -1).join(', '), last: labels[labels.length - 1] });
}

/** Natural-language clause for one grouped MODE change. */
export function formatModeChange(g: ModeDisplayGroup): string {
  const roles = joinModeLabels(g.labels);
  if (g.target) {
    return g.add
      ? i18n.t('modeline.promoted', { target: g.target, roles })
      : i18n.t('modeline.demoted', { target: g.target, roles });
  }
  return i18n.t('modeline.applied', { change: `${g.add ? '+' : '-'}${g.labels.join(', ')}` });
}

/** Soften dense service NOTICE text for readable callouts (INFO blocks, sentences). */
export function loosenNoticeText(text: string): string {
  return text
    // "| INFO | a | INFO | b" → one block per marker
    .replace(/\s*\|\s*(INFO|WARN(?:ING)?|NOTICE|ALERTE|ERROR|ERR|OK)\s*\|\s*/gi, '\n\n$1 · ')
    // "| Aide au jeu | - … | Aide au jeu | - …" → one block per custom section
    .replace(/\s*\|\s*([^|]+?)\s*\|\s*-\s*/g, '\n\n$1 · ')
    // Coalesced list notices ("… manches. • Moyen …") → one bullet per line
    .replace(/([^\n])\s*[•·▪▸►]\s+/g, '$1\n• ')
    // Leading/orphan bullets still normalize to "• "
    .replace(/^[•·▪▸►]\s*/gm, '• ')
    // Bac / game bot: emoji-led clauses on their own line
    .replace(/\s+(?=[\u{1F300}-\u{1FAFF}])/gu, '\n')
    // Player lines "Nick: …" each on their own line when concatenated
    .replace(/([^\n])\s+([A-Za-z0-9_\[\]\\^{}|`-]{1,32}:\s)/g, '$1\n$2')
    // Separator bars
    .replace(/\s*(━{3,})\s*/g, '\n$1\n')
    // New paragraph after sentence end when the next clause starts with a capital / quote
    .replace(/([.!?…])\s+(?=[A-ZÀÂÄÆÇÉÈÊËÏÎÔŒÙÛÜŸ«"(\[])/g, '$1\n\n')
    .replace(/^\s+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split a NOTICE bubble into display lines (one readable block each). */
export function splitNoticeLines(text: string): string[] {
  const parts = loosenNoticeText(text).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [String(text || '').trim()].filter(Boolean);
}

/** One block per `[ACTU …]` marker when an RSS bot concatenates several items. */
export function splitActuItems(text: string): string[] {
  const t = text.replace(/^\s+/, '').trim();
  if (!t) return [t];
  const parts = t.split(/(?=\[ACTU\b)/i).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

/** Unwrap IRC-style `<https://…>` so the leftover `<>` don't sit around the link pill. */
export function unwrapActuUrls(text: string): string {
  return text.replace(/<\s*(https?:\/\/[^\s>]+)\s*>/gi, '$1');
}

/** Headline only — drop trailing raw URLs (the preview card is the link). */
export function actuItemHeadline(text: string): string {
  return unwrapActuUrls(text)
    .replace(/\s*[-–]?\s*https?:\/\/[^\s<>"']+/gi, '')
    .replace(/\s+[-–]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
