import { describe, it, expect } from 'vitest';
import { Registration } from './registration';
import { Ircv3 } from './ircv3';
import { parseLine } from './parser';
import type { ConnectOptions } from './types';

// A fake host that records what registration sends + the state it writes back.
function make(opts: Partial<ConnectOptions> = {}, passkeyAssertion: (c: Uint8Array) => Promise<string> = () => Promise.resolve('{}')) {
  const sent: string[] = [];
  const statuses: string[] = [];
  const challenges: Uint8Array[] = [];
  const state = { nick: '', registered: false, backoffResets: 0, away: '', aborts: 0 };
  const ircv3 = new Ircv3({ send: () => {}, lowSend: () => {}, isupport: () => ({}) });
  const full: ConnectOptions = { url: 'ws://x', nick: 'bob', channels: [], ...opts };
  const reg = new Registration({
    send: (l) => sent.push(l),
    setStatus: (s) => statuses.push(s),
    forward: () => {},
    abort: () => { state.aborts++; },
    ircv3,
    opts: () => full,
    getNick: () => state.nick,
    setNick: (n) => { state.nick = n; },
    isRegistered: () => state.registered,
    setRegistered: (v) => { state.registered = v; },
    resetBackoff: () => { state.backoffResets++; },
    awayMessage: () => state.away,
    getPasskeyAssertion: (c) => { challenges.push(c); return passkeyAssertion(c); },
  });
  return { reg, ircv3, sent, statuses, state, challenges };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Registration handshake', () => {
  it('sends the registration burst in spec order on start', () => {
    const { reg, sent, state } = make({ nick: 'bob' });
    reg.start();
    expect(sent).toEqual(['CAP LS 302', 'NICK bob', 'USER guest 0 * :bob']);
    expect(state.nick).toBe('bob');
  });

  it('awaits resolveRealname before USER so GECOS is on the registration line', async () => {
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((r) => { resolve = r; });
    const { reg, sent } = make({
      nick: 'bob',
      resolveRealname: () => pending,
    });
    reg.start();
    expect(sent).toEqual([]); // not yet — waiting on WP / profile lookup
    resolve('40 - Homme - Paris');
    await flush();
    expect(sent).toEqual(['CAP LS 302', 'NICK bob', 'USER guest 0 * :40 - Homme - Paris']);
  });

  it('refreshes Bearer then resolveRealname before USER', async () => {
    const order: string[] = [];
    const { reg, sent } = make({
      nick: 'bob',
      password: 'old',
      oauthBearer: true,
      refreshBearer: async () => { order.push('bearer'); return 'fresh-jwt'; },
      resolveRealname: async () => { order.push('gecos'); return '40 - Homme - Paris'; },
    });
    reg.start();
    await flush();
    expect(order).toEqual(['bearer', 'gecos']);
    expect(sent).toEqual(['CAP LS 302', 'NICK bob', 'USER guest 0 * :40 - Homme - Paris']);
  });

  it('includes PASS when a server password is set', () => {
    const { reg, sent } = make({ nick: 'bob', serverPassword: 'sekret' });
    reg.start();
    expect(sent).toContain('PASS :sekret');
  });

  it('sends HOST before CAP when a bouncer upstream is set', () => {
    const { reg, sent } = make({
      nick: 'bob',
      serverPassword: 'bob:pw',
      bouncerHost: 'bnc.entrenous.chat:+8066',
    });
    reg.start();
    expect(sent[0]).toBe('HOST bnc.entrenous.chat:+8066');
    expect(sent).toEqual([
      'HOST bnc.entrenous.chat:+8066',
      'CAP LS 302',
      'PASS :bob:pw',
      'NICK bob',
      'USER guest 0 * :bob',
    ]);
  });

  it('does not run SASL when only a bouncer (PASS) password is set', () => {
    const { reg, sent } = make({ nick: 'bob', serverPassword: 'user/net:pw' });
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).not.toContain('AUTHENTICATE PLAIN');
    expect(sent).toContain('CAP END');
  });

  it('can send PASS and still run SASL when both passwords are set', () => {
    const { reg, sent } = make({ nick: 'bob', serverPassword: 'user/net:pw', password: 'nickserv' });
    reg.start();
    expect(sent).toContain('PASS :user/net:pw');
    sent.length = 0;
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).toContain('AUTHENTICATE PLAIN');
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

  it('runs SASL WEBAUTHN when passkey is requested and the server offers it', async () => {
    const { reg, sent, challenges } = make(
      { nick: 'bob', passkey: true },
      () => Promise.resolve('{"id":"abc","type":"public-key"}'),
    );
    reg.handle(parseLine('CAP * LS :sasl=PLAIN,WEBAUTHN message-tags'));
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).toContain('AUTHENTICATE WEBAUTHN'); // not PLAIN
    sent.length = 0;
    reg.handle(parseLine(`AUTHENTICATE ${btoa('0123456789abcdef0123456789abcdef')}`)); // 32-byte challenge
    await flush();
    expect(challenges).toHaveLength(1);
    expect(challenges[0]).toHaveLength(32);
    expect(sent.some((l) => l.startsWith('AUTHENTICATE ') && l !== 'AUTHENTICATE +')).toBe(true); // assertion payload
    reg.handle(parseLine('903 bob :ok'));
    expect(sent).toContain('CAP END');
  });

  it('aborts the exchange when the passkey ceremony is cancelled', async () => {
    const { reg, sent, statuses } = make(
      { nick: 'bob', passkey: true },
      () => Promise.reject(new Error('user cancelled')),
    );
    reg.handle(parseLine('CAP * LS :sasl=WEBAUTHN'));
    reg.handle(parseLine('CAP * ACK :sasl'));
    sent.length = 0;
    reg.handle(parseLine(`AUTHENTICATE ${btoa('0123456789abcdef0123456789abcdef')}`));
    await flush();
    expect(sent).toContain('AUTHENTICATE *'); // SASL abort
    expect(statuses).toContain('sasl-failed');
  });

  it('falls back to no SASL when passkey is requested but WEBAUTHN is not offered', () => {
    const { reg, sent } = make({ nick: 'bob', passkey: true });
    reg.handle(parseLine('CAP * LS :sasl=PLAIN'));
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).not.toContain('AUTHENTICATE WEBAUTHN');
    expect(sent).toContain('CAP END');
  });

  it('uses SCRAM-SHA-256 when scram is requested and offered, sending client-first', () => {
    const { reg, sent } = make({ nick: 'bob', password: 'pw', scram: true });
    reg.handle(parseLine('CAP * LS :sasl=PLAIN,SCRAM-SHA-256 message-tags'));
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).toContain('AUTHENTICATE SCRAM-SHA-256'); // not PLAIN
    sent.length = 0;
    reg.handle(parseLine('AUTHENTICATE +')); // server ready → client-first
    const cf = sent.find((l) => l.startsWith('AUTHENTICATE ') && l !== 'AUTHENTICATE +');
    expect(cf).toBeTruthy();
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(cf!.slice('AUTHENTICATE '.length)), (c) => c.charCodeAt(0)));
    expect(decoded).toMatch(/^n,,n=bob,r=/);
  });

  it('falls back to PLAIN when SCRAM is rejected, and only gives up if PLAIN fails too', () => {
    const { reg, sent, statuses, state } = make({ nick: 'bob', password: 'pw', scram: true });
    reg.handle(parseLine('CAP * LS :sasl=SCRAM-SHA-256'));
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).toContain('AUTHENTICATE SCRAM-SHA-256');
    sent.length = 0;
    reg.handle(parseLine('904 bob :SASL failed')); // SCRAM rejected → retry with PLAIN
    expect(sent).toContain('AUTHENTICATE PLAIN');
    expect(statuses).not.toContain('sasl-failed');
    reg.handle(parseLine('AUTHENTICATE +'));
    expect(sent.some((l) => l.startsWith('AUTHENTICATE ') && l !== 'AUTHENTICATE +')).toBe(true); // PLAIN payload
    reg.handle(parseLine('904 bob :SASL failed')); // PLAIN also fails → abort, don't register as a guest
    expect(statuses).toContain('sasl-failed');
    expect(sent).not.toContain('CAP END');
    expect(state.aborts).toBe(1);
  });

  it('aborts the connection instead of registering as a guest when SASL fails', () => {
    const { reg, sent, statuses, state } = make({ nick: 'bob', password: 'wrong' });
    reg.handle(parseLine('CAP * ACK :sasl'));
    reg.handle(parseLine('AUTHENTICATE +'));
    sent.length = 0;
    reg.handle(parseLine('904 bob :SASL authentication failed'));
    expect(statuses).toContain('sasl-failed');
    expect(sent).not.toContain('CAP END'); // did NOT fall through to an unauthenticated session
    expect(state.aborts).toBe(1);
  });

  it('does not use SCRAM when the server does not advertise it', () => {
    const { reg, sent } = make({ nick: 'bob', password: 'pw', scram: true });
    reg.handle(parseLine('CAP * LS :sasl=PLAIN'));
    reg.handle(parseLine('CAP * ACK :sasl'));
    expect(sent).toContain('AUTHENTICATE PLAIN');
    expect(sent).not.toContain('AUTHENTICATE SCRAM-SHA-256');
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
