import { describe, it, expect } from 'vitest';
import { makeWhois } from './whois';
import { parseLine } from '../irc/parser';
import type { WhoisInfo } from '../irc/types';
import type { ChatState } from '../store';

function setup(initial: Record<string, WhoisInfo> = {}) {
  let whois: Record<string, WhoisInfo> = { ...initial };
  const lines: [string, string][] = [];
  const get = () => ({ whois }) as unknown as ChatState;
  const set = (partial: Partial<ChatState>) => { if (partial.whois) whois = partial.whois; };
  const patchWhois = (nick: string, fn: (w: WhoisInfo) => WhoisInfo) => {
    const cur = whois[nick] ?? { nick, loading: true };
    whois = { ...whois, [nick]: fn(cur) };
  };
  const sysLine = (name: string, text: string) => { lines.push([name, text]); };
  const w = makeWhois({ get, set, patchWhois, sysLine } as Parameters<typeof makeWhois>[0]);
  return { w, whois: () => whois, lines };
}

describe('makeWhois — building the WhoisInfo', () => {
  it('assembles fields from the numeric stream', () => {
    const { w, whois } = setup();
    w.handleWhois(parseLine(':srv 311 me bob user host.name * :Real Name'));
    w.handleWhois(parseLine(':srv 312 me bob irc.example.net :Example'));
    w.handleWhois(parseLine(':srv 330 me bob bobacct :is logged in as'));
    w.handleWhois(parseLine(':srv 313 me bob :is an operator'));
    w.handleWhois(parseLine(':srv 318 me bob :End of /WHOIS'));
    const b = whois()['bob'];
    expect(b).toMatchObject({
      user: 'user', host: 'host.name', realname: 'Real Name',
      server: 'irc.example.net', account: 'bobacct', oper: true, loading: false,
    });
  });

  it('accumulates + de-dupes channels across multiple 319 lines', () => {
    const { w, whois } = setup();
    w.handleWhois(parseLine(':srv 319 me bob :#a #b'));
    w.handleWhois(parseLine(':srv 319 me bob :#b #c'));
    expect(whois()['bob'].channels).toBe('#a #b #c');
  });

  it('returns false for a non-WHOIS command (dispatcher falls through)', () => {
    const { w } = setup();
    expect(w.handleWhois(parseLine(':srv 353 me = #x :bob'))).toBe(false);
    expect(w.handleWhois(parseLine(':bob!u@h PRIVMSG #x :hi'))).toBe(false);
  });
});

describe('makeWhois — draft/metadata-2 profile', () => {
  it('stores live METADATA keys and clears on an absent value', () => {
    const { w, whois } = setup();
    w.handleWhois(parseLine(':srv METADATA bob avatar * :https://x/a.png'));
    w.handleWhois(parseLine(':srv METADATA bob pronouns * :they/them'));
    expect(whois()['bob'].meta).toEqual({ avatar: 'https://x/a.png', pronouns: 'they/them' });
    w.handleWhois(parseLine(':srv METADATA bob avatar *')); // no value = cleared
    expect(whois()['bob'].meta).toEqual({ pronouns: 'they/them' });
  });

  it('stores WHOIS-streamed 761 key/value and consumes 762', () => {
    const { w, whois } = setup();
    expect(w.handleWhois(parseLine(':srv 761 me bob bio * :Loves IRC'))).toBe(true);
    expect(whois()['bob'].meta).toEqual({ bio: 'Loves IRC' });
    expect(w.handleWhois(parseLine(':srv 762 me :end of metadata'))).toBe(true);
  });
});

describe('makeWhois — yomirc text WHOIS (printTo)', () => {
  it('on 318 prints the collected WHOIS to its window and clears the entry', () => {
    const { w, whois, lines } = setup({
      bob: { nick: 'bob', loading: true, printTo: '#log', user: 'u', host: 'h', account: 'acct' },
    });
    w.handleWhois(parseLine(':srv 318 me bob :End of /WHOIS'));
    expect(lines.some(([to, text]) => to === '#log' && text.includes('is u@h'))).toBe(true);
    expect(lines.some(([, text]) => text.includes('logged in as acct'))).toBe(true);
    expect(lines[lines.length - 1][1]).toContain('End of /WHOIS list.');
    expect(whois()['bob']).toBeUndefined(); // cleared after printing
  });

  it('on 318 without printTo just finalises loading, prints nothing', () => {
    const { w, whois, lines } = setup();
    w.handleWhois(parseLine(':srv 311 me bob u h * :R'));
    w.handleWhois(parseLine(':srv 318 me bob :End'));
    expect(lines).toHaveLength(0);
    expect(whois()['bob'].loading).toBe(false);
  });

  it('clearWhois removes an entry', () => {
    const { w, whois } = setup({ bob: { nick: 'bob', loading: false } });
    w.clearWhois('bob');
    expect(whois()['bob']).toBeUndefined();
  });
});
