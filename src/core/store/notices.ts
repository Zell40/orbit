// Where an incoming user-targeted NOTICE belongs: the channel we share with the
// sender when that's unambiguous, otherwise the Notices sidebar buffer. Stops a
// bot on #baccalaureat from dumping notices into whatever window is currently
// open (#entrenous, a DM, …). Bots like Bac also PRIVMSG the same lines to the
// channel — those copies must not be re-inserted as NOTICE.
import { canon, isChannelName, NOTICES } from './context';

type NoticeBuf = {
  isChannel: boolean;
  joined: boolean;
  members: Record<string, unknown>;
  messages?: Array<{ kind: string; from: string; text: string; ts: number }>;
};

export function nickInMembers(members: Record<string, unknown> | undefined, nick: string): boolean {
  if (!members || !nick) return false;
  if (members[nick]) return true;
  const key = canon(nick);
  for (const n of Object.keys(members)) {
    if (canon(n) === key) return true;
  }
  return false;
}

export function sharedChannelsWith(
  sender: string,
  buffers: Record<string, NoticeBuf | undefined>,
  order: string[],
): string[] {
  const shared: string[] = [];
  for (const key of order || []) {
    const b = buffers[key];
    if (!b?.isChannel || !b.joined) continue;
    if (nickInMembers(b.members, sender)) shared.push(key);
  }
  return shared;
}

/** True when this user-NOTICE is a copy of a recent channel PRIVMSG from the same nick. */
export function noticeIsChannelEcho(opts: {
  sender: string;
  text: string;
  ts?: number;
  buffers: Record<string, NoticeBuf | undefined>;
  order: string[];
}): boolean {
  const sender = opts.sender || '';
  const needle = String(opts.text || '').trim();
  if (!sender) return false;
  const shared = sharedChannelsWith(sender, opts.buffers || {}, opts.order || []);
  if (!needle) return shared.length > 0;
  const now = opts.ts ?? Date.now();
  const from = canon(sender);
  for (const key of shared) {
    const msgs = opts.buffers[key]?.messages || [];
    for (let i = msgs.length - 1; i >= Math.max(0, msgs.length - 24); i--) {
      const m = msgs[i];
      if (now - m.ts > 8000) break;
      if (m.kind !== 'privmsg' || canon(m.from) !== from) continue;
      const have = String(m.text || '').trim();
      if (have === needle) return true;
      if (needle.length >= 8 && have.includes(needle)) return true;
    }
  }
  return false;
}

export function resolveNoticeDest(opts: {
  sender: string;
  active: string;
  channelContext?: string;
  buffers: Record<string, NoticeBuf | undefined>;
  order: string[];
}): string {
  const sender = opts.sender || '';
  if (!sender) return NOTICES;
  const shared = sharedChannelsWith(sender, opts.buffers || {}, opts.order || []);
  const ctx = opts.channelContext && isChannelName(opts.channelContext)
    ? canon(opts.channelContext) : '';
  if (ctx && shared.includes(ctx)) return ctx;
  const activeKey = opts.active ? canon(opts.active) : '';
  if (activeKey && shared.includes(activeKey)) return activeKey;
  if (shared.length === 1) return shared[0];
  return NOTICES;
}
