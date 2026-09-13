// Curated InspIRCd user / channel modes for Orbit UI.
//
// Letters are filtered against ISUPPORT USERMODES / CHANMODES (and RPL_MYINFO
// usermodes as fallback) so a network only sees modes its ircd actually has.
// Labels live in i18n (`userFlags.*`, `chanFlags.*`, `chanParams.*`).

export type UserFlagGroup = 'privacy' | 'messages' | 'other';

export interface UserFlag {
  m: string;
  key: string;
  group: UserFlagGroup;
}

export type ChanFlagGroup = 'classic' | 'extra';

export interface ChanFlag {
  m: string;
  key: string;
  /** RFC-style channel flags first; Insp/network extras after. */
  group: ChanFlagGroup;
  /** Services/oper-set; shown when present but not toggleable. */
  readonly?: boolean;
}

export interface ChanParam {
  m: string;
  key: string;
  hint: string;
}

/** Self-settable umodes. Oper/services-only letters (o s h H O k r) stay out. */
export const USER_FLAGS: UserFlag[] = [
  { m: 'i', key: 'invisible', group: 'privacy' },
  { m: 'I', key: 'hidechans', group: 'privacy' },
  { m: 'x', key: 'cloak', group: 'privacy' },
  { m: 'a', key: 'hideidle', group: 'privacy' },
  { m: 'W', key: 'showwhois', group: 'privacy' },
  { m: 'g', key: 'callerid', group: 'messages' },
  { m: 'c', key: 'commonchans', group: 'messages' },
  { m: 'R', key: 'regdeaf', group: 'messages' },
  { m: 'd', key: 'deaf', group: 'messages' },
  { m: 'D', key: 'privdeaf', group: 'messages' },
  { m: 'T', key: 'noctcp', group: 'messages' },
  { m: 'S', key: 'stripcolor', group: 'messages' },
  { m: 'G', key: 'censor', group: 'messages' },
  { m: 'L', key: 'antiredirect', group: 'messages' },
  { m: 'z', key: 'sslqueries', group: 'messages' },
  { m: 'N', key: 'nohistory', group: 'messages' },
  { m: 'w', key: 'wallops', group: 'other' },
  { m: 'y', key: 'geomaxlite', group: 'other' },
  { m: 'B', key: 'bot', group: 'other' },
];

export const USER_FLAG_GROUPS: UserFlagGroup[] = ['privacy', 'messages', 'other'];

/** Type-D channel flags. +k/+l stay on the ChanAdmin overview tab. */
export const CHAN_FLAGS: ChanFlag[] = [
  { m: 'i', key: 'invite', group: 'classic' },
  { m: 'm', key: 'moderated', group: 'classic' },
  { m: 'n', key: 'noExternal', group: 'classic' },
  { m: 't', key: 'topicLock', group: 'classic' },
  { m: 's', key: 'secret', group: 'classic' },
  { m: 'p', key: 'private', group: 'classic' },
  { m: 'c', key: 'blockColor', group: 'extra' },
  { m: 'C', key: 'noCtcp', group: 'extra' },
  { m: 'S', key: 'stripColor', group: 'extra' },
  { m: 'r', key: 'registered', group: 'extra', readonly: true },
  { m: 'R', key: 'regOnly', group: 'extra' },
  { m: 'M', key: 'regModerated', group: 'extra' },
  { m: 'O', key: 'operOnly', group: 'extra' },
  { m: 'z', key: 'tlsOnly', group: 'extra' },
  { m: 'N', key: 'noNickChange', group: 'extra' },
  { m: 'K', key: 'noKnock', group: 'extra' },
  { m: 'P', key: 'permanent', group: 'extra' },
  { m: 'A', key: 'allowInvite', group: 'extra' },
  { m: 'D', key: 'delayJoin', group: 'extra' },
  { m: 'G', key: 'censor', group: 'extra' },
  { m: 'Q', key: 'noKick', group: 'extra' },
  { m: 'T', key: 'noNotice', group: 'extra' },
  { m: 'u', key: 'auditorium', group: 'extra' },
  { m: 'U', key: 'opModerated', group: 'extra' },
  { m: 'V', key: 'blockHighlight', group: 'extra' },
];

export const BASE_CHAN_FLAGS = 'imntsp';

/** Type B/C channel modes with a value. +k/+l are edited on the overview tab. */
export const CHAN_PARAMS: ChanParam[] = [
  { m: 'B', key: 'anticaps', hint: '80:2' },
  { m: 'd', key: 'delaymsg', hint: '5' },
  { m: 'E', key: 'repeat', hint: '5:5' },
  { m: 'f', key: 'flood', hint: '*5:10' },
  { m: 'F', key: 'nickflood', hint: '5:10' },
  { m: 'H', key: 'history', hint: '20:1d' },
  { m: 'j', key: 'joinflood', hint: '5:10' },
  { m: 'J', key: 'kicknorejoin', hint: '5' },
  { m: 'L', key: 'redirect', hint: '#salon' },
  { m: 'W', key: 'antisnoop', hint: '5m' },
];

export function advertisedModeLetters(token: string | undefined): Set<string> {
  if (!token) return new Set();
  return new Set(token.replace(/,/g, '').split('').filter((c) => /[A-Za-z]/.test(c)));
}

/** Letters the ircd actually has. Empty advertised set → show the full catalogue. */
export function filterCatalog<T extends { m: string }>(
  items: T[],
  advertised: Set<string>,
): T[] {
  if (!advertised.size) return items;
  return items.filter((item) => advertised.has(item.m));
}

export function advertisedUserModes(
  isupport: Record<string, string>,
  myinfoUmodes?: string,
): Set<string> {
  const from005 = advertisedModeLetters(isupport.USERMODES);
  return from005.size ? from005 : advertisedModeLetters(myinfoUmodes);
}

/** Lock the parental package only when every letter of the pack is currently set. */
export function parentalLockedLetters(umodes: string, pack: string): Set<string> {
  const letters = pack.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return new Set();
  const um = umodes.replace(/^\+/, '');
  if (![...letters].every((c) => um.includes(c))) return new Set();
  return new Set(letters.split(''));
}
