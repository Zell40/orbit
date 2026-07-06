import { describe, it, expect } from 'vitest';
import { makeMembership } from './membership';
import { parseLine } from '../irc/parser';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

// A minimal fake store: buffers keyed by lowercased name, with member maps the
// membership handler mutates through the helper stubs.
function setup() {
  const state = {
    nick: 'me', active: '', order: [] as string[],
    buffers: {} as Record<string, { name: string; isChannel: boolean; members: Record<string, { nick: string; user?: string; host?: string; realname?: string; account?: string; prefix?: string }>; joined: boolean }>,
    whois: {} as Record<string, { nick: string; loading: boolean; user?: string; host?: string; realname?: string }>,
    prefs: { sound: false }, client: null as unknown,
    kicked: null as unknown, profileUser: 'x',
    setActive(n: string) { this.active = n; },
  };
  const closedChannels = new Set<string>();
  const lines: { name: string; text: string; kind: string }[] = [];
  const k = (n: string) => n.toLowerCase();
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  const helpers = {
    ensureBuffer: (name: string) => {
      if (!state.buffers[k(name)]) { state.buffers[k(name)] = { name, isChannel: name.startsWith('#'), members: {}, joined: false }; state.order.push(k(name)); }
    },
    patchBuffer: (name: string, fn: (b: typeof state.buffers[string]) => typeof state.buffers[string]) => {
      if (state.buffers[k(name)]) state.buffers[k(name)] = fn(state.buffers[k(name)]);
    },
    dropBuffer: (name: string) => { delete state.buffers[k(name)]; state.order = state.order.filter((x) => x !== k(name)); },
    patchWhois: (nick: string, fn: (w: typeof state.whois[string]) => typeof state.whois[string]) => {
      state.whois = { ...state.whois, [nick]: fn(state.whois[nick] ?? { nick, loading: true }) };
    },
    sysLine: (name: string, text: string, kind: string) => { lines.push({ name, text, kind }); },
  } as unknown as StoreHelpers;
  const seed = (chan: string, members: string[]) => {
    state.buffers[k(chan)] = { name: chan, isChannel: true, joined: true, members: Object.fromEntries(members.map((n) => [n, { nick: n }])) };
    state.order.push(k(chan));
  };
  const { handleMembership } = makeMembership({ get, set, closedChannels, helpers } as Parameters<typeof makeMembership>[0]);
  const on = (line: string) => handleMembership(parseLine(line), state.nick);
  return { on, state, lines, closedChannels, seed, k };
}

describe('membership handler', () => {
  it('JOIN adds the member (with extended-join account/realname)', () => {
    const { on, state } = setup();
    on(':bob!u@h JOIN #x acct :Bob Real');
    const m = state.buffers['#x'].members['bob'];
    expect(m).toMatchObject({ nick: 'bob', user: 'u', host: 'h', account: 'acct', realname: 'Bob Real' });
  });

  it('PART removes the member', () => {
    const { on, state, seed } = setup();
    seed('#x', ['bob', 'amy']);
    on(':bob!u@h PART #x');
    expect(state.buffers['#x'].members['bob']).toBeUndefined();
    expect(state.buffers['#x'].members['amy']).toBeDefined();
  });

  it('QUIT drops the nick from every channel they are in', () => {
    const { on, state, seed } = setup();
    seed('#a', ['bob']); seed('#b', ['bob', 'amy']);
    on(':bob!u@h QUIT :bye');
    expect(state.buffers['#a'].members['bob']).toBeUndefined();
    expect(state.buffers['#b'].members['bob']).toBeUndefined();
    expect(state.buffers['#b'].members['amy']).toBeDefined();
  });

  it('NICK renames the member across channels; our own NICK updates state.nick', () => {
    const { on, state, seed } = setup();
    seed('#a', ['bob']);
    on(':bob!u@h NICK bobby');
    expect(state.buffers['#a'].members['bobby']).toBeDefined();
    expect(state.buffers['#a'].members['bob']).toBeUndefined();
    on(':me!u@h NICK me2');
    expect(state.nick).toBe('me2');
  });

  it('KICK of someone else drops them; KICK of us closes the buffer', () => {
    const { on, state, seed, closedChannels, k } = setup();
    seed('#x', ['bob', 'me']);
    on(':op!u@h KICK #x bob :rude');
    expect(state.buffers['#x'].members['bob']).toBeUndefined();

    on(':op!u@h KICK #x me :out');
    expect(state.buffers['#x']).toBeUndefined();        // buffer dropped
    expect(closedChannels.has(k('#x'))).toBe(true);
    expect(state.kicked).toMatchObject({ channel: '#x', by: 'op', kind: 'kick' });
  });

  it('returns false for a non-membership command', () => {
    const { on } = setup();
    expect(on(':bob!u@h PRIVMSG #x :hi')).toBe(false);
  });
});
