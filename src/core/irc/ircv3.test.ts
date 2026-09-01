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
  const cap = (
    line: string,
    ctx: {
      registered: boolean;
      hasPassword: boolean;
      wantPasskey?: boolean;
      wantScram?: boolean;
      wantOauthBearer?: boolean;
    } = { registered: false, hasPassword: false },
  ) => ircv3.handleCap(parseLine(line), ctx);
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

  it('prefers OAUTHBEARER when requested and advertised', () => {
    const { ircv3, cap } = make();
    cap('CAP * LS :sasl=PLAIN,OAUTHBEARER');
    const a = cap('CAP * ACK :sasl', { registered: false, hasPassword: true, wantOauthBearer: true });
    expect(a).toEqual({ do: 'sasl', mech: 'OAUTHBEARER' });
    expect(ircv3.hasSaslMech('OAUTHBEARER')).toBe(true);
  });

  it('falls back to PLAIN when OAUTHBEARER is requested but not offered', () => {
    const { cap } = make();
    cap('CAP * LS :sasl=PLAIN,SCRAM-SHA-256');
    const a = cap('CAP * ACK :sasl', { registered: false, hasPassword: true, wantOauthBearer: true });
    expect(a).toEqual({ do: 'sasl', mech: 'PLAIN' });
  });

  it('forwards a post-registration manual CAP LS instead of renegotiating', () => {
    expect(make().cap('CAP * LS :message-tags', { registered: true, hasPassword: false }).do).toBe('forward');
  });

  it('NAK ends negotiation', () => {
    expect(make().cap('CAP * NAK :sasl').do).toBe('end');
  });

  it('never re-runs SASL or CAP END on a post-registration CAP NEW (rehash re-advertise)', () => {
    // A server rehash re-advertises a value-cap via cap-notify. On a live session
    // this must NOT re-request sasl or CAP END (that would re-auth with a spent
    // one-time credential and abort the connection).
    const reg = { registered: true, hasPassword: true };
    const withSasl = make();
    // sasl + the value-cap were both acked during registration
    withSasl.cap('CAP * ACK :sasl draft/metadata-2', { registered: false, hasPassword: true });
    // rehash re-advertises them (all already acked) → nothing to do
    expect(withSasl.cap('CAP * NEW :draft/metadata-2=x sasl', reg).do).toBe('none');

    // a post-registration ACK is bookkeeping only, never SASL/END
    expect(make().cap('CAP * ACK :sasl', reg).do).toBe('none');

    // but a genuinely new *feature* cap is still pulled in (never sasl)
    const fresh = make().cap('CAP * NEW :draft/read-marker', reg);
    expect(fresh.do).toBe('req');
    if (fresh.do === 'req') expect(fresh.caps).not.toContain('sasl');
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
    ircv3.markRead('#x', '2020-01-01T00:00:00Z', 'bob');
    expect(sent).toHaveLength(0);
    cap('CAP * ACK :draft/read-marker');
    ircv3.markRead('#x', '2020-01-01T00:00:00Z', 'bob');
    expect(sent).toEqual(['MARKREAD #x timestamp=2020-01-01T00:00:00Z']);
  });

  it('skips MARKREAD when the session has no account', () => {
    const { ircv3, sent, cap } = make();
    cap('CAP * ACK :draft/read-marker');
    ircv3.markRead('#x', '2020-01-01T00:00:00Z', '');
    expect(sent).toHaveLength(0);
  });

  it('returns sent/no-cap/skipped-target for setBufferMuted', () => {
    const { ircv3, sent, cap } = make();
    expect(ircv3.setBufferMuted('#x', true)).toBe('no-cap');
    cap('CAP * ACK :draft/metadata-2');
    expect(ircv3.setBufferMuted('#x', true)).toBe('sent');
    expect(ircv3.setBufferMuted('$server', true)).toBe('skipped-target');
    expect(sent).toEqual([
      'METADATA #x SET soju.im/muted 1',
    ]);
  });

  it('sends soju.im/muted SET/clear when mute toggles', () => {
    const { ircv3, sent, cap } = make();
    cap('CAP * ACK :draft/metadata-2');
    ircv3.setBufferMuted('#x', true);
    ircv3.setBufferMuted('#x', false);
    expect(sent).toEqual([
      'METADATA #x SET soju.im/muted 1',
      'METADATA #x SET soju.im/muted 0',
    ]);
  });

  it('skips MARKREAD, METADATA and TAGMSG to local $ buffers', () => {
    const { ircv3, sent, cap } = make();
    cap('CAP * ACK :draft/read-marker draft/metadata-2 message-tags');
    ircv3.markRead('$notice:gardian', '2020-01-01T00:00:00Z', 'bob');
    ircv3.fetchMetadata('$server');
    ircv3.sendTyping('$notice:gardian', 'active');
    ircv3.react('$notice:gardian', 'abc', '\u{1F600}');
    expect(sent).toHaveLength(0);
  });

  it('skips MARKREAD, METADATA and TAGMSG to ZNC module nicks', () => {
    const { ircv3, sent, cap } = make();
    cap('CAP * ACK :draft/read-marker draft/metadata-2 message-tags');
    ircv3.markRead('*status', '2020-01-01T00:00:00Z', 'bob');
    ircv3.fetchMetadata('*status');
    ircv3.sendTyping('*status', 'active');
    ircv3.react('*status', 'abc', '\u{1F600}');
    expect(sent).toHaveLength(0);
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

  it('only sends WEBPUSH when ISUPPORT advertises VAPID and the session has an account', () => {
    const off = make();
    off.ircv3.webpushRegister('https://push/x', 'p256dh=a;auth=b', 'bob');
    off.ircv3.webpushUnregister('https://push/x', 'bob');
    expect(off.sent).toHaveLength(0);
    const on = make({ VAPID: 'BKey' });
    on.ircv3.webpushRegister('https://push/x', 'p256dh=a;auth=b', '');
    expect(on.sent).toHaveLength(0);
    on.ircv3.webpushRegister('https://push/x', 'p256dh=a;auth=b', 'bob');
    expect(on.sent).toEqual(['WEBPUSH REGISTER https://push/x p256dh=a;auth=b']);
  });

  it('routes chathistory prefetch through the low-priority queue', () => {
    const { ircv3, sent, low, cap } = make();
    cap('CAP * ACK :draft/chathistory');
    ircv3.chathistoryLatest('#x', 50);
    expect(sent).toHaveLength(0);
    expect(low).toEqual(['CHATHISTORY LATEST #x * 50']);
  });

  it('sends CHATHISTORY for the visible channel immediately', () => {
    const { ircv3, sent, low, cap } = make();
    cap('CAP * ACK :draft/chathistory');
    ircv3.chathistoryLatest('#x', 50, { urgent: true });
    expect(sent).toEqual(['CHATHISTORY LATEST #x * 50']);
    expect(low).toHaveLength(0);
  });

  it('skips chathistory prefetch without the cap', () => {
    const { ircv3, low } = make();
    ircv3.chathistoryLatest('#x', 50);
    expect(low).toHaveLength(0);
  });
});
