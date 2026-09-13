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

export interface ChanFlag {
  m: string;
  key: string;
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
  { m: 'i', key: 'invite' },
  { m: 'm', key: 'moderated' },
  { m: 'n', key: 'noExternal' },
  { m: 't', key: 'topicLock' },
  { m: 's', key: 'secret' },
  { m: 'p', key: 'private' },
  { m: 'c', key: 'blockColor' },
  { m: 'C', key: 'noCtcp' },
  { m: 'S', key: 'stripColor' },
  { m: 'r', key: 'registered', readonly: true },
  { m: 'R', key: 'regOnly' },
  { m: 'M', key: 'regModerated' },
  { m: 'O', key: 'operOnly' },
  { m: 'z', key: 'tlsOnly' },
  { m: 'N', key: 'noNickChange' },
  { m: 'K', key: 'noKnock' },
  { m: 'P', key: 'permanent' },
  { m: 'A', key: 'allowInvite' },
  { m: 'D', key: 'delayJoin' },
  { m: 'G', key: 'censor' },
  { m: 'Q', key: 'noKick' },
  { m: 'T', key: 'noNotice' },
  { m: 'u', key: 'auditorium' },
  { m: 'U', key: 'opModerated' },
  { m: 'V', key: 'blockHighlight' },
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
