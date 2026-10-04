// Presence for open query (PM) windows: when a peer quits IRC we mirror a QUIT
// line into their PM (if still open), watch them via MONITOR, and announce
// CONNEXION when they come back — even if we share no channel with them.
import i18n from '../i18n';
import { canon, isPseudoBuffer } from './context';
import type { Buffer, MessageKind } from '../irc/types';

const offline = new Set<string>(); // CASEMAPPING-folded nicks awaiting a return notice

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
  if (nick) offline.delete(canon(nick));
}

export function isPmPeerOffline(nick: string): boolean {
  return !!nick && offline.has(canon(nick));
}

/** True once: the peer was marked offline and we should show CONNEXION. */
export function takePmPeerOnline(nick: string): boolean {
  const key = canon(nick);
  if (!offline.has(key)) return false;
  offline.delete(key);
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
