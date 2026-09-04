import { describe, it, expect, afterEach } from 'vitest';
import { makeMembership } from './membership';
import { parseLine } from '../irc/parser';
import { setExpectedBootChannels } from '../../lib/boot-ready';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

// A minimal fake store: buffers keyed by lowercased name, with member maps the
// membership handler mutates through the helper stubs.
function setup(historyAsked = new Set<string>()) {
  const state = {
    nick: 'me', account: '', active: '', order: [] as string[],
    buffers: {} as Record<string, { name: string; isChannel: boolean; members: Record<string, { nick: string; user?: string; host?: string; realname?: string; account?: string; prefix?: string; away?: boolean }>; joined: boolean }>,
    whois: {} as Record<string, { nick: string; loading: boolean; user?: string; host?: string; realname?: string }>,
    prefs: { sound: false }, client: null as unknown,
    kicked: null as unknown, profileUser: 'x',
    setActive(n: string) { this.active = n; },
  };
  const closedChannels = new Set<string>();
  const lines: { name: string; text: string; kind: string; from?: string }[] = [];
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
    patchMemberEverywhere: (nick: string, patch: Record<string, unknown>) => {
      for (const key of Object.keys(state.buffers)) {
        const b = state.buffers[key];
        if (b.members[nick]) b.members = { ...b.members, [nick]: { ...b.members[nick], ...patch } };
      }
    },
    patchWhois: (nick: string, fn: (w: typeof state.whois[string]) => typeof state.whois[string]) => {
      state.whois = { ...state.whois, [nick]: fn(state.whois[nick] ?? { nick, loading: true }) };
    },
    sysLine: (name: string, text: string, kind: string, from?: string) => { lines.push({ name, text, kind, from }); },
  } as unknown as StoreHelpers;
  const seed = (chan: string, members: string[]) => {
    state.buffers[k(chan)] = { name: chan, isChannel: true, joined: true, members: Object.fromEntries(members.map((n) => [n, { nick: n }])) };
    state.order.push(k(chan));
  };
  const { handleMembership } = makeMembership({ get, set, closedChannels, helpers, historyAsked } as Parameters<typeof makeMembership>[0]);
  const on = (line: string) => handleMembership(parseLine(line), state.nick);
  return { on, state, lines, closedChannels, seed, k };
}

afterEach(() => setExpectedBootChannels([]));

