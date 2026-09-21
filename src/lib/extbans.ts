// InspIRCd extban catalogue. Each entry is keyed by the single letter the server
// advertises in ISUPPORT `EXTBAN` (`<prefix>,<letters>`); `name` is the named form
// we send — InspIRCd 4's default extbanformat="any" accepts either the name or the
// letter, and the name is self-describing in the ban list (e.g. `mute:*!*@x`). Only
// entries whose letter the server actually advertises are offered, so the picker
// always reflects the modules that are loaded (core + reputation `score` +
// securitygroups). Labels resolve via i18n (extbans.<name>); `hint` is an example of
// the value shape. `acting` extbans restrict behaviour; the rest match/ban by a trait.
export interface ExtBan {
  letter: string;
  name: string;
  acting: boolean;
  hint: string;
  invexHint?: string;
  /** Acting extban whose value starts with a channel (`redirect:#salon:…`). */
  needsTarget?: boolean;
}

export const EXTBANS: ExtBan[] = [
  // Acting — restrict what matching users may do.
  { letter: 'm', name: 'mute',        acting: true,  hint: 'test!test@test.test' },
  { letter: 'c', name: 'blockcolor',  acting: true,  hint: 'test!test@test.test' },
  { letter: 'C', name: 'noctcp',      acting: true,  hint: 'test!test@test.test' },
  { letter: 'N', name: 'nonick',      acting: true,  hint: 'test!test@test.test' },
  { letter: 'T', name: 'nonotice',    acting: true,  hint: 'test!test@test.test' },
  { letter: 'S', name: 'stripcolor',  acting: true,  hint: 'test!test@test.test' },
  { letter: 'Q', name: 'nokick',      acting: true,  hint: 'test!test@test.test' },
  { letter: 'u', name: 'opmoderated', acting: true,  hint: 'test!test@test.test' },
  { letter: 'A', name: 'blockinvite', acting: true,  hint: 'test!test@test.test' },
  { letter: 'd', name: 'redirect',    acting: true,  hint: 'test!test@test.test', needsTarget: true },
  // Matching — ban by a trait.
  { letter: 'R', name: 'account',     acting: false, hint: 'baduser', invexHint: 'Jessie' },
  { letter: 'U', name: 'unauthed',    acting: false, hint: 'test!test@test.test', invexHint: '*!*@*' },
  { letter: 'g', name: 'securitygroup', acting: false, hint: 'registered' },
  { letter: 'y', name: 'score',       acting: false, hint: '-5', invexHint: '10' },
  { letter: 'G', name: 'country',     acting: false, hint: 'RU', invexHint: 'FR' },
  { letter: 's', name: 'server',      acting: false, hint: '*.example.net' },
  { letter: 'n', name: 'class',       acting: false, hint: 'main', invexHint: 'websocket' },
  { letter: 'r', name: 'realname',    acting: false, hint: 'spam_bot', invexHint: 'Ami' },
  { letter: 'a', name: 'realmask',    acting: false, hint: 'test!test@test.test+spam_bot', invexHint: 'nick!user@host+Ami' },
  { letter: 'z', name: 'fingerprint', acting: false, hint: 'a1b2c3d4e5f6' },
  { letter: 'o', name: 'oper',        acting: false, hint: 'admin' },
  { letter: 'O', name: 'opertype',    acting: false, hint: 'NetAdmin' },
  { letter: 'j', name: 'channel',     acting: false, hint: '#staff' },
  { letter: 'b', name: 'share',       acting: false, hint: '#staff' },
  { letter: 'B', name: 'bot',         acting: false, hint: '*!*@*' },
  { letter: 'w', name: 'gateway',     acting: false, hint: 'mibbit' },
];

// Parse ISUPPORT EXTBAN ("<prefix>,<letters>", prefix usually empty) into the
// catalogue entries the server supports, preserving catalogue order.
export function availableExtbans(isupport: Record<string, string>): ExtBan[] {
  const raw = isupport.EXTBAN || '';
  const letters = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!letters) return [];
  const set = new Set(letters.split(''));
  return EXTBANS.filter((e) => set.has(e.letter));
}

