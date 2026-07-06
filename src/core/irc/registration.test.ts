import { describe, it, expect } from 'vitest';
import { Registration } from './registration';
import { Ircv3 } from './ircv3';
import { parseLine } from './parser';
import type { ConnectOptions } from './types';

// A fake host that records what registration sends + the state it writes back.
function make(opts: Partial<ConnectOptions> = {}) {
  const sent: string[] = [];
  const statuses: string[] = [];
  const state = { nick: '', registered: false, backoffResets: 0, away: '' };
  const ircv3 = new Ircv3({ send: () => {}, lowSend: () => {}, isupport: () => ({}) });
  const full: ConnectOptions = { url: 'ws://x', nick: 'bob', channels: [], ...opts };
  const reg = new Registration({
    send: (l) => sent.push(l),
    setStatus: (s) => statuses.push(s),
    forward: () => {},
    ircv3,
    opts: () => full,
    getNick: () => state.nick,
    setNick: (n) => { state.nick = n; },
    isRegistered: () => state.registered,
    setRegistered: (v) => { state.registered = v; },
    resetBackoff: () => { state.backoffResets++; },
    awayMessage: () => state.away,
  });
  return { reg, ircv3, sent, statuses, state };
}

describe('Registration handshake', () => {
  it('sends the registration burst in spec order on start', () => {
    const { reg, sent, state } = make({ nick: 'bob' });
    reg.start();
    expect(sent).toEqual(['CAP LS 302', 'NICK bob', 'USER guest 0 * :bob']);
    expect(state.nick).toBe('bob');
  });

  it('includes PASS when a server password is set', () => {
    const { reg, sent } = make({ nick: 'bob', serverPassword: 'sekret' });
    reg.start();
    expect(sent).toContain('PASS :sekret');
  });

  it('requests the wanted caps then ends when there is no SASL', () => {
    const { reg, sent } = make();
    reg.handle(parseLine('CAP * LS :message-tags server-time'));
    expect(sent[0]).toMatch(/^CAP REQ :/);
    reg.handle(parseLine('CAP * ACK :message-tags server-time'));
    expect(sent).toContain('CAP END');
  });

  it('runs SASL when a password is present and sasl is acked', () => {
    const { reg, sent } = make({ nick: 'bob', password: 'pw' });
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).toContain('AUTHENTICATE PLAIN');
    sent.length = 0;
    reg.handle(parseLine('AUTHENTICATE +'));
    expect(sent.some((l) => l.startsWith('AUTHENTICATE ') && l !== 'AUTHENTICATE +')).toBe(true); // base64 payload
    reg.handle(parseLine('903 bob :SASL authentication successful'));
    expect(sent).toContain('CAP END');
  });

  it('retries with a suffixed nick on 433 while unregistered, ignores it once registered', () => {
    const { reg, sent, state } = make({ nick: 'bob' });
    reg.handle(parseLine('433 * bob :Nickname is already in use'));
    expect(state.nick).toMatch(/^bob\d{3}$/);
    expect(sent.some((l) => l.startsWith('NICK bob'))).toBe(true);

    const reg2 = make({ nick: 'bob' });
    reg2.state.registered = true;
    reg2.reg.handle(parseLine('433 * bob :Nickname is already in use'));
    expect(reg2.sent).toHaveLength(0);
  });

  it('on 001 sets registered, clears backoff, adopts the nick, emits status, joins channels', () => {
    const { reg, sent, statuses, state } = make({ nick: 'bob', channels: ['#a', '#b'] });
    reg.handle(parseLine(':srv 001 bobby :Welcome'));
    expect(state.registered).toBe(true);
    expect(state.backoffResets).toBe(1);
    expect(state.nick).toBe('bobby');
    expect(statuses).toContain('registered');
    expect(sent).toEqual(['JOIN #a', 'JOIN #b']);
  });

  it('applies pre-away before CAP END when the cap is present and away is set', () => {
    const { reg, ircv3, sent, state } = make();
    state.away = 'brb';
    ircv3.handleCap(parseLine('CAP * ACK :draft/pre-away'), { registered: false, hasPassword: false });
    reg.handle(parseLine('CAP * NAK :x')); // NAK → endCap
    expect(sent).toEqual(['AWAY :brb', 'CAP END']);
  });
});
