import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Transport } from './transport';

// A controllable fake WebSocket. The transport news up `new WebSocket(url, protos)`
// and drives it through onopen/onmessage/onclose/onerror; the tests drive it back
// through the _open/_message/_close/_error helpers.
class FakeWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  url: string;
  protocols: string[];
  binaryType = 'blob';
  readyState = FakeWebSocket.CONNECTING;
  protocol = 'text.ircv3.net';
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string, protocols?: string[]) {
    this.url = url; this.protocols = protocols ?? [];
    FakeWebSocket.instances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = FakeWebSocket.CLOSED; }
  _open(protocol = 'text.ircv3.net') { this.readyState = FakeWebSocket.OPEN; this.protocol = protocol; this.onopen?.(); }
  _message(data: string) { this.onmessage?.({ data }); }
  _close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
  _error() { this.onerror?.(); }
}

const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

function setup() {
  const rec = {
    open: 0,
    lines: [] as string[],
    status: [] as string[],
    reconnecting: [] as number[],
    rawOut: [] as string[],
  };
  const t = new Transport({
    onOpen: () => { rec.open++; },
    onLine: (l) => rec.lines.push(l),
    onStatus: (s) => rec.status.push(s),
    onReconnecting: (n) => rec.reconnecting.push(n),
    onRawOut: (l) => rec.rawOut.push(l),
  });
  return { t, rec };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // backoff jitter → delay == base
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (globalThis as unknown as { WebSocket?: unknown }).WebSocket;
});

describe('Transport — connect + open', () => {
  it('opens a socket with the URL and IRCv3 subprotocols, emits connecting', () => {
    const { t, rec } = setup();
    t.connect('ws://server/');
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(last().url).toBe('ws://server/');
    expect(last().protocols).toEqual(['text.ircv3.net', 'binary.ircv3.net']);
    expect(rec.status).toContain('connecting');
    expect(t.isOpen).toBe(false);
  });

  it('fires onOpen and reports isOpen once the socket opens', () => {
    const { t, rec } = setup();
    t.connect('ws://x');
    last()._open();
    expect(rec.open).toBe(1);
    expect(t.isOpen).toBe(true);
  });
});

describe('Transport — inbound framing', () => {
  it('splits a chunk into lines and strips CRLF', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); last()._open();
    last()._message('one\r\ntwo\r\n');
    expect(rec.lines).toEqual(['one', 'two']);
  });

  it('flushes a trailing partial line in text sub-protocol (no newline framing)', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); last()._open('text.ircv3.net');
    last()._message('PING :x'); // no trailing newline
    expect(rec.lines).toEqual(['PING :x']);
  });

  it('buffers a partial line in binary sub-protocol until the newline arrives', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); last()._open('binary.ircv3.net');
    last()._message('PING :x');
    expect(rec.lines).toEqual([]);      // buffered
    last()._message('\r\n');
    expect(rec.lines).toEqual(['PING :x']);
  });
});

describe('Transport — outbound', () => {
  it('sendRaw strips CR/LF/NUL, appends CRLF, and reports the wire line', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); last()._open();
    t.sendRaw('FOO\r\nBAR\0BAZ');
    expect(last().sent).toEqual(['FOOBARBAZ\r\n']);
    expect(rec.rawOut).toEqual(['FOOBARBAZ']);
  });

  it('drops writes while the socket is not open', () => {
    const { t } = setup();
    t.connect('ws://x'); // still CONNECTING
    t.sendRaw('NOPE');
    expect(last().sent).toEqual([]);
  });

  it('token bucket: sends a burst immediately then paces the overflow', () => {
    const { t } = setup();
    t.connect('ws://x'); last()._open(); // tokens reset to burst (8)
    for (let i = 0; i < 10; i++) t.send(`L${i}`);
    expect(last().sent).toHaveLength(8);       // burst
    vi.advanceTimersByTime(1000);
    expect(last().sent).toHaveLength(9);       // +1 token
    vi.advanceTimersByTime(1000);
    expect(last().sent).toHaveLength(10);      // drained
  });
});

describe('Transport — reconnect', () => {
  it('on close emits closed + reconnecting, then reopens after the backoff', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); last()._open();
    last()._close();
    expect(rec.status).toContain('closed');
    expect(rec.reconnecting).toEqual([1]);     // base 1s, jitter 0.5 → 1s
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2); // reopened
  });

  it('backoff grows across attempts and resetBackoff() clears it', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); last()._open();
    last()._close();                 // attempt 1 → 1s
    vi.advanceTimersByTime(1000);
    last()._open(); last()._close(); // attempt 2 → 2s
    expect(rec.reconnecting).toEqual([1, 2]);
    t.resetBackoff();
    vi.advanceTimersByTime(2000);
    last()._open(); last()._close(); // back to 1s
    expect(rec.reconnecting).toEqual([1, 2, 1]);
  });

  it('recovers a handshake that never reaches OPEN (connect timeout)', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); // never _open
    vi.advanceTimersByTime(12_000); // connectTimeoutMs
    expect(rec.status).toContain('closed');
    expect(rec.reconnecting).toEqual([1]);
  });

  it('recycles a dead socket when no data arrives (watchdog)', () => {
    const { t, rec } = setup();
    t.connect('ws://x'); const dead = last(); dead._open();
    // Advance past deadAfterMs (150s) but stop before the reconnect fires (+1s),
    // so `dead` is still the current socket.
    vi.advanceTimersByTime(180_000);
    expect(rec.status).toContain('closed');
    expect(dead.sent).toContain('PING :ka\r\n'); // keepalive pinged before giving up
  });
});

describe('Transport — disconnect', () => {
  it('sends QUIT, closes, and does not auto-reconnect', () => {
    const { t } = setup();
    t.connect('ws://x'); last()._open();
    t.disconnect('bye');
    expect(last().sent).toContain('QUIT :bye\r\n');
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1); // no reconnect
  });
});
