import { canon, trackBufferMuteSync } from './context';

type MuteSlice = {
  fetchBufferMuted(target: string): boolean;
};

type MuteState = {
  account: string;
  client: { ircv3: MuteSlice } | null;
  order?: string[];
  buffers?: Record<string, { name?: string; isChannel?: boolean; joined?: boolean } | undefined>;
};

/** Ask METADATA GET soju.im/muted once per channel this session. */
export function prefetchBufferMuted(
  get: () => MuteState,
  asked: Set<string>,
  ch: string,
): boolean {
  if (!get().account) return false;
  const key = canon(ch);
  if (!key || asked.has(key)) return false;
  const cl = get().client;
  if (!cl?.ircv3.fetchBufferMuted(ch)) return false;
  asked.add(key);
  trackBufferMuteSync(ch, 'get');
  return true;
}

export function forgetBufferMutePrefetch(asked: Set<string>, ch: string): void {
  asked.delete(canon(ch));
}

/** Catch JOIN-before-account / JOIN-before-CAP: GET mute for every joined salon. */
export function prefetchJoinedBufferMutes(get: () => MuteState, asked: Set<string>): void {
  if (!get().account) return;
  for (const name of get().order || []) {
    const b = get().buffers?.[name];
    if (b?.isChannel && b.joined) prefetchBufferMuted(get, asked, b.name || name);
  }
}
