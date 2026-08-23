// Where an incoming user-targeted NOTICE belongs: the channel we share with the
// sender when that's unambiguous, otherwise the Notices sidebar buffer. Stops a
// bot on #baccalaureat from dumping notices into whatever window is currently
// open (#entrenous, a DM, …).
import type { Buffer } from '../irc/types';
import { canon, isChannelName, NOTICES } from './context';

export function nickInMembers(members: Record<string, unknown> | undefined, nick: string): boolean {
  if (!members || !nick) return false;
  if (members[nick]) return true;
  const key = canon(nick);
  for (const n of Object.keys(members)) {
    if (canon(n) === key) return true;
  }
  return false;
}

export function resolveNoticeDest(opts: {
  sender: string;
  active: string;
  channelContext?: string;
  buffers: Record<string, Pick<Buffer, 'isChannel' | 'joined' | 'members'> | undefined>;
  order: string[];
}): string {
  const sender = opts.sender || '';
  const buffers = opts.buffers || {};
  const order = opts.order || [];
  if (!sender) return NOTICES;
  const shared: string[] = [];
  for (const key of order) {
    const b = buffers[key];
    if (!b?.isChannel || !b.joined) continue;
    if (nickInMembers(b.members, sender)) shared.push(key);
  }
  const ctx = opts.channelContext && isChannelName(opts.channelContext)
    ? canon(opts.channelContext) : '';
  if (ctx && shared.includes(ctx)) return ctx;
  const activeKey = opts.active ? canon(opts.active) : '';
  if (activeKey && shared.includes(activeKey)) return activeKey;
  if (shared.length === 1) return shared[0];
  return NOTICES;
}
