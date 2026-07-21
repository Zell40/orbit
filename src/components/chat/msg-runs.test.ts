import { describe, it, expect } from 'vitest';
import { firstOfRun } from './msg-runs';
import type { ChatMessage } from '@/core/irc/types';

const mk = (over: Partial<ChatMessage>): ChatMessage =>
  ({ id: 'x', bufferName: '#c', from: 'ChanServ', text: '', ts: 0, kind: 'notice', self: false, ...over });

describe('firstOfRun', () => {
  it('is false when the message has no value for the picker', () => {
    const m = mk({ id: 'a' });
    expect(firstOfRun([m], m, (x) => x.replyTo)).toBe(false);
  });

  it('shows on the first line of a run and hides on the rest', () => {
    const a = mk({ id: 'a', replyTo: 'p1' });
    const b = mk({ id: 'b', replyTo: 'p1' });
    const c = mk({ id: 'c', replyTo: 'p1' });
    const msgs = [a, b, c];
    expect(firstOfRun(msgs, a, (x) => x.replyTo)).toBe(true);
    expect(firstOfRun(msgs, b, (x) => x.replyTo)).toBe(false);
    expect(firstOfRun(msgs, c, (x) => x.replyTo)).toBe(false);
  });

  it('shows again when the value changes', () => {
    const a = mk({ id: 'a', replyTo: 'p1' });
    const b = mk({ id: 'b', replyTo: 'p2' });
    expect(firstOfRun([a, b], b, (x) => x.replyTo)).toBe(true);
  });

  it('compares against the last tagged message, ignoring untagged ones between', () => {
    const a = mk({ id: 'a', channelContext: '#foo' });
    const gap = mk({ id: 'g' });
    const b = mk({ id: 'b', channelContext: '#foo' });
    expect(firstOfRun([a, gap, b], b, (x) => x.channelContext)).toBe(false);
  });
});
