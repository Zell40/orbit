// Shared, per-module state and pure key helpers for the chat store. Extracted
// from store.ts so the store, its helpers and the message handler can all import
// them without a cycle. (ISUPPORT-derived values are process-global by design —
// the last connected network's values win, same as before the split.)
import { casefold } from '../irc/casemap';
import type { ChatMessage, IrcMessage } from '../irc/types';

export const SERVER = '$server'; // pseudo-buffer key for the server/network console

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
export const openBatches: Record<string, { type: string; quiet: boolean; target?: string }> = {};
export const historyCollect: Record<string, ChatMessage[]> = {}; // batchRef → collected old messages
// draft/multiline: gather the lines of one batch to render as a single message.
export const multilineCollect: Record<string, { base: ChatMessage; lines: { text: string; concat: boolean }[] }> = {};
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
