import { describe, it, expect } from 'vitest';
import { makeWhois } from './whois';
import { parseLine } from '../irc/parser';
import { canon, trackBufferMuteSync } from './context';
import type { WhoisInfo } from '../irc/types';
import type { ChatState } from '../store';

function setup(initial: Record<string, WhoisInfo> = {}, nick = 'me') {
  let whois: Record<string, WhoisInfo> = { ...initial };
  let account = '';
  let notifyLevel: Record<string, string> = {};
  const lines: [string, string][] = [];
  const statusLines: string[] = [];
  const get = () => ({ whois, nick, account, notifyLevel }) as unknown as ChatState;
  const set = (partial: Partial<ChatState>) => {
    if (partial.whois) whois = partial.whois;
    if (typeof partial.account === 'string') account = partial.account;
    if (partial.notifyLevel) notifyLevel = partial.notifyLevel as Record<string, string>;
  };
  const patchWhois = (nickName: string, fn: (w: WhoisInfo) => WhoisInfo) => {
    const cur = whois[nickName] ?? { nick: nickName, loading: true };
    whois = { ...whois, [nickName]: fn(cur) };
  };
  const sysLine = (name: string, text: string) => { lines.push([name, text]); };
  const serverLine = (text: string) => { statusLines.push(text); };
  const w = makeWhois({ get, set, patchWhois, sysLine, serverLine, persistNs: '' } as Parameters<typeof makeWhois>[0]);
  return { w, whois: () => whois, account: () => account, lines, statusLines, notifyLevel: () => notifyLevel };
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

  it('330 on ourselves fills the session account (ZNC attach has no SASL 900)', () => {
    const { w, account } = setup({}, 'Harry');
    w.handleWhois(parseLine(':srv 330 Harry Harry Harry :is logged in as'));
    expect(account()).toBe('Harry');
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

describe('makeWhois — soju.im/muted buffer prefs', () => {
  it('maps muted=1 to notifyLevel mute and clears on key-not-set', () => {
    const { w, notifyLevel } = setup();
    expect(w.handleWhois(parseLine(':srv 761 me #x soju.im/muted * :1'))).toBe(true);
    expect(notifyLevel()[canon('#x')]).toBe('mute');
    expect(w.handleWhois(parseLine(':srv 766 me #x soju.im/muted :key not set'))).toBe(true);
    expect(notifyLevel()[canon('#x')]).toBeUndefined();
  });

  it('reports server mute sync status in Status when a SET round-trip is pending', () => {
    const { w, statusLines } = setup();
    trackBufferMuteSync('#x', 'set-on');
    w.handleWhois(parseLine(':srv 761 me #x soju.im/muted * :1'));
    expect(statusLines.some((l) => l.includes('#x') && l.includes('soju.im/muted'))).toBe(true);
  });

  it('does not warn unexpected when JOIN GET and SET replies are interleaved', () => {
    const { w, statusLines } = setup();
    // JOIN restores mute from server, then user toggles mute on — both pending.
    trackBufferMuteSync('#x', 'get');
    trackBufferMuteSync('#x', 'set-on');
    // GET reply first (not muted), then SET reply (muted=1).
    w.handleWhois(parseLine(':srv 766 me #x soju.im/muted :key not set'));
    w.handleWhois(parseLine(':srv 761 me #x soju.im/muted * :1'));
    expect(statusLines.some((l) => /incohérente|inconsistent|inattendue|unexpected/i.test(l))).toBe(false);
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

  it('stores GET-streamed 761 key/value, clears on 766, consumes 762', () => {
    const { w, whois } = setup();
    expect(w.handleWhois(parseLine(':srv 761 me bob bio * :Loves IRC'))).toBe(true);
    expect(w.handleWhois(parseLine(':srv 761 me bob pronouns * :they/them'))).toBe(true);
    expect(whois()['bob'].meta).toEqual({ bio: 'Loves IRC', pronouns: 'they/them' });
    expect(w.handleWhois(parseLine(':srv 766 me bob bio :key not set'))).toBe(true);
    expect(whois()['bob'].meta).toEqual({ pronouns: 'they/them' });
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

  it('369 ENDOFWHOWAS with no user data marks notFound', () => {
    const { w, whois } = setup({ ghost: { nick: 'ghost', loading: true } });
    w.handleWhois(parseLine(':srv 369 me ghost :End of WHOWAS'));
    expect(whois()['ghost']).toMatchObject({ loading: false, notFound: true });
  });

  it('369 ENDOFWHOWAS keeps data when WHOWAS returned a user', () => {
    const { w, whois } = setup({ bob: { nick: 'bob', loading: true } });
    w.handleWhois(parseLine(':srv 314 me bob u h * :R'));
    w.handleWhois(parseLine(':srv 369 me bob :End of WHOWAS'));
    expect(whois()['bob']).toMatchObject({ user: 'u', host: 'h', offline: true, loading: false, notFound: false });
  });

  it('clearWhois removes an entry', () => {
    const { w, whois } = setup({ bob: { nick: 'bob', loading: false } });
    w.clearWhois('bob');
    expect(whois()['bob']).toBeUndefined();
  });
});
