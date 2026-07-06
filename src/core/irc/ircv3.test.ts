import { describe, it, expect } from 'vitest';
import { Ircv3 } from './ircv3';
import { parseLine } from './parser';

// A fake transport that records what the IRCv3 layer would put on the wire.
function make(isup: Record<string, string> = {}) {
  const sent: string[] = [];
  const low: string[] = [];
  const ircv3 = new Ircv3({
    send: (l) => sent.push(l),
    lowSend: (l) => low.push(l),
    isupport: () => isup,
  });
  const cap = (line: string, ctx = { registered: false, hasPassword: false }) =>
    ircv3.handleCap(parseLine(line), ctx);
  return { ircv3, sent, low, cap };
}

describe('Ircv3 capability negotiation', () => {
  it('requests the intersection of wanted and advertised caps', () => {
    const { cap } = make();
    const a = cap('CAP * LS :message-tags server-time sasl bogus-cap');
    expect(a.do).toBe('req');
    if (a.do === 'req') {
      expect(a.caps).toEqual(expect.arrayContaining(['message-tags', 'server-time', 'sasl']));
      expect(a.caps).not.toContain('bogus-cap');
    }
  });

  it('ends negotiation when nothing wanted is advertised', () => {
    expect(make().cap('CAP * LS :bogus-cap another-bogus').do).toBe('end');
  });

  it('buffers a multi-line CAP LS and only requests on the final line', () => {
    const { cap } = make();
    expect(cap('CAP * LS * :message-tags').do).toBe('none'); // trailing '*' → more to come
    expect(cap('CAP * LS :server-time').do).toBe('req');
  });

  it('starts SASL only when acked and a password is present', () => {
    expect(make().cap('CAP * ACK :sasl', { registered: false, hasPassword: true }).do).toBe('sasl');
    expect(make().cap('CAP * ACK :sasl', { registered: false, hasPassword: false }).do).toBe('end');
  });

  it('forwards a post-registration manual CAP LS instead of renegotiating', () => {
    expect(make().cap('CAP * LS :message-tags', { registered: true, hasPassword: false }).do).toBe('forward');
  });

  it('NAK ends negotiation', () => {
    expect(make().cap('CAP * NAK :sasl').do).toBe('end');
  });

  it('tracks acked caps; DEL and reset() forget them', () => {
    const { ircv3, cap } = make();
    cap('CAP * ACK :message-tags draft/read-marker');
    expect(ircv3.hasCap('message-tags')).toBe(true);
    expect(ircv3.hasCap('draft/read-marker')).toBe(true);
    cap('CAP * DEL :draft/read-marker');
    expect(ircv3.hasCap('draft/read-marker')).toBe(false);
    ircv3.reset();
    expect(ircv3.hasCap('message-tags')).toBe(false);
  });

  it('learns draft/multiline max-lines from CAP LS', () => {
    const { ircv3, cap } = make();
    cap('CAP * LS :draft/multiline=max-lines=42');
    expect(ircv3.multilineMaxLines).toBe(42);
  });
});

describe('Ircv3 cap-gated commands', () => {
  it('skips MARKREAD without the cap, sends it with', () => {
    const { ircv3, sent, cap } = make();
    ircv3.markRead('#x', '2020-01-01T00:00:00Z');
    expect(sent).toHaveLength(0);
    cap('CAP * ACK :draft/read-marker');
    ircv3.markRead('#x', '2020-01-01T00:00:00Z');
    expect(sent).toEqual(['MARKREAD #x timestamp=2020-01-01T00:00:00Z']);
  });

  it('skips typing and reactions without message-tags', () => {
    const { ircv3, sent } = make();
    ircv3.sendTyping('#x', 'active');
    ircv3.react('#x', 'abc', '\u{1F600}');
    expect(sent).toHaveLength(0);
  });

  it('only sends MONITOR when ISUPPORT advertises it', () => {
    const off = make();
    off.ircv3.monitor('+', 'bob');
    expect(off.sent).toHaveLength(0);
    const on = make({ MONITOR: '100' });
    on.ircv3.monitor('+', 'bob');
    expect(on.sent).toEqual(['MONITOR + bob']); // per spec: "MONITOR + <nicklist>"
  });

  it('only sends WEBPUSH when ISUPPORT advertises VAPID', () => {
    const off = make();
    off.ircv3.webpushRegister('https://push/x', 'p256dh=a;auth=b');
    off.ircv3.webpushUnregister('https://push/x');
    expect(off.sent).toHaveLength(0);
    const on = make({ VAPID: 'BKey' });
    on.ircv3.webpushRegister('https://push/x', 'p256dh=a;auth=b');
    expect(on.sent).toEqual(['WEBPUSH REGISTER https://push/x p256dh=a;auth=b']);
  });

  it('routes chathistory prefetch through the low-priority queue', () => {
    const { ircv3, sent, low } = make();
    ircv3.chathistoryLatest('#x', 50);
    expect(sent).toHaveLength(0);
    expect(low).toEqual(['CHATHISTORY LATEST #x * 50']);
  });
});
