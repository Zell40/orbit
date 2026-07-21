import type { ChatMessage } from '@/core/irc/types';

// True when `m` starts a run for the value `pick` returns — i.e. that value
// differs from the most recent earlier message that also had one (or there is no
// earlier one). Untagged messages in between are skipped. Lets a per-line
// affordance (the channel-context chip, the reply quote) show once at the head of
// a run rather than on every line — e.g. a multi-line service reply that repeats
// the same reply-parent on each of its lines.
export function firstOfRun(
  msgs: ChatMessage[] | undefined,
  m: ChatMessage,
  pick: (x: ChatMessage) => string | undefined,
): boolean {
  const v = pick(m);
  if (!v || !msgs) return false;
  const idx = msgs.indexOf(m);
  for (let i = idx - 1; i >= 0; i--) {
    const prev = pick(msgs[i]);
    if (prev) return prev !== v;
  }
  return true;
}