// Recognise a ban mask that is a typed extban ("name:..." or "letter:...") so the UI
// can label it. Returns the catalogue entry, or null for a plain nick!user@host ban.
export function matchExtban(mask: string): ExtBan | null {
  const head = mask.replace(/^!/, '').split(':', 1)[0];
  return EXTBANS.find((e) => e.name === head || e.letter === head) || null;
}

/** Placeholder / example value: a trusted identity for +I, a blocked one for +b. */
export function extbanValueHint(e: ExtBan, invex: boolean): string {
  return (invex && e.invexHint) || e.hint;
}

/** Invex / matching pickers: keep advertised types, and always offer named extras
 *  (e.g. connection class) even if that letter is missing from ISUPPORT EXTBAN. */
export function ensureMatchingExtban(list: ExtBan[], name: string): ExtBan[] {
  if (list.some((e) => e.name === name)) return list;
  const extra = EXTBANS.find((e) => e.name === name && !e.acting);
  if (!extra) return list;
  const order = EXTBANS.filter((e) => !e.acting).map((e) => e.name);
  return list.concat(extra).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

/** Same as ensureMatchingExtban, for acting types the ircd may omit from EXTBAN. */
export function ensureActingExtban(list: ExtBan[], name: string): ExtBan[] {
  if (list.some((e) => e.name === name)) return list;
  const extra = EXTBANS.find((e) => e.name === name && e.acting);
  if (!extra) return list;
  const order = EXTBANS.map((e) => e.name);
  return list.concat(extra).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

/**
 * Not an extban letter: the picker's "by nick" entry. It resolves to a plain
 * nick!user@host mask through `nickMask`, so it is never nested into
 * `buildExtbanMask` — the mask it produces goes in as an ordinary hostmask.
 * `nick` is free: no EXTBANS entry uses that name.
 */
export const NICK_PICK = 'nick';

/** How to turn a member into a ban mask. */
export type NickMaskShape = 'host' | 'nick' | 'ident' | 'exact';

export const NICK_MASK_SHAPES: NickMaskShape[] = ['host', 'nick', 'ident', 'exact'];

/**
 * Ban mask for a member. `host` is the default because it is what an operator
 * means by "ban this person": it survives a nick change, which `nick!*@*` does
 * not. Unknown ident/host (no WHO reply yet) fall back to `*`, which widens the
 * mask rather than banning nobody.
 */
export function nickMask(m: { nick: string; user?: string; host?: string }, shape: NickMaskShape): string {
  const user = m.user || '*';
  const host = m.host || '*';
  switch (shape) {
    case 'nick': return `${m.nick}!*@*`;
    case 'ident': return `*!${user}@${host}`;
    case 'exact': return `${m.nick}!${user}@${host}`;
    default: return `*!*@${host}`;
  }
}

function asHostmask(v: string): string {
  return (v.includes('@') || v.includes('!') || v.includes(':')) ? v : `${v}!*@*`;
}

function asChannel(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  return /^[#&+!]/.test(s) ? s : `#${s}`;
}

/** Build `mute:account:x`, `redirect:#poubelle:R:x`, `redirect:#poubelle:nick!*@*`. */
export function buildExtbanMask(opts: {
  ext: ExtBan;
  value: string;
  nest?: ExtBan | null;
  invert?: boolean;
  target?: string;
}): string {
  const v = opts.value.trim();
  const bang = opts.invert ? '!' : '';
  const inner = opts.nest ? `${bang}${opts.nest.name}:${v}` : (opts.ext.acting ? asHostmask(v) : v);
  if (opts.ext.needsTarget) {
    const dest = asChannel(opts.target || '');
    return dest ? `${opts.ext.name}:${dest}:${inner}` : `${opts.ext.name}:${inner}`;
  }
  return `${opts.ext.name}:${inner}`;
}
