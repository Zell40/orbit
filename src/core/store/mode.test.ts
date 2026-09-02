import { describe, it, expect } from 'vitest';
import { makeMode } from './mode';
import { parseLine } from '../irc/parser';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

type Member = { nick: string; user?: string; host?: string; prefix?: string; prefixes?: string };
type Buf = { name: string; members: Record<string, Member>; modes?: string; modeParams?: Record<string, string> };

function setup() {
  const state = {
    umodes: '', account: '',
    client: { server: { prefixModes: '~&@%+', isupport: { CHANMODES: 'beI,k,l,imnpst' }, prefixModeToChar: { q: '~', a: '&', o: '@', h: '%', v: '+' } } },
    buffers: {} as Record<string, Buf>,
  };
  const k = (n: string) => n.toLowerCase();
  const lines: { name: string; text: string; kind: string; from?: string }[] = [];
  const serverLines: { text: string; kind?: string }[] = [];
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  const helpers = {
    patchBuffer: (name: string, fn: (b: Buf) => Buf) => { if (state.buffers[k(name)]) state.buffers[k(name)] = fn(state.buffers[k(name)]); },
    sysLine: (name: string, text: string, kind: string, from?: string) => { lines.push({ name, text, kind, from }); },
    serverLine: (text: string, kind?: string) => { serverLines.push({ text, kind }); },
  } as unknown as StoreHelpers;
  const seedChan = (chan: string, members: string[]) => {
    state.buffers[k(chan)] = { name: chan, modes: '', modeParams: {}, members: Object.fromEntries(members.map((n) => [n, { nick: n, user: 'u', host: 'h', prefix: '' }])) };
  };
  const { handleMode } = makeMode({ get, set, helpers } as Parameters<typeof makeMode>[0]);
  const on = (line: string, me = 'me') => handleMode(parseLine(line), me);
  return { on, state, lines, serverLines, seedChan };
}

describe('MODE handler', () => {
  it('tracks our own user modes', () => {
    const { on, state, serverLines } = setup();
    on(':srv MODE me +iw', 'me');
    expect(state.umodes).toContain('i');
    expect(state.umodes).toContain('w');
    expect(serverLines).toHaveLength(1);
    expect(serverLines[0].kind).toBe('umode');
  });

  it('applies a +o membership grant to the member prefix', () => {
    const { on, state, seedChan } = setup();
    seedChan('#x', ['bob']);
    on(':op!u@h MODE #x +o bob', 'me');
    expect(state.buffers['#x'].members['bob'].prefix).toBe('@');
    expect(state.buffers['#x'].members['bob'].prefixes).toBe('@');
  });

  it('renders a +b ban as its own line, listing the present members it hits', () => {
    const { on, lines, seedChan } = setup();
    seedChan('#x', ['bob']); // bob!u@h
    on(':op!u@h MODE #x +b *!*@h', 'me');
    const bans = lines.filter((l) => l.kind === 'ban');
    expect(bans).toHaveLength(1);
    expect(bans[0].from).toBe('op');
    expect(bans[0].text.startsWith('+ *!*@h')).toBe(true);
    expect(bans[0].text).toContain('bob');
    expect(lines.some((l) => l.kind === 'mode')).toBe(false);
  });

  it('keeps a MODE callout for +ob, without the +b part', () => {
    const { on, lines, seedChan } = setup();
    seedChan('#x', ['bob']);
    on(':op!u@h MODE #x +ob bob user!*@*', 'me');
    expect(lines.filter((l) => l.kind === 'ban')).toHaveLength(1);
    const modes = lines.filter((l) => l.kind === 'mode');
    expect(modes).toHaveLength(1);
    expect(modes[0].text).toBe('+o bob');
  });

  it('treats +b as a ban even when CHANMODES has no type-A list', () => {
    const { on, lines, seedChan, state } = setup();
    state.client.server.isupport = { CHANMODES: ',k,l,imnpst' };
    seedChan('#x', ['bob']);
    on(':op!u@h MODE #x +b bob!*@*', 'me');
    expect(lines.filter((l) => l.kind === 'ban')).toHaveLength(1);
    expect(lines.some((l) => l.kind === 'mode')).toBe(false);
    expect(lines[0].text.startsWith('+ bob!*@*')).toBe(true);
  });

  it('shows a combined mode line for a channel flag change', () => {
    const { on, lines, seedChan } = setup();
    seedChan('#x', []);
    on(':op!u@h MODE #x +m', 'me');
    expect(lines.some((l) => l.kind === 'mode')).toBe(true);
  });

  it('returns false for a non-MODE command', () => {
    const { on } = setup();
    expect(on(':bob!u@h JOIN #x')).toBe(false);
  });
});
