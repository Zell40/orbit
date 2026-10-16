// Presence for open query (PM) windows: when a peer quits IRC we mirror a QUIT
// line into their PM (if still open), watch them via MONITOR, and announce
// CONNEXION when they come back — even if we share no channel with them.
import i18n from '../i18n';
import { canon, isBouncerServiceNick, isChannelName, isPseudoBuffer } from './context';
import { findMemberKey } from './helpers';
import type { Buffer, MessageKind } from '../irc/types';
import { isStatusService } from '../services';

const offline = new Set<string>(); // CASEMAPPING-folded nicks awaiting a return notice
/** Nicks for which we already showed the mphistory "will be delivered" hint this offline spell. */
const mphistHintShown = new Set<string>();
/**
 * Nicks for which the server confirmed offline storage via
 * `NOTE PRIVMSG MPHISTORY_STORED` (until they come back / we clear offline).
 */
const mphistStored = new Set<string>();
/** Nicks for which we already showed the plain offline/401 warning this spell. */
const offlineWarnShown = new Set<string>();

export function queryBufferKey(
  buffers: Record<string, Buffer | undefined>,
  nick: string,
): string | undefined {
  const key = canon(nick);
  const b = buffers[key];
  if (!b || b.isChannel || isPseudoBuffer(key)) return undefined;
  return key;
}

/** Nicks of open PM windows (sidebar order), excluding services / self. */
export function listOpenQueryNicks(
  buffers: Record<string, Buffer | undefined>,
  order: string[],
  myNick = '',
): string[] {
  const me = myNick ? canon(myNick) : '';
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of order) {
    const b = buffers[name];
    if (!b || b.isChannel || isPseudoBuffer(name)) continue;
    const nick = (b.name || name).trim();
    if (!nick || isBouncerServiceNick(nick) || isStatusService(nick)) continue;
    const key = canon(nick);
    if (me && key === me) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nick);
  }
  return out;
}

export function markPmPeerOffline(nick: string): void {
  if (nick) offline.add(canon(nick));
}

export function clearPmPeerOffline(nick: string): void {
  if (nick) {
    const key = canon(nick);
    offline.delete(key);
    mphistHintShown.delete(key);
    mphistStored.delete(key);
    offlineWarnShown.delete(key);
  }
}

export function isPmPeerOffline(nick: string): boolean {
  return !!nick && offline.has(canon(nick));
}

/** True once: the peer was marked offline and we should show CONNEXION. */
export function takePmPeerOnline(nick: string): boolean {
  const key = canon(nick);
  if (!offline.has(key)) return false;
  offline.delete(key);
  mphistHintShown.delete(key);
  mphistStored.delete(key);
  offlineWarnShown.delete(key);
  return true;
}

/** Server confirmed this nick's PM was queued by m_ircv3_mphistory. */
export function markMphistoryStored(nick: string): void {
  if (nick) mphistStored.add(canon(nick));
}

export function isMphistoryStored(nick: string): boolean {
  return !!nick && mphistStored.has(canon(nick));
}

/** True once: a MPHISTORY_STORED NOTE was seen for this nick this offline spell. */
export function takeMphistoryStored(nick: string): boolean {
  const key = canon(nick);
  if (!mphistStored.has(key)) return false;
  mphistStored.delete(key);
  return true;
}

/** '' until we know, 'on' if connected, 'off' if MONITOR or a 401 said they left.
 *  Shared by the PM top bar and the sidebar list. */
export function queryPresence(
  name: string,
  friendsOnline: Record<string, boolean> | undefined,
  buffers: Record<string, Buffer | undefined>,
): '' | 'on' | 'off' {
  if (!name || isChannelName(name) || isPseudoBuffer(name) || isBouncerServiceNick(name) || isStatusService(name)) return '';
  const flagged = friendsOnline?.[name.toLowerCase()];
  if (flagged === false) return 'off';
  if (flagged === true) return 'on';
  for (const buf of Object.values(buffers)) {
    if (buf?.isChannel && findMemberKey(buf.members, name)) return 'on';
  }
  return '';
}

/** True when the nick is not present in any channel member map. */
export function nickAbsentFromChannels(
  buffers: Record<string, Buffer | undefined>,
  order: string[],
  nick: string,
): boolean {
  if (!nick) return true;
  for (const name of order) {
    const b = buffers[name];
    if (!b?.isChannel) continue;
    if (findMemberKey(b.members, nick)) return false;
  }
  return true;
}

type SysLine = (name: string, text: string, kind: MessageKind, from?: string, mask?: string, ts?: number) => void;

/** If this nick was marked offline for an open PM, post CONNEXION once. */
export function announcePmOnline(
  buffers: Record<string, Buffer | undefined>,
  sysLine: SysLine,
  nick: string,
  ts?: number,
): void {
  if (!takePmPeerOnline(nick)) return;
  const qKey = queryBufferKey(buffers, nick);
  if (!qKey) return;
  const display = buffers[qKey]?.name || nick;
  sysLine(qKey, i18n.t('system.online', { nick: display }), 'online', display, '', ts || Date.now());
}

/**
 * Once per offline spell: soft-hint that mphistory queued the PM.
 * Call only after `NOTE … MPHISTORY_STORED` (or when consuming that mark on 401).
 */
export function showMphistoryStoredHint(opts: {
  buffers: Record<string, Buffer | undefined>;
  nick: string;
  sysLine: SysLine;
}): boolean {
  const { buffers, nick, sysLine } = opts;
  if (!nick) return false;
  const qKey = queryBufferKey(buffers, nick);
  if (!qKey) return false;
  const key = canon(nick);
  if (mphistHintShown.has(key)) return false;
  mphistHintShown.add(key);
  offlineWarnShown.add(key); // stored path supersedes the plain offline warn
  const display = buffers[qKey]?.name || nick;
  sysLine(qKey, i18n.t('system.mphistoryQueued', { nick: display }), 'info');
  return true;
}

/**
 * MONITOR already announced offline/quit in the open PM — suppress a follow-up
 * 401 red triangle for the same offline spell (e.g. JoinDialog openQuery + MARKREAD).
 */
export function noteOfflineAlreadyAnnounced(nick: string): void {
  if (nick) offlineWarnShown.add(canon(nick));
}

/**
 * Once per offline spell: remember that a 401 already told us this nick is gone.
 * Presence is shown next to the nick in the top bar — not as a red error in the PM.
 * Suppresses a second pass from a follow-up MARKREAD/TAGMSG 401.
 */
export function showOfflinePeerWarn(opts: {
  buffers: Record<string, Buffer | undefined>;
  nick: string;
}): boolean {
  const { buffers, nick } = opts;
  if (!nick) return false;
  const qKey = queryBufferKey(buffers, nick);
  if (!qKey) return false;
  const key = canon(nick);
  if (offlineWarnShown.has(key) || mphistHintShown.has(key)) return false;
  offlineWarnShown.add(key);
  return true;
}
