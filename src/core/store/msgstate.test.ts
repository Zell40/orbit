import { describe, it, expect } from 'vitest';
import { makeMsgState } from './msgstate';
import { parseLine } from '../irc/parser';
import type { ChatMessage } from '../irc/types';

type Buf = { name: string; readTs: number; messages: ChatMessage[] };

function setup() {
  const buffers: Record<string, Buf> = {};
  const k = (n: string) => n.toLowerCase();
  const ensureBuffer = (name: string) => { if (!buffers[k(name)]) buffers[k(name)] = { name, readTs: 0, messages: [] }; };
  const patchBuffer = (name: string, fn: (b: Buf) => Buf) => { if (buffers[k(name)]) buffers[k(name)] = fn(buffers[k(name)]); };
  const { handleMsgState } = makeMsgState({ ensureBuffer, patchBuffer } as unknown as Parameters<typeof makeMsgState>[0]);
  const on = (line: string) => handleMsgState(parseLine(line));
  const seed = (chan: string, msgs: ChatMessage[]) => { buffers[k(chan)] = { name: chan, readTs: 0, messages: msgs }; };
  return { on, buffers, seed };
}

const mkMsg = (id: string): ChatMessage =>
  ({ id, bufferName: '#x', from: 'bob', text: 't', ts: 1, kind: 'privmsg', self: false }) as ChatMessage;

describe('REDACT', () => {
  it('marks the targeted message redacted, leaves others alone', () => {
    const { on, buffers, seed } = setup();
    seed('#x', [mkMsg('m1'), mkMsg('m2')]);
    on(':srv REDACT #x m1');
    expect(buffers['#x'].messages.find((m) => m.id === 'm1')!.redacted).toBe(true);
    expect(buffers['#x'].messages.find((m) => m.id === 'm2')!.redacted).toBeUndefined();
  });
});

describe('MARKREAD', () => {
  it('advances readTs from a timestamp= argument (ensuring the buffer)', () => {
    const { on, buffers } = setup();
    on(':srv MARKREAD #x timestamp=2020-01-01T00:00:00.000Z');
    expect(buffers['#x'].readTs).toBe(Date.parse('2020-01-01T00:00:00.000Z'));
  });

  it('ignores a MARKREAD with no/blank timestamp', () => {
    const { on, buffers } = setup();
    on(':srv MARKREAD #x *');
    expect(buffers['#x'].readTs).toBe(0);
  });

  it('ignores an unparseable timestamp', () => {
    const { on, buffers } = setup();
    on(':srv MARKREAD #x timestamp=not-a-date');
    expect(buffers['#x'].readTs).toBe(0);
  });
});

describe('handleMsgState', () => {
  it('returns false for an unrelated command', () => {
    const { on } = setup();
    expect(on(':bob!u@h PRIVMSG #x :hi')).toBe(false);
  });
});