describe('membership handler', () => {
  it('JOIN adds the member (with extended-join account/realname)', () => {
    const { on, state } = setup();
    on(':bob!u@h JOIN #x acct :Bob Real');
    const m = state.buffers['#x'].members['bob'];
    expect(m).toMatchObject({ nick: 'bob', user: 'u', host: 'h', account: 'acct', realname: 'Bob Real' });
  });

  it('our own extended-join fills the session account (ZNC attach, no SASL 900)', () => {
    const { on, state } = setup();
    on(':me!u@h JOIN #x Harry :[12/H/Benquet]');
    expect(state.account).toBe('Harry');
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
    const { on, state, seed, lines } = setup();
    seed('#a', ['bob']);
    on(':bob!u@h NICK bobby');
    expect(state.buffers['#a'].members['bobby']).toBeDefined();
    expect(state.buffers['#a'].members['bob']).toBeUndefined();
    expect(lines).toContainEqual({ name: '#a', text: 'bobby', kind: 'nick', from: 'bob' });
    on(':me!u@h NICK me2');
    expect(state.nick).toBe('me2');
  });

  it('self JOIN clears a previous joinDenied overlay', () => {
    const { on, state, seed } = setup();
    seed('#x', []);
    state.buffers['#x'].joined = false;
    (state.buffers['#x'] as { joinDenied?: unknown }).joinDenied = { code: '474', flag: '+b', reasonKey: 'banned', detail: '' };
    on(':me!u@h JOIN #x');
    expect(state.buffers['#x'].joined).toBe(true);
    expect((state.buffers['#x'] as { joinDenied?: unknown }).joinDenied).toBeUndefined();
  });

  it('KICK of someone else drops them; KICK of us closes the buffer', () => {
    const { on, state, seed, closedChannels, k, lines } = setup();
    seed('#x', ['bob', 'me']);
    on(':op!u@h KICK #x bob :rude');
    expect(state.buffers['#x'].members['bob']).toBeUndefined();
    expect(lines).toContainEqual({ name: '#x', text: 'bob\nrude', kind: 'kick', from: 'op' });

    on(':op!u@h KICK #x me :out');
    expect(state.buffers['#x']).toBeUndefined();        // buffer dropped
    expect(closedChannels.has(k('#x'))).toBe(true);
    expect(state.kicked).toMatchObject({ channel: '#x', by: 'op', kind: 'kick' });
  });

  it('AWAY marks/clears a member as away across shared channels', () => {
    const { on, state, seed } = setup();
    seed('#a', ['bob']); seed('#b', ['bob']);
    on(':bob!u@h AWAY :lunch');
    expect(state.buffers['#a'].members['bob']).toMatchObject({ away: true });
    expect(state.buffers['#b'].members['bob']).toMatchObject({ away: true });
    on(':bob!u@h AWAY');
    expect(state.buffers['#a'].members['bob']).toMatchObject({ away: false });
  });

  it('ACCOUNT updates a member account; our own login updates state.account', () => {
    const { on, state, seed } = setup();
    seed('#a', ['bob']);
    on(':bob!u@h ACCOUNT bobacct');
    expect(state.buffers['#a'].members['bob']).toMatchObject({ account: 'bobacct' });
    on(':me!u@h ACCOUNT myacct');
    expect(state.account).toBe('myacct');
    on(':me!u@h ACCOUNT *'); // logged out
    expect(state.account).toBe('');
  });

  it('returns false for a non-membership command', () => {
    const { on } = setup();
    expect(on(':bob!u@h PRIVMSG #x :hi')).toBe(false);
  });

  it('lands on the first requested salon, not the network autojoin', () => {
    const { on, state } = setup();
    setExpectedBootChannels(['#Baccalaureat.chat', '#EntreNous.chat']);
    on(':me!u@h JOIN #EntreNous.chat');
    expect(state.active).toBe('');
    on(':me!u@h JOIN #Baccalaureat.chat');
    expect(state.active).toBe('#Baccalaureat.chat');
  });

  it('requests CHATHISTORY LATEST on our own JOIN when the cap is ACK’d', () => {
    const { on, state } = setup();
    const latest: string[] = [];
    const muted: string[] = [];
    state.account = 'alice';
    state.client = {
      ircv3: {
        hasCap: (c: string) => c === 'draft/chathistory',
        chathistoryLatest: (t: string) => latest.push(t),
        fetchBufferMuted: (t: string) => muted.push(t),
      },
    };
    on(':bob!u@h JOIN #x');
    on(':me!u@h JOIN #x');
    expect(latest).toEqual(['#x']);
    expect(muted).toEqual(['#x']);
  });

  it('skips soju.im/muted GET on JOIN when not logged into an account', () => {
    const { on, state } = setup();
    const muted: string[] = [];
    state.account = '';
    state.client = {
      ircv3: {
        hasCap: () => false,
        chathistoryLatest: () => {},
        fetchBufferMuted: (t: string) => muted.push(t),
      },
    };
    on(':me!u@h JOIN #x');
    expect(muted).toEqual([]);
  });

  it('skips CHATHISTORY when draft/chathistory is not ACK’d', () => {
    const { on, state } = setup();
    const latest: string[] = [];
    state.client = {
      ircv3: {
        hasCap: () => false,
        chathistoryLatest: (t: string) => latest.push(t),
        fetchBufferMuted: () => {},
      },
    };
    on(':me!u@h JOIN #x');
    expect(latest).toEqual([]);
  });

  it('requests history again after we PART and rejoin', () => {
    const historyAsked = new Set<string>();
    const { on, state } = setup(historyAsked);
    const latest: string[] = [];
    state.client = {
      ircv3: {
        hasCap: (c: string) => c === 'draft/chathistory',
        chathistoryLatest: (t: string) => latest.push(t),
        fetchBufferMuted: () => {},
      },
    };
    on(':me!u@h JOIN #x');
    on(':me!u@h PART #x');
    on(':me!u@h JOIN #x');
    expect(latest).toEqual(['#x', '#x']);
  });
});
