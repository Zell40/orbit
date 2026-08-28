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
  let whois: Record<string, { nick: string; loading: boolean; notFound?: boolean }> = {};
  const state = {
    client: { numerics: new Numerics(), whowas: (_nk: string) => {} },
    active: '#x', account: '', channels: [], listLoading: false, away: false,
    buffers: {}, banlists: {}, exceptlists: {}, invexlists: {}, friends: [], friendsOnline: {},
    prefs: { sound: false }, whois,
    profileUser: '',
    ...over,
  };
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => {
    if (p.whois) whois = p.whois as typeof whois;
    Object.assign(state, p);
  };
  const helpers = {
    ensureBuffer: () => {},
    patchBuffer: () => {},
    dropBuffer: () => {},
    sysLine: (name: string, text: string) => { sys.push({ name, text }); },
    serverLine: (text: string) => { server.push(text); },
    patchWhois: (nick: string, fn: (w: { nick: string; loading: boolean; notFound?: boolean }) => typeof whois[string]) => {
      const cur = whois[nick] ?? { nick, loading: true };
      whois = { ...whois, [nick]: fn(cur) };
      state.whois = whois;
    },
  } as unknown as StoreHelpers;
  const { handleNumerics } = makeNumerics({
    get, set, helpers,
    closedChannels: new Set<string>(), lastCantSend: {}, lastAwayNotice: {},
    clearWhois: () => {},
    namesInFlight: new Set<string>(),
    profileCache: new Map(),
  } as Parameters<typeof makeNumerics>[0]);
  return { handleNumerics, state, sys, server };
}

describe('store numerics handler', () => {
  it('900 RPL_LOGGEDIN sets the account', () => {
    const { handleNumerics, state } = setup();
    expect(handleNumerics(mk('900', ['me', 'nick!u@h', 'bob']))).toBe(true);
    expect(state.account).toBe('bob');
  });

  it('005 RPL_ISUPPORT stores NETWORK as ircNetwork', () => {
    const { handleNumerics, state } = setup({
      client: { server: { network: 'EntreNous.chat' } },
      ircNetwork: '',
    });
    expect(handleNumerics(mk('005', ['me', 'NETWORK=EntreNous.chat', 'are supported']))).toBe(true);
    expect(state.ircNetwork).toBe('EntreNous.chat');
  });

  it('354 WHOX for ourselves fills the session account', () => {
    const { handleNumerics, state } = setup({ nick: 'Harry' });
    handleNumerics(mk('354', ['me', '152', '#x', 'Harry', 'H', 'Harry', '[12/H/Benquet]']));
    expect(state.account).toBe('Harry');
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

  it('routes MOTD numerics to the console as motd lines', () => {
    const { handleNumerics, server } = setup();
    expect(handleNumerics(mk('375', ['me', '- server Message of the day -']))).toBe(true);
    expect(handleNumerics(mk('372', ['me', '- \x032coloured\x0f line']))).toBe(true);
    expect(handleNumerics(mk('376', ['me', 'End of MOTD']))).toBe(true);
    expect(server.some((l) => l.includes('coloured') || l.includes('Message of the day'))).toBe(true);
  });

  it('406 ERR_WASNOSUCHNICK marks an open WHOIS as notFound without a chat line', () => {
    const { handleNumerics, sys, state } = setup({
      profileUser: 'ghost',
      whois: { ghost: { nick: 'ghost', loading: true } },
    });
    expect(handleNumerics(mk('406', ['me', 'ghost', 'was never on this network']))).toBe(true);
    expect(sys).toHaveLength(0);
    expect(state.whois.ghost).toMatchObject({ loading: false, notFound: true });
  });

  it('401 ERR_NOSUCHNICK triggers WHOWAS when the profile is open', () => {
    let whowasNick = '';
    const { handleNumerics, sys, state } = setup({
      profileUser: 'bob',
      whois: { bob: { nick: 'bob', loading: true } },
    });
    state.client.whowas = (nk: string) => { whowasNick = nk; };
    expect(handleNumerics(mk('401', ['me', 'bob', 'No such nick']))).toBe(true);
    expect(whowasNick).toBe('bob');
    expect(sys).toHaveLength(0);
  });

  it('401 without a WHOIS tracker stays off the focused channel', () => {
    const { handleNumerics, sys, server } = setup({ active: '#x' });
    expect(handleNumerics(mk('401', ['me', 'Harry', 'No such nick']))).toBe(true);
    expect(sys).toHaveLength(0);
    expect(server.some((t) => t.includes('Harry'))).toBe(true);
  });

  it('401 without a WHOIS tracker prints in an open query with that nick', () => {
    const { handleNumerics, sys } = setup({
      active: '#x',
      buffers: { bob: { name: 'bob' } },
    });
    expect(handleNumerics(mk('401', ['me', 'bob', 'No such nick']))).toBe(true);
    expect(sys).toEqual([{ name: 'bob', text: expect.stringContaining('⚠️') }]);
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
