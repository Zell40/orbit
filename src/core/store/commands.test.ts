import { describe, it, expect } from 'vitest';
import { makeCommands } from './commands';
import { SERVER } from './context';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

function fakeClient(hasCap = false) {
  const calls: [string, unknown[]][] = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, args]); };
  return {
    join: rec('join'), part: rec('part'), action: rec('action'), setNick: rec('setNick'),
    privmsg: rec('privmsg'), privmsgReply: rec('privmsgReply'), send: rec('send'),
    kick: rec('kick'), setUserMode: rec('setUserMode'), setTopic: rec('setTopic'),
    ircv3: { hasCap: () => hasCap, sendTyping: rec('sendTyping') },
    calls,
  };
}

function setup(over: Record<string, unknown> = {}) {
  const client = fakeClient();
  const state = {
    nick: 'me', active: '#x', replyTarget: null as unknown, pmContext: {} as Record<string, string>,
    client,
    setActive(n: string) { this.active = n; },
    whoisText() {}, openUser() {}, toggleIgnore() {}, refreshChannels() {}, setModal() {},
    ...over,
  };
  const added: { name: string; m: { self?: boolean; text: string; kind: string } }[] = [];
  let typingReset = 0;
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  const helpers = {
    sysLine: () => {},
    addMessage: (name: string, m: { self?: boolean; text: string; kind: string }) => { added.push({ name, m }); },
    ensureBuffer: () => {},
  } as unknown as StoreHelpers;
  const { sendInput } = makeCommands({ get, set, helpers, resetTyping: () => { typingReset++; } } as Parameters<typeof makeCommands>[0]);
  return { sendInput, client, state, added, typing: () => typingReset };
}

const calledWith = (c: ReturnType<typeof fakeClient>, name: string) => c.calls.filter(([n]) => n === name).map(([, a]) => a);

describe('sendInput — slash commands', () => {
  it('/join joins and switches to the channel', () => {
    const { sendInput, client, state } = setup();
    sendInput('/join #new');
    expect(calledWith(client, 'join')).toEqual([['#new']]);
    expect(state.active).toBe('#new');
  });

  it('/join #a,#b,#c joins them all and focuses the first', () => {
    const { sendInput, client, state } = setup();
    sendInput('/join #a,#b,#c');
    expect(calledWith(client, 'join')).toEqual([['#a,#b,#c']]);
    expect(state.active).toBe('#a');
  });

  it('/me sends a CTCP action to the active channel', () => {
    const { sendInput, client } = setup();
    sendInput('/me waves');
    expect(calledWith(client, 'action')).toEqual([['#x', 'waves']]);
  });

  it('/nick changes nick, /op grants a mode', () => {
    const { sendInput, client } = setup();
    sendInput('/nick bobby');
    sendInput('/op alice');
    expect(calledWith(client, 'setNick')).toEqual([['bobby']]);
    expect(calledWith(client, 'setUserMode')).toEqual([['#x', 'o', true, 'alice']]);
  });

  it('/msg privmsgs a target and echoes optimistically', () => {
    const { sendInput, client, added } = setup();
    sendInput('/msg alice hey there');
    expect(calledWith(client, 'privmsg')).toEqual([['alice', 'hey there']]);
    expect(added.some((a) => a.name === 'alice' && a.m.self)).toBe(true);
  });

  it('an unknown slash-command is sent raw', () => {
    const { sendInput, client } = setup();
    sendInput('/quote SOMETHING x');
    expect(calledWith(client, 'send')).toEqual([['quote SOMETHING x']]);
  });
});

describe('sendInput — messages + console', () => {
  it('a plain message privmsgs the active buffer, echoes, and resets typing', () => {
    const { sendInput, client, added, typing } = setup();
    sendInput('hello world');
    expect(calledWith(client, 'privmsg')).toEqual([['#x', 'hello world', undefined]]);
    expect(added.some((a) => a.name === '#x' && a.m.self)).toBe(true);
    expect(calledWith(client, 'sendTyping')).toEqual([['#x', 'done']]);
    expect(typing()).toBe(1);
  });

  it('a bare line in the Console is sent as a raw IRC command', () => {
    const { sendInput, client } = setup({ active: SERVER });
    sendInput('WHOIS someone');
    expect(calledWith(client, 'send')).toEqual([['WHOIS someone']]);
  });

  it('does nothing without a client or with empty text', () => {
    const { sendInput, client } = setup();
    sendInput('   ');
    expect(client.calls).toHaveLength(0);
  });

  it('a plain DM echoes even when echo-message is on (callerid 716 has no echo)', () => {
    const { sendInput, client, added } = setup({ active: 'alice' });
    client.ircv3.hasCap = () => true;
    sendInput('hello pending');
    expect(calledWith(client, 'privmsg')).toEqual([['alice', 'hello pending', undefined]]);
    expect(added.some((a) => a.name === 'alice' && a.m.self && a.m.text === 'hello pending')).toBe(true);
  });

  it('a channel message echoes immediately even when echo-message is on', () => {
    const { sendInput, client, added } = setup();
    client.ircv3.hasCap = () => true;
    sendInput('hello salon');
    expect(calledWith(client, 'privmsg')).toEqual([['#x', 'hello salon', undefined]]);
    expect(added.some((a) => a.name === '#x' && a.m.self && a.m.text === 'hello salon')).toBe(true);
  });
});
