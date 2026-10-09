// Presence for open query (PM) windows: when a peer quits IRC we mirror a QUIT
// line into their PM (if still open), watch them via MONITOR, and announce
// CONNEXION when they come back — even if we share no channel with them.
import i18n from '../i18n';
import { canon, isPseudoBuffer } from './context';
import { findMemberKey } from './helpers';
import type { Buffer, MessageKind } from '../irc/types';

const offline = new Set<string>(); // CASEMAPPING-folded nicks awaiting a return notice
/** Nicks for which we already showed the mphistory "will be delivered" hint this offline spell. */
const mphistHintShown = new Set<string>();
/**
 * Nicks for which the server confirmed offline storage via
 * `NOTE PRIVMSG MPHISTORY_STORED` (until they come back / we clear offline).
 */
const mphistStored = new Set<string>();

export function queryBufferKey(
  buffers: Record<string, Buffer | undefined>,
  nick: string,
): string | undefined {
  const key = canon(nick);
  const b = buffers[key];
  if (!b || b.isChannel || isPseudoBuffer(key)) return undefined;
  return key;
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
  const display = buffers[qKey]?.name || nick;
  sysLine(qKey, i18n.t('system.mphistoryQueued', { nick: display }), 'info');
  return true;
}
