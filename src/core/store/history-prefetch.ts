import { canon } from './context';

type Ircv3Slice = {
  hasCap(name: string): boolean;
  chathistoryLatest(target: string, limit: number, opts?: { urgent?: boolean }): void;
};

/** Ask CHATHISTORY LATEST once per channel join. Returns true when a request was sent. */
export function prefetchLatestHistory(
  get: () => { client: { ircv3: Ircv3Slice } | null; active?: string },
  asked: Set<string>,
  ch: string,
): boolean {
  const key = canon(ch);
  if (!key || asked.has(key)) return false;
  const cl = get().client;
  if (!cl?.ircv3.hasCap('draft/chathistory')) return false;
  asked.add(key);
  const urgent = canon(get().active || '') === key;
  cl.ircv3.chathistoryLatest(ch, 50, { urgent });
  return true;
}

export function forgetHistoryPrefetch(asked: Set<string>, ch: string): void {
  asked.delete(canon(ch));
}
