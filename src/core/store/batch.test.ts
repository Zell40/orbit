import { describe, it, expect, beforeEach } from 'vitest';
import { makeBatch } from './batch';
import { parseLine } from '../irc/parser';
import { openBatches, historyCollect, multilineCollect, resetBatches } from './context';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';
import type { ChatMessage } from '../irc/types';

const mkMsg = (p: Partial<ChatMessage>): ChatMessage =>
  ({ id: 'x', bufferName: '#x', from: 'bob', text: 'hi', ts: 1000, kind: 'privmsg', self: false, ...p }) as ChatMessage;

function setup() {
  const state = {
    buffers: { '#x': { name: '#x', messages: [] as ChatMessage[] } } as Record<string, { name: string; messages: ChatMessage[] }>,
    historyLoading: {} as Record<string, boolean>,
    historyDone: {} as Record<string, boolean>,
  };
  const added: ChatMessage[] = [];
  const server: string[] = [];
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  const helpers = {
    msgSig: (m: ChatMessage) => `${m.kind} ${m.from} ${Math.floor(m.ts / 1000)} ${m.text}`,
    patchBuffer: (name: string, fn: (b: typeof state.buffers[string]) => typeof state.buffers[string]) => {
      const k = name.toLowerCase(); if (state.buffers[k]) state.buffers[k] = fn(state.buffers[k]);
    },
    addMessage: (_name: string, m: ChatMessage) => { added.push(m); },
    serverLine: (text: string) => { server.push(text); },
  } as unknown as StoreHelpers;
  const { handleBatch } = makeBatch({ get, set, helpers } as Parameters<typeof makeBatch>[0]);
  const on = (line: string) => handleBatch(parseLine(line));
  return { on, state, added, server };
}

beforeEach(() => resetBatches());

describe('BATCH handler', () => {
  it('opens a chathistory batch and drains its collected messages on close', () => {
    const { on, state } = setup();
    on(':srv BATCH +abc chathistory #x');
    expect(openBatches['abc']).toMatchObject({ type: 'chathistory', target: '#x' });
    historyCollect['abc'].push(mkMsg({ id: 'm1', text: 'old1', ts: 1000 }));
    historyCollect['abc'].push(mkMsg({ id: 'm2', text: 'old2', ts: 2000 }));
    on(':srv BATCH -abc');
    expect(state.buffers['#x'].messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(state.historyLoading['#x']).toBe(false);
    expect(openBatches['abc']).toBeUndefined();
    expect(historyCollect['abc']).toBeUndefined();
  });

  it('de-dupes a replayed message that matches one already shown (by signature)', () => {
    const { on, state } = setup();
    state.buffers['#x'].messages = [mkMsg({ id: 'shown', from: 'bob', text: 'hi', ts: 1000 })];
    on(':srv BATCH +abc chathistory #x');
    historyCollect['abc'].push(mkMsg({ id: 'dup', from: 'bob', text: 'hi', ts: 1000 })); // same sig as 'shown'
    on(':srv BATCH -abc');
    expect(state.buffers['#x'].messages).toHaveLength(1); // not duplicated
  });

  it('upgrades an existing id-less copy with the msgid from the replay', () => {
    const { on, state } = setup();
    state.buffers['#x'].messages = [mkMsg({ id: 'local', from: 'bob', text: 'hi', ts: 1000 })];
    on(':srv BATCH +abc chathistory #x');
    historyCollect['abc'].push(mkMsg({ id: 'real', msgid: 'server-msgid', from: 'bob', text: 'hi', ts: 1000 }));
    on(':srv BATCH -abc');
    expect(state.buffers['#x'].messages[0]).toMatchObject({ id: 'real', msgid: 'server-msgid' });
  });

  it('merges draft/multiline lines into one message', () => {
    const { on, added } = setup();
    on(':srv BATCH +ml draft/multiline #x');
    multilineCollect['ml'] = { base: mkMsg({ id: 'b', bufferName: '#x', from: 'me', text: '', self: true }), lines: [{ text: 'line1', concat: false }, { text: 'line2', concat: false }] };
    on(':srv BATCH -ml');
    expect(added).toHaveLength(1);
    expect(added[0].text).toBe('line1\nline2');
  });

  it('drops a quiet marker for a netsplit batch', () => {
    const { on, server } = setup();
    on(':srv BATCH +ns netsplit');
    expect(server.some((s) => s.includes('📡'))).toBe(true);
  });

  it('bounds the number of open batches (65th is declined)', () => {
    const { on } = setup();
    for (let i = 0; i < 64; i++) on(`:srv BATCH +b${i} chathistory #x`);
    expect(Object.keys(openBatches).length).toBe(64);
    on(':srv BATCH +over chathistory #x');
    expect(openBatches['over']).toBeUndefined();
  });

  it('returns false for a non-BATCH command', () => {
    const { on } = setup();
    expect(on(':bob!u@h PRIVMSG #x :hi')).toBe(false);
  });
});
