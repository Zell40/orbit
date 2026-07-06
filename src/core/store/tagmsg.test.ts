import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTagmsg } from './tagmsg';
import { parseLine } from '../irc/parser';
import type { ChatMessage } from '../irc/types';

type Buf = { name: string; typing: Record<string, number>; messages: ChatMessage[] };

function setup() {
  const buffers: Record<string, Buf> = {};
  const k = (n: string) => n.toLowerCase();
  const ensureBuffer = (name: string) => { if (!buffers[k(name)]) buffers[k(name)] = { name, typing: {}, messages: [] }; };
  const patchBuffer = (name: string, fn: (b: Buf) => Buf) => { if (buffers[k(name)]) buffers[k(name)] = fn(buffers[k(name)]); };
  const { handleTagmsg } = makeTagmsg({ ensureBuffer, patchBuffer } as unknown as Parameters<typeof makeTagmsg>[0]);
  const on = (line: string, me = 'me') => handleTagmsg(parseLine(line), me);
  const seedMsg = (chan: string, m: Partial<ChatMessage>) => {
    buffers[k(chan)] = { name: chan, typing: {}, messages: [{ id: 'm1', bufferName: chan, from: 'a', text: 't', ts: 0, kind: 'privmsg', self: false, ...m } as ChatMessage] };
  };
  return { on, buffers, seedMsg };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TAGMSG — typing', () => {
  it('marks a channel member as typing, then self-expires after ~6s', () => {
    const { on, buffers } = setup();
    on('@+typing=active :bob!u@h TAGMSG #x');
    expect(buffers['#x'].typing['bob']).toBeGreaterThan(0);
    vi.advanceTimersByTime(6200);
    expect(buffers['#x'].typing['bob']).toBeUndefined();
  });

  it('a done/paused notice clears typing immediately', () => {
    const { on, buffers } = setup();
    on('@+typing=active :bob!u@h TAGMSG #x');
    on('@+typing=done :bob!u@h TAGMSG #x');
    expect(buffers['#x'].typing['bob']).toBeUndefined();
  });

  it('ignores our own typing notices', () => {
    const { on, buffers } = setup();
    on('@+typing=active :me!u@h TAGMSG #x', 'me');
    expect(buffers['#x']).toBeUndefined(); // never even ensured
  });
});

describe('TAGMSG — reactions', () => {
  it('adds a reaction to the replied-to message', () => {
    const { on, buffers, seedMsg } = setup();
    seedMsg('#x', { id: 'm1' });
    on('@+draft/reply=m1;+draft/react=\u{1F44D} :bob!u@h TAGMSG #x');
    expect(buffers['#x'].messages[0].reactions).toEqual([{ emoji: '\u{1F44D}', count: 1, mine: false }]);
  });

  it('increments the count when someone else reacts with the same emoji', () => {
    const { on, buffers, seedMsg } = setup();
    seedMsg('#x', { id: 'm1' });
    on('@+draft/reply=m1;+draft/react=\u{1F44D} :bob!u@h TAGMSG #x');
    on('@+draft/reply=m1;+draft/react=\u{1F44D} :amy!u@h TAGMSG #x');
    expect(buffers['#x'].messages[0].reactions![0].count).toBe(2);
  });

  it('toggles my own reaction off on a repeat', () => {
    const { on, buffers, seedMsg } = setup();
    seedMsg('#x', { id: 'm1' });
    on('@+draft/reply=m1;+draft/react=\u{1F44D} :me!u@h TAGMSG #x', 'me');
    on('@+draft/reply=m1;+draft/react=\u{1F44D} :me!u@h TAGMSG #x', 'me');
    expect(buffers['#x'].messages[0].reactions).toEqual([]); // count hit 0 → removed
  });

  it('ignores an absurdly long react value', () => {
    const { on, buffers, seedMsg } = setup();
    seedMsg('#x', { id: 'm1' });
    on(`@+draft/reply=m1;+draft/react=${'a'.repeat(40)} :bob!u@h TAGMSG #x`);
    expect(buffers['#x'].messages[0].reactions).toBeUndefined();
  });

  it('returns false for a non-TAGMSG command', () => {
    const { on } = setup();
    expect(on(':bob!u@h PRIVMSG #x :hi')).toBe(false);
  });
});
