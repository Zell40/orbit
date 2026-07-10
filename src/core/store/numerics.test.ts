import { describe, it, expect } from 'vitest';
import { makeNumerics } from './numerics';
import { Numerics } from '../irc/numerics';
import type { IrcMessage } from '../irc/types';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

const mk = (command: string, params: string[] = []): IrcMessage =>
  ({ command, params, tags: {}, nick: '', prefix: '', raw: '' }) as unknown as IrcMessage;

function setup(over: Record<string, unknown> = {}) {
  const sys: { name: string; text: string }[] = [];
  const server: string[] = [];
  const state = {
    client: { numerics: new Numerics() },
    active: '#x', account: '', channels: [], listLoading: false, away: false,
    buffers: {}, banlists: {}, exceptlists: {}, invexlists: {}, friends: [], friendsOnline: {},
    prefs: { sound: false }, whois: {},
    ...over,
  };
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  const helpers = {
    ensureBuffer: () => {},
    patchBuffer: () => {},
    dropBuffer: () => {},
    sysLine: (name: string, text: string) => { sys.push({ name, text }); },
    serverLine: (text: string) => { server.push(text); },
    patchWhois: () => {},
  } as unknown as StoreHelpers;
  const { handleNumerics } = makeNumerics({
    get, set, helpers,
    closedChannels: new Set<string>(), lastCantSend: {}, lastAwayNotice: {},
    clearWhois: () => {},
  } as Parameters<typeof makeNumerics>[0]);
  return { handleNumerics, state, sys, server };
}

describe('store numerics handler', () => {
  it('900 RPL_LOGGEDIN sets the account', () => {
    const { handleNumerics, state } = setup();
    expect(handleNumerics(mk('900', ['me', 'nick!u@h', 'bob']))).toBe(true);
    expect(state.account).toBe('bob');
  });

  it('901 RPL_LOGGEDOUT clears the account', () => {
    const { handleNumerics, state } = setup({ account: 'bob' });
    handleNumerics(mk('901', ['me']));
    expect(state.account).toBe('');
  });

  it('321/322/323 build the channel list', () => {
    const { handleNumerics, state } = setup();
    handleNumerics(mk('321', ['me']));
    expect(state).toMatchObject({ channels: [], listLoading: true });
    handleNumerics(mk('322', ['me', '#general', '42', '[+n] hello']));
    expect(state.channels).toEqual([{ name: '#general', users: 42, topic: 'hello' }]);
    handleNumerics(mk('323', ['me']));
    expect(state.listLoading).toBe(false);
  });

  it('305 RPL_UNAWAY clears away and announces it', () => {
    const { handleNumerics, state, server } = setup({ away: true });
    expect(handleNumerics(mk('305', ['me']))).toBe(true);
    expect(state.away).toBe(false);
    expect(server).toHaveLength(1);
  });

  it('routes an unknown error numeric to a ⚠ line (via client.numerics.isError)', () => {
    const { handleNumerics, sys } = setup({ active: 'status' });
    // 421 ERR_UNKNOWNCOMMAND — an error with no dedicated case → generic fallback.
    expect(handleNumerics(mk('421', ['me', 'FOO', 'Unknown command']))).toBe(true);
    expect(sys.some((l) => l.text.includes('⚠️'))).toBe(true);
  });

  it('routes an informational numeric to the console (via client.numerics.name)', () => {
    const { handleNumerics, server } = setup();
    // 372 RPL_MOTD — not an error → server console.
    expect(handleNumerics(mk('372', ['me', 'motd line']))).toBe(true);
    expect(server.some((l) => l.includes('motd line'))).toBe(true);
  });

  it('returns false for a non-numeric command', () => {
    const { handleNumerics } = setup();
    expect(handleNumerics(mk('PRIVMSG', ['#x', 'hi']))).toBe(false);
  });

  it('ignores a WHOX 354 that is not our token, leaving it for later handlers', () => {
    const { handleNumerics } = setup();
    expect(handleNumerics(mk('354', ['me', '999', '#x', 'bob', 'H', '0']))).toBe(false);
  });
});
