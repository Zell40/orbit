// Shared, per-module state and pure key helpers for the chat store. Extracted
// from store.ts so the store, its helpers and the message handler can all import
// them without a cycle. (ISUPPORT-derived values are process-global by design —
// the last connected network's values win, same as before the split.)
import { casefold } from '../irc/casemap';
import type { ChatMessage, IrcMessage } from '../irc/types';

export const SERVER = '$server'; // pseudo-buffer key for the server/network console
export const NOTICES = '$notices'; // leftover combined log (legacy) + empty-sender fallback
export const NOTICE_PREFIX = '$notice:'; // per-sender off-channel NOTICE inbox

export function noticeBufferName(nick: string): string {
  return NOTICE_PREFIX + nick;
}

export function isNoticeBuffer(name: string): boolean {
  return name === NOTICES || name.startsWith(NOTICE_PREFIX);
}

export function noticeBufferNick(name: string): string {
  if (name === NOTICES) return '';
  return name.startsWith(NOTICE_PREFIX) ? name.slice(NOTICE_PREFIX.length) : '';
}

export function isPseudoBuffer(name: string): boolean {
  return name === SERVER || isNoticeBuffer(name);
}

/** ZNC (and similar) module nicks: *status, *sasl, *cert. Not real ircd users. */
export function isBouncerServiceNick(name: string): boolean {
  return !!name && name.startsWith('*');
}

let localId = 0; // globally-unique local id source (shared across networks is fine)
export const newId = () => `local-${Date.now()}-${localId++}`;

// Live from ISUPPORT (synced from the client each message). chanTypes decides
// what's a channel; casemapping decides how we fold names to a canonical key.
export const isupport = { chanTypes: '#&', casemapping: 'rfc1459', statusPrefixes: '' };

export function isChannelName(name: string): boolean {
  return !!name && isupport.chanTypes.includes(name[0]);
}

// Canonical key for a buffer/member name (channel or nick), per CASEMAPPING, so
// "#Taverne" and "#taverne" never become two buffers. Display names keep their
// original case (Buffer.name / Member.nick); only the map KEY is folded.
export function canon(name: string): string {
  return casefold(name, isupport.casemapping);
}

// Open IRCv3 BATCHes (ref → info). "quiet" batches (netsplit/netjoin) suppress the
// per-user join/quit noise; "chathistory" batches collect their PRIVMSGs to be
// PREPENDED as older history rather than appended live.
// Null-prototype maps: batch refs are server-controlled, and a ref of "__proto__"
// (from `BATCH +__proto__ …`) would otherwise hit the object's prototype setter and
// corrupt the map instead of storing a key. No prototype → any ref is a plain key.
export const openBatches: Record<string, { type: string; quiet: boolean; target?: string }> = Object.create(null);
export const historyCollect: Record<string, ChatMessage[]> = Object.create(null); // batchRef → collected old messages
// draft/multiline: gather the lines of one batch to render as a single message.
export const multilineCollect: Record<string, { base: ChatMessage; lines: { text: string; concat: boolean }[] }> = Object.create(null);
// Discard any half-open batches. A batch the server opens but never closes (a
// bug, or a mid-batch netsplit) would otherwise linger and keep diverting live
// messages into the collectors instead of the buffer. Called on (re)connect.
export function resetBatches(): void {
  for (const k in openBatches) delete openBatches[k];
  for (const k in historyCollect) delete historyCollect[k];
  for (const k in multilineCollect) delete multilineCollect[k];
}
export function inQuietBatch(msg: IrcMessage): boolean {
  const ref = msg.tags['batch'];
  return !!ref && !!openBatches[ref]?.quiet;
}
export function inHistoryBatch(msg: IrcMessage): string | undefined {
  const ref = msg.tags['batch'];
  return ref && openBatches[ref]?.type === 'chathistory' ? ref : undefined;
}
export function inMultilineBatch(msg: IrcMessage): string | undefined {
  const ref = msg.tags['batch'];
  return ref && openBatches[ref]?.type === 'draft/multiline' ? ref : undefined;
}
