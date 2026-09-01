import { setStayAwake } from '@/platform/wake-lock';

// WebSocket transport for the IRC client.
//
// Owns everything socket-level and nothing protocol-level: the connection
// lifecycle (connect, the jittered auto-reconnect, the keepalive + dead-socket
// watchdog, mobile-resume), inbound line framing, and outbound flood control
// (a token bucket plus a low-priority background queue for history prefetch).
// CAP, SASL, numerics and commands all live above this — the transport just
// moves bytes and calls back through TransportHooks, so the socket, timers and
// queues stay private and this is testable on its own.

/** Kiwi/webircgateway path — raw IRC over WS, no IRCv3 subprotocols. */
export function isWebircGateway(url: string): boolean {
  try { return /\/webirc\//i.test(new URL(url).pathname); }
  catch { return /\/webirc\//i.test(url); }
}

function likelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return true;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export interface TransportHooks {
  /** Socket reached OPEN — the client should send its registration burst. */
  onOpen(): void;
  /** One inbound line (one IRC message, the trailing CRLF already stripped). */
  onLine(line: string): void;
  /** Connection state changed — drives the UI's connecting/closed/error banner. */
  onStatus(status: 'connecting' | 'closed' | 'error'): void;
  /** Auto-reconnect scheduled — seconds until the next attempt. */
  onReconnecting(seconds: number): void;
  /** A line was written to the wire (for the raw/console view). */
  onRawOut(line: string): void;
}

export class Transport {
  private ws?: WebSocket;
  private rxBuf = '';
  private subproto = '';
  private url = '';
  private readonly hooks: TransportHooks;

  private wantConnected = false;       // true between connect() and disconnect()
  private reconnectAttempts = 0;
  // Kiwi/ZNC WebSocket gateways often reject the IRCv3 subprotocols. We try them
  // first, then immediately retry the same attempt without any subprotocol. Once a
  // plain socket has opened, later reconnects skip the doomed IRCv3 handshake.
  private preferPlain = false;
  private skipProtosThisOpen = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRx = 0;          // ms timestamp of the last inbound data
  private resumeHooked = false;

  // --- socket lifecycle tunables (named, not magic numbers) ---------------
  private keepaliveMs = 45_000;         // send a PING this often to keep NAT/proxy state warm
  private readonly deadAfterMs = 150_000;   // no inbound data for this long ⇒ socket is dead, recycle it
  private readonly connectTimeoutMs = 12_000; // handshake stuck in CONNECTING this long ⇒ give up & retry
  private readonly maxBackoffMs = 30_000;   // ceiling for the reconnect backoff
  private readonly rxBufLimit = 1 << 18;    // 256 KiB: drop a runaway buffer (server that never sends \n)

  constructor(hooks: TransportHooks) { this.hooks = hooks; }

  /** True when the socket is open and writable. */
  get isOpen(): boolean { return this.ws?.readyState === WebSocket.OPEN; }

  connect(url: string, opts?: { plain?: boolean }): void {
    this.url = url;
    this.wantConnected = true;
    this.reconnectAttempts = 0;
    // Kiwi webircgateway (golang.org/x/net/websocket) returns HTTP 400 if the
    // client offers more than one Sec-WebSocket-Protocol — Firefox sends both
    // IRCv3 names. Skip them on /webirc/ (and when the caller asks for plain).
    this.preferPlain = !!opts?.plain || isWebircGateway(url);
    this.skipProtosThisOpen = false;
    this.keepaliveMs = likelyMobile() ? 22_000 : 45_000;
    this.hookResume();
    this.openSocket();
  }

  disconnect(reason = 'Au revoir'): void {
    this.wantConnected = false; // stop auto-reconnect
    setStayAwake(false);
    this.unhookResume();
    this.stopKeepalive();
    this.clearConnectTimer();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      this.sendRaw(`QUIT :${reason}`); // send now, before we close the socket
    }
    // Close (and detach) regardless of state — a CONNECTING socket would
    // otherwise leak and fire its handlers after we meant to quit.
    this.teardown(ws);
    this.ws = undefined;
  }

  /** A healthy registration (001) — clear the reconnect backoff. */
  resetBackoff(): void { this.reconnectAttempts = 0; }

  // Detach a socket's handlers and close it. Idempotent and safe on any
  // readyState — used everywhere a socket must stop influencing us (replace
  // on reconnect, intentional disconnect, stuck-handshake timeout).
  private teardown(ws?: WebSocket): void {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch { /* already closing/closed */ }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
  }

  // Mobile browsers FREEZE a backgrounded tab's JS, so the client can't answer
  // the server's PING and gets timed out (~pingfreq later). When the tab wakes
  // (visible / network back / focus), check the link at once and reconnect
  // immediately instead of waiting on the exponential backoff.
  private onResume = (): void => {
    if (!this.wantConnected) return;
    const rs = this.ws?.readyState;
    if (rs === WebSocket.OPEN) {
      // Socket looks open but may be a zombie after a freeze — probe it; the
      // keepalive watchdog will recycle it if no data comes back.
      this.sendRaw('PING :ka');
    } else if (rs !== WebSocket.CONNECTING) {
      // Closed/closing (or none) — try now instead of waiting on backoff.
      this.reconnectNow();
    }
  };
  private onVisible = (): void => { if (!document.hidden) this.onResume(); };
  private hookResume(): void {
    if (this.resumeHooked || typeof window === 'undefined') return;
    this.resumeHooked = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisible);
      document.addEventListener('resume', this.onResume);
    }
    window.addEventListener('online', this.onResume);
    window.addEventListener('focus', this.onResume);
    window.addEventListener('pageshow', this.onResume);
  }
  // Detach the resume listeners so a disconnected client can be GC'd (the closures
  // otherwise pin it, and every leaked client would keep listening for app life).
  private unhookResume(): void {
    if (!this.resumeHooked || typeof window === 'undefined') return;
    this.resumeHooked = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisible);
      document.removeEventListener('resume', this.onResume);
    }
    window.removeEventListener('online', this.onResume);
    window.removeEventListener('focus', this.onResume);
    window.removeEventListener('pageshow', this.onResume);
  }

  // Reconnect right now (bring any pending backoff forward), e.g. on resume.
  private reconnectNow(): void {
    if (!this.wantConnected) return;
    // Already up, or mid-handshake? Leave it — don't stack a second socket.
    const rs = this.ws?.readyState;
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;
    // Cancel the pending backoff timer and open immediately. NOTE: we do NOT
    // reset reconnectAttempts here — resume events fire in bursts on flaky
    // mobile links, and zeroing the backoff each time would hammer the server
    // with 1-second retries. A successful registration (001) resets it.
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.openSocket();
  }

  // Periodic keepalive + dead-connection watchdog. A PING every `keepaliveMs`
  // keeps NAT/proxy state warm and elicits a PONG; if no inbound data arrives
  // for `deadAfterMs` (server pings every ~2 min) the socket is dead → recycle.
  private startKeepalive(): void {
    this.stopKeepalive();
    this.lastRx = Date.now();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastRx > this.deadAfterMs) {
        this.teardown(this.ws); // detached close ⇒ recover via the explicit path below
        this.ws = undefined;
        this.stopKeepalive();
        this.hooks.onStatus('closed');
        this.scheduleReconnect();
        return;
      }
      this.sendRaw('PING :ka');
    }, this.keepaliveMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
  }

  private openSocket(): void {
    // Tear down any previous socket FIRST, so we never run two in parallel.
    // Mobile resume can fire onResume several times (focus + visibilitychange
    // + pageshow), and a zombie socket left over from a freeze will eventually
    // fire its own onclose. Detaching its handlers means that close can't spawn
    // yet another reconnect.
    this.teardown(this.ws);
    this.ws = undefined;
    this.clearConnectTimer();
    // Reset per-connection transport state so a reconnect starts clean.
    this.rxBuf = ''; this.sendQueue = []; this.tokens = this.burst;
    this.lowQueue = []; if (this.lowTimer) { clearTimeout(this.lowTimer); this.lowTimer = null; }
    this.hooks.onStatus('connecting');

    const useProtos = !this.preferPlain && !this.skipProtosThisOpen;
    let ws: WebSocket;
    try {
      ws = useProtos
        ? new WebSocket(this.url, ['text.ircv3.net', 'binary.ircv3.net'])
        : new WebSocket(this.url);
    } catch {
      // Bad URL / blocked scheme — treat as a failed attempt and back off.
      this.hooks.onStatus('error');
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    // Single, idempotent recovery path shared by close / error / connect-timeout.
    let settled = false;
    let opened = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      this.clearConnectTimer();
      this.stopKeepalive();
      this.teardown(ws);
      if (this.ws === ws) this.ws = undefined;
      // Handshake never reached OPEN with IRCv3 subprotocols → retry this attempt
      // once as a plain WebSocket (no backoff, no 'closed' flash).
      if (this.wantConnected && !opened && useProtos) {
        this.skipProtosThisOpen = true;
        this.openSocket();
        return;
      }
      this.skipProtosThisOpen = false;
      this.hooks.onStatus('closed');
      this.scheduleReconnect();
    };

    ws.onopen = () => {
      this.clearConnectTimer();
      this.subproto = ws.protocol;
      opened = true;
      this.skipProtosThisOpen = false;
      if (!useProtos) this.preferPlain = true;
      this.startKeepalive();
      setStayAwake(true);
      this.hooks.onOpen(); // the client sends its registration burst
    };
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string'
        ? ev.data
        : new TextDecoder().decode(ev.data as ArrayBuffer);
      this.feed(text);
    };
    ws.onclose = fail;
    ws.onerror = () => {
      // Don't flash an error if we're about to retry without IRCv3 subprotocols.
      if (!(this.wantConnected && !opened && useProtos)) this.hooks.onStatus('error');
      fail();
    };

    // Captive portals / dead proxies can leave the handshake hanging in
    // CONNECTING forever — onopen/onclose never fire, so nothing recovers.
    // Force-recover if we don't reach OPEN within connectTimeoutMs.
    this.connectTimer = setTimeout(() => {
      if (this.ws === ws && ws.readyState === WebSocket.CONNECTING) fail();
    }, this.connectTimeoutMs);
  }

  // Auto-reconnect with jittered exponential backoff (≈1s → 30s), unless we
  // quit on purpose. Jitter prevents a thundering herd of clients all
  // reconnecting in lockstep after a server restart.
  private scheduleReconnect(): void {
    if (!this.wantConnected || this.reconnectTimer) return;
    const base = Math.min(this.maxBackoffMs, 1000 * 2 ** this.reconnectAttempts);
    const delay = Math.round(base * (0.75 + Math.random() * 0.5)); // ±25% jitter
    this.reconnectAttempts++;
    this.hooks.onReconnecting(Math.round(delay / 1000));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantConnected) this.openSocket();
    }, delay);
  }

  // ---- outbound flood protection (token bucket) ---------------------------
  // Servers kill clients for "Excess Flood". We allow a generous burst (so
  // registration + normal chatting are instant) then pace the rest at ~1/sec,
  // which keeps a big multi-line paste under typical server limits.
  private sendQueue: string[] = [];
  private tokens = 8;
  private readonly burst = 8;
  private readonly refillMs = 1000;
  private lastRefill = Date.now();
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  // Raw, un-throttled write (CRLF-terminated). For latency-critical lines only.
  sendRaw(line: string): void {
    const ws = this.ws;
    if (ws?.readyState !== WebSocket.OPEN) return;
    // Strip CR/LF/NUL so a newline in any argument (nick, topic, a raw console
    // line, …) can't smuggle a second protocol command onto the wire. Single
    // choke-point: every outbound write passes through here.
    const safe = line.replace(/[\r\n\0]/g, '');
    try {
      ws.send(safe + '\r\n');
      this.hooks.onRawOut(safe);
    } catch {
      /* socket died between the readyState check and send — onclose/onerror
         will run the recovery path; nothing to do here. */
    }
  }

  private drain(): void {
    this.refillTokens();
    while (this.sendQueue.length && this.tokens > 0) { this.tokens--; this.sendRaw(this.sendQueue.shift()!); }
    if (this.sendQueue.length && !this.drainTimer) {
      this.drainTimer = setTimeout(() => { this.drainTimer = null; this.drain(); }, this.refillMs);
    }
  }

  private refillTokens(): void {
    const now = Date.now();
    const add = Math.floor((now - this.lastRefill) / this.refillMs);
    if (add > 0) {
      this.tokens = Math.min(this.burst, this.tokens + add);
      this.lastRefill += add * this.refillMs;
    }
  }

  // Throttled send — queues behind the token bucket. CRLF added on the wire.
  send(line: string): void {
    this.sendQueue.push(line);
    this.drain();
  }

  // ---- low-priority background queue (history prefetch) -------------------
  // On (re)connect the client rejoins every channel; firing a CHATHISTORY per
  // channel through the normal queue would starve the user's own typing. This
  // queue drains ONE item at a time, slowly, and always yields to live traffic.
  private lowQueue: string[] = [];
  private lowTimer: ReturnType<typeof setTimeout> | null = null;
  lowSend(line: string): void {
    if (!this.lowQueue.includes(line)) this.lowQueue.push(line);
    this.drainLow();
  }
  private drainLow(): void {
    if (this.lowTimer || !this.lowQueue.length) return;
    this.pumpLow(400);
  }
  private pumpLow(delay: number): void {
    this.lowTimer = setTimeout(() => {
      this.lowTimer = null;
      if (!this.lowQueue.length) return;
      this.refillTokens();
      if (this.sendQueue.length) { this.drain(); this.pumpLow(400); return; }
      if (this.tokens <= 0) { this.pumpLow(this.refillMs); return; }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.tokens--;
        this.sendRaw(this.lowQueue.shift()!);
      }
      if (this.lowQueue.length) this.pumpLow(400);
    }, delay);
  }

  private feed(chunk: string): void {
    this.lastRx = Date.now();
    this.rxBuf += chunk;
    let idx: number;
    while ((idx = this.rxBuf.indexOf('\n')) !== -1) {
      let line = this.rxBuf.slice(0, idx);
      this.rxBuf = this.rxBuf.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line) this.hooks.onLine(line);
    }
    // text.ircv3.net frames each IRC message separately, with no trailing
    // newline — flush the remainder as a complete line (binary mode keeps it
    // buffered, since that's a CRLF-delimited byte stream).
    if (this.rxBuf && this.subproto !== 'binary.ircv3.net') {
      const line = this.rxBuf.replace(/\r$/, '');
      this.rxBuf = '';
      if (line) this.hooks.onLine(line);
    } else if (this.rxBuf.length > this.rxBufLimit) {
      // Binary mode, but a misbehaving server sent 256 KiB with no newline:
      // drop the runaway buffer rather than grow it without bound.
      this.rxBuf = '';
    }
  }
}
