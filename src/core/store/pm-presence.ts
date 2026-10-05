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
 * Once per offline spell: tell the sender that mphistory will deliver their PM
 * when the peer reconnects. Only when the CAP is negotiated.
 */
export function maybeMphistoryQueuedHint(opts: {
  hasMphistoryCap: boolean;
  buffers: Record<string, Buffer | undefined>;
  order: string[];
  friendsOnline?: Record<string, boolean>;
  nick: string;
  sysLine: SysLine;
}): boolean {
  const { hasMphistoryCap, buffers, order, friendsOnline, nick, sysLine } = opts;
  if (!hasMphistoryCap || !nick) return false;
  const qKey = queryBufferKey(buffers, nick);
  if (!qKey) return false;
  const key = canon(nick);
  if (mphistHintShown.has(key)) return false;
  const monitorOff = friendsOnline?.[nick.toLowerCase()] === false;
  const offline = isPmPeerOffline(nick) || monitorOff || nickAbsentFromChannels(buffers, order, nick);
  if (!offline) return false;
  // Only hint when we know they left (quit/MONITOR), not merely "not in our channels".
  if (!isPmPeerOffline(nick) && !monitorOff) return false;
  mphistHintShown.add(key);
  const display = buffers[qKey]?.name || nick;
  sysLine(qKey, i18n.t('system.mphistoryQueued', { nick: display }), 'info');
  return true;
}
