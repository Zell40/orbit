// Tchatou IRC client — IRCv3-aware connection over WebSocket to server.
import { parseLine } from './parser';
import { casefold } from './casemap';
import { WANTED_CAPS } from './caps';
import { CTCP_REPLIES } from './ctcp';
import type { ConnectOptions, IrcMessage } from './types';


type Listener = (...args: unknown[]) => void;


function b64utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export class IrcClient {
  private ws?: WebSocket;
  private rxBuf = '';
  private subproto = '';
  private listeners: Record<string, Listener[]> = {};
  private opts!: ConnectOptions;

  private availableCaps = new Set<string>();
  private ackedCaps = new Set<string>();
  private capEnded = false;

  nick = '';
  private registered = false;
  isupport: Record<string, string> = {};
  prefixModes = '@+'; // prefix symbols, strongest first (from ISUPPORT PREFIX)
  prefixModeToChar: Record<string, string> = {}; // mode letter -> prefix symbol (o->@, v->+, …)
  chantypes = '#&';        // valid channel-name prefixes (ISUPPORT CHANTYPES)
  casemapping = 'rfc1459'; // ISUPPORT CASEMAPPING — how names are compared/folded
  multilineMaxLines = 20;  // draft/multiline cap limit (max-lines)
  vapid = '';              // ISUPPORT VAPID — server's Web Push public key (base64url P-256)
  network = '';            // ISUPPORT NETWORK (network name, for the UI)
  nicklen = 30;            // ISUPPORT NICKLEN
  channellen = 50;         // ISUPPORT CHANNELLEN
  topiclen = 390;          // ISUPPORT TOPICLEN
  serverName = '';         // RPL_MYINFO (004) — the ircd's own hostname
  serverVersion = '';      // RPL_MYINFO (004) — the ircd software/version string
  users = 0;               // RPL_GLOBALUSERS (266) / RPL_LUSERCLIENT (251) — users online

  // Fold a nick/channel to its canonical form per the server's CASEMAPPING.
  casefold(name: string): string { return casefold(name, this.casemapping); }

  on(event: string, fn: Listener): void {
    (this.listeners[event] ??= []).push(fn);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners[event] ?? []) fn(...args);
  }

  private wantConnected = false;       // true between connect() and disconnect()
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRx = 0;          // ms timestamp of the last inbound data
  private resumeHooked = false;

  // --- socket lifecycle tunables (named, not magic numbers) ---------------
  private readonly keepaliveMs = 45_000;    // send a PING this often to keep NAT/proxy state warm
  private readonly deadAfterMs = 150_000;   // no inbound data for this long ⇒ socket is dead, recycle it
  private readonly connectTimeoutMs = 12_000; // handshake stuck in CONNECTING this long ⇒ give up & retry
  private readonly maxBackoffMs = 30_000;   // ceiling for the reconnect backoff
  private readonly rxBufLimit = 1 << 18;    // 256 KiB: drop a runaway buffer (server that never sends \n)

  connect(opts: ConnectOptions): void {
    this.opts = opts;
    this.wantConnected = true;
    this.reconnectAttempts = 0;
    this.hookResume();
    this.openSocket();
  }

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
  private hookResume(): void {
    if (this.resumeHooked || typeof window === 'undefined') return;
    this.resumeHooked = true;
    const onResume = () => {
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
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => { if (!document.hidden) onResume(); });
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
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
        this.emit('status', 'closed');
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
    const opts = this.opts;
    this.nick = opts.nick;
    // Tear down any previous socket FIRST, so we never run two in parallel.
    // Mobile resume can fire onResume several times (focus + visibilitychange
    // + pageshow), and a zombie socket left over from a freeze will eventually
    // fire its own onclose. Detaching its handlers means that close can't spawn
    // yet another reconnect.
    this.teardown(this.ws);
    this.ws = undefined;
    this.clearConnectTimer();
    // Reset per-connection state so a reconnect starts clean.
    this.availableCaps.clear(); this.ackedCaps.clear(); this.capEnded = false;
    this.registered = false; this.rxBuf = ''; this.sendQueue = []; this.tokens = this.burst;
    this.lowQueue = []; if (this.lowTimer) { clearTimeout(this.lowTimer); this.lowTimer = null; }
    this.emit('status', 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(opts.url, ['text.ircv3.net', 'binary.ircv3.net']);
    } catch {
      // Bad URL / blocked scheme — treat as a failed attempt and back off.
      this.emit('status', 'error');
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    // Single, idempotent recovery path shared by close / error / connect-timeout.
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      this.clearConnectTimer();
      this.stopKeepalive();
      this.teardown(ws);
      if (this.ws === ws) this.ws = undefined;
      this.emit('status', 'closed');
      this.scheduleReconnect();
    };

    ws.onopen = () => {
      this.clearConnectTimer();
      this.subproto = ws.protocol;
      this.startKeepalive();
      // Spec registration order: CAP LS, [PASS], NICK, USER, …, CAP END.
      this.send(`CAP LS 302`);
      if (opts.serverPassword) this.send(`PASS :${opts.serverPassword}`);
      this.send(`NICK ${opts.nick}`);
      this.send(`USER ${opts.username || 'tchatou'} 0 * :${opts.realname || opts.nick}`);
    };
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string'
        ? ev.data
        : new TextDecoder().decode(ev.data as ArrayBuffer);
      this.feed(text);
    };
    ws.onclose = fail;
    ws.onerror = () => { this.emit('status', 'error'); fail(); };

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
    this.emit('reconnecting', Math.round(delay / 1000));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantConnected) this.openSocket();
    }, delay);
  }

  disconnect(reason = 'Au revoir'): void {
    this.wantConnected = false; // stop auto-reconnect
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
  private sendRaw(line: string): void {
    const ws = this.ws;
    if (ws?.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(line + '\r\n');
      this.emit('raw-out', line);
    } catch {
      /* socket died between the readyState check and send — onclose/onerror
         will run the recovery path; nothing to do here. */
    }
  }

  private drain(): void {
    const now = Date.now();
    const add = Math.floor((now - this.lastRefill) / this.refillMs);
    if (add > 0) { this.tokens = Math.min(this.burst, this.tokens + add); this.lastRefill += add * this.refillMs; }
    while (this.sendQueue.length && this.tokens > 0) { this.tokens--; this.sendRaw(this.sendQueue.shift()!); }
    if (this.sendQueue.length && !this.drainTimer) {
      this.drainTimer = setTimeout(() => { this.drainTimer = null; this.drain(); }, this.refillMs);
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
  private lowSend(line: string): void {
    if (!this.lowQueue.includes(line)) this.lowQueue.push(line);
    this.drainLow();
  }
  private drainLow(): void {
    if (this.lowTimer || !this.lowQueue.length) return;
    this.lowTimer = setTimeout(() => {
      this.lowTimer = null;
      if (!this.lowQueue.length) return;
      // Always let the user's own messages go first.
      if (this.sendQueue.length || this.tokens <= 0) { this.drainLow(); return; }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.sendRaw(this.lowQueue.shift()!);
      this.drainLow();
    }, 1400);
  }

  private feed(chunk: string): void {
    this.lastRx = Date.now();
    this.rxBuf += chunk;
    let idx: number;
    while ((idx = this.rxBuf.indexOf('\n')) !== -1) {
      let line = this.rxBuf.slice(0, idx);
      this.rxBuf = this.rxBuf.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line) this.handleLine(line);
    }
    // text.ircv3.net frames each IRC message separately, with no trailing
    // newline — flush the remainder as a complete line (binary mode keeps it
    // buffered, since that's a CRLF-delimited byte stream).
    if (this.rxBuf && this.subproto !== 'binary.ircv3.net') {
      const line = this.rxBuf.replace(/\r$/, '');
      this.rxBuf = '';
      if (line) this.handleLine(line);
    } else if (this.rxBuf.length > this.rxBufLimit) {
      // Binary mode, but a misbehaving server sent 256 KiB with no newline:
      // drop the runaway buffer rather than grow it without bound.
      this.rxBuf = '';
    }
  }

  private handleLine(line: string): void {
    const msg = parseLine(line);
    this.emit('raw-in', line);

    switch (msg.command) {
      case 'PING':
        this.sendRaw(`PONG :${msg.params[0] ?? ''}`); // never queue — avoids ping timeout under paste-flood
        return;
      case 'PRIVMSG':
        this.maybeAnswerCtcp(msg); // auto-reply to CTCP VERSION/PING/TIME/… then fall through
        break;
      case 'CAP':
        this.handleCap(msg);
        return;
      case 'AUTHENTICATE':
        this.handleAuthenticate(msg);
        return;
      case '903': // SASL success
      case '904': // SASL failed
      case '905':
      case '906':
      case '907':
        if (msg.command !== '903') this.emit('status', 'sasl-failed');
        this.endCap();
        return;
      case '433': // ERR_NICKNAMEINUSE — auto-suffix while still registering
      case '432': // ERR_ERRONEUSNICKNAME
        if (!this.registered) {
          this.nick = `${this.opts.nick}${Math.floor(Math.random() * 900 + 100)}`;
          this.send(`NICK ${this.nick}`);
        }
        return;
      case '005':
        this.handleISupport(msg);
        break;
      case '004': // RPL_MYINFO: <me> <servername> <version> <usermodes> <chanmodes> …
        this.serverName = msg.params[1] || this.serverName;
        this.serverVersion = msg.params[2] || this.serverVersion;
        break;
      case '002': { // RPL_YOURHOST fallback: "Your host is X, running version Y"
        if (!this.serverVersion) {
          const m = (msg.params[msg.params.length - 1] || '').match(/running version (\S+)/i);
          if (m) this.serverVersion = m[1];
        }
        break;
      }
      case '251': { // RPL_LUSERCLIENT: "There are N users and M invisible on K servers"
        const m = (msg.params[msg.params.length - 1] || '').match(/(\d+)\D+(\d+)\s+invisible/i);
        if (m && !this.users) this.users = parseInt(m[1], 10) + parseInt(m[2], 10);
        break;
      }
      case '266': { // RPL_GLOBALUSERS: explicit current global user count (more precise)
        const cur = parseInt(msg.params[1], 10);
        if (Number.isFinite(cur)) this.users = cur;
        break;
      }
      case '001':
        this.registered = true;
        this.reconnectAttempts = 0; // healthy connection — reset backoff
        this.nick = msg.params[0] ?? this.nick;
        this.emit('status', 'registered');
        for (const ch of this.opts.channels ?? []) this.join(ch);
        break;
    }
    this.emit('message', msg);
  }

  private handleCap(msg: IrcMessage): void {
    const sub = msg.params[1];
    if (sub === 'LS' || sub === 'NEW') {
      // CAP * LS * :cap1 cap2   (the '*' before ':' means more lines follow)
      const more = msg.params[2] === '*';
      const capStr = msg.params[more ? 3 : 2] ?? '';
      for (const tok of capStr.split(' ').filter(Boolean)) {
        const name = tok.split('=')[0];
        this.availableCaps.add(name);
        if (name === 'draft/multiline') {
          const m = tok.match(/max-lines=(\d+)/);
          if (m) this.multilineMaxLines = parseInt(m[1], 10) || this.multilineMaxLines;
        }
      }
      if (!more) {
        const req = WANTED_CAPS.filter((c) => this.availableCaps.has(c));
        // Work around servers that drop a capability from CAP LS at a line-split
        // boundary (server m_cap loses the overflowing cap). message-tags is the
        // usual victim, yet it's mandatory for msgid/labels/reactions and is implied
        // by server-time/echo-message/batch/etc. — so request it explicitly when any
        // tag-dependent cap IS advertised. The server still ACKs it.
        if (!req.includes('message-tags') &&
          ['server-time', 'echo-message', 'batch', 'account-tag', 'labeled-response', 'message-redaction'].some((c) => this.availableCaps.has(c))) {
          req.push('message-tags');
        }
        if (req.length) this.send(`CAP REQ :${req.join(' ')}`);
        else this.endCap();
      }
    } else if (sub === 'ACK') {
      for (const c of (msg.params[2] ?? '').split(' ').filter(Boolean)) {
        this.ackedCaps.add(c);
      }
      if (this.ackedCaps.has('sasl') && this.opts.password) {
        this.send('AUTHENTICATE PLAIN');
      } else {
        this.endCap();
      }
    } else if (sub === 'DEL') {
      // cap-notify: server withdrew capabilities — forget them.
      for (const c of (msg.params[2] ?? '').split(' ').filter(Boolean)) {
        this.availableCaps.delete(c);
        this.ackedCaps.delete(c);
      }
    } else if (sub === 'NAK') {
      this.endCap();
    }
  }

  // Answer a CTCP query (VERSION/PING/TIME/SOURCE/CLIENTINFO) with a NOTICE, per
  // the CTCP spec. ACTION is a normal message and is left for the UI to render.
  private maybeAnswerCtcp(msg: IrcMessage): void {
    const text = msg.params[1] ?? '';
    if (text[0] !== '\x01') return;
    const body = text.replace(/\x01/g, '');
    const sp = body.indexOf(' ');
    const cmd = (sp === -1 ? body : body.slice(0, sp)).toUpperCase();
    const arg = sp === -1 ? '' : body.slice(sp + 1);
    if (cmd === 'ACTION') return;
    const reply = CTCP_REPLIES[cmd];
    if (reply && msg.nick) this.send(`NOTICE ${msg.nick} :\x01${cmd} ${reply(arg)}\x01`);
  }

  private handleAuthenticate(msg: IrcMessage): void {
    if (msg.params[0] !== '+') return;
    const payload = b64utf8(`\0${this.opts.nick}\0${this.opts.password ?? ''}`);
    // chunk into 400-char pieces per the SASL spec
    let rest = payload;
    if (rest.length === 0) this.send('AUTHENTICATE +');
    while (rest.length > 0) {
      const chunk = rest.slice(0, 400);
      this.send(`AUTHENTICATE ${chunk}`);
      rest = rest.slice(400);
      if (rest.length === 0 && chunk.length === 400) this.send('AUTHENTICATE +');
    }
  }

  private endCap(): void {
    if (this.capEnded) return;
    this.capEnded = true;
    // draft/pre-away: if we're (re)connecting while marked away, set it DURING
    // registration so we're away from the instant we're connected — before CAP END.
    if (this.awayMessage && this.ackedCaps.has('draft/pre-away'))
      this.send(`AWAY :${this.awayMessage}`);
    this.send('CAP END');
  }

  private handleISupport(msg: IrcMessage): void {
    for (const tok of msg.params.slice(1, -1)) {
      const eq = tok.indexOf('=');
      if (eq === -1) this.isupport[tok] = '';
      else this.isupport[tok.slice(0, eq)] = tok.slice(eq + 1);
    }
    if (this.isupport['CHANTYPES']) this.chantypes = this.isupport['CHANTYPES'];
    if (this.isupport['CASEMAPPING']) this.casemapping = this.isupport['CASEMAPPING'];
    if (this.isupport['NETWORK']) this.network = this.isupport['NETWORK'];
    if (this.isupport['VAPID']) this.vapid = this.isupport['VAPID'];
    if (this.isupport['NICKLEN']) this.nicklen = parseInt(this.isupport['NICKLEN'], 10) || this.nicklen;
    if (this.isupport['CHANNELLEN']) this.channellen = parseInt(this.isupport['CHANNELLEN'], 10) || this.channellen;
    if (this.isupport['TOPICLEN']) this.topiclen = parseInt(this.isupport['TOPICLEN'], 10) || this.topiclen;
    const prefix = this.isupport['PREFIX']; // e.g. (qaohv)~&@%+
    if (prefix) {
      const close = prefix.indexOf(')');
      const modes = prefix.slice(1, close);     // mode letters, e.g. qaohv
      const chars = prefix.slice(close + 1);    // symbols,      e.g. ~&@%+
      this.prefixModes = chars;
      this.prefixModeToChar = {};
      for (let i = 0; i < modes.length && i < chars.length; i++) this.prefixModeToChar[modes[i]] = chars[i];
    }
  }

  hasCap(name: string): boolean { return this.ackedCaps.has(name); }

  // Snapshot of every capability Orbit wants, with its negotiated state — for the
  // Settings "IRCv3 capabilities" panel. `enabled` = the server ACK'd it and we're
  // using it; `available` = the server advertised it in CAP LS.
  listCaps(): { name: string; available: boolean; enabled: boolean }[] {
    return WANTED_CAPS.map((name) => ({
      name,
      available: this.availableCaps.has(name),
      enabled: this.ackedCaps.has(name),
    }));
  }

  // ---- line-length handling (the 512-byte IRC line limit) -----------------
  private enc = new TextEncoder();
  private byteLen(s: string): number { return this.enc.encode(s).length; }

  // Split `text` so each "<verb> <target> :<chunk>" line stays within 512 bytes
  // once the server prepends our ":nick!user@host " source. UTF-8-aware (never
  // splits a codepoint), breaks on \n and prefers word boundaries.
  private splitForLine(verb: string, target: string, text: string, extra = 0): string[] {
    const userlen = parseInt(this.isupport['USERLEN'] || '10', 10) || 10;
    const hostlen = parseInt(this.isupport['HOSTLEN'] || '64', 10) || 64;
    const source = this.nick.length + 1 + userlen + 1 + hostlen; // nick!user@host
    const overhead = 1 + source + 1 + verb.length + 1 + this.byteLen(target) + 2 + 2 + extra; // : src ' ' verb ' ' target ' :' crlf
    const max = Math.max(50, 512 - overhead);
    const out: string[] = [];
    for (const lineText of text.split(/\r?\n/)) {
      let cur = '', curBytes = 0;
      const flush = () => { out.push(cur); cur = ''; curBytes = 0; };
      for (const ch of lineText) { // iterates by code point
        const b = this.byteLen(ch);
        if (curBytes + b > max) {
          const sp = cur.lastIndexOf(' ');
          if (sp > max * 0.5) { out.push(cur.slice(0, sp)); cur = cur.slice(sp + 1); curBytes = this.byteLen(cur); }
          else flush();
        }
        cur += ch; curBytes += b;
      }
      flush(); // keep empty lines (a blank line in a paste is meaningful)
    }
    return out;
  }

  // ---- high-level senders -------------------------------------------------
  join(channel: string): void { this.send(`JOIN ${channel}`); }
  part(channel: string): void { this.send(`PART ${channel}`); }
  // draft/multiline batched sending: multi-line pastes go as one batch (recipients
  // see a single message). The server's m_ircv3_multiline now honours echo-message
  // (fixed), so the sender sees its own batch too.
  private useMultiline = true;
  // `context` = a channel name → attaches the +draft/channel-context client tag,
  // marking this DM as relating to that channel (IRCv3 client-tags/channel-context).
  privmsg(target: string, text: string, context?: string): void {
    const ctx = context ? `+draft/channel-context=${context}` : '';
    if (this.useMultiline && /\r?\n/.test(text) && this.hasCap('draft/multiline') && this.hasCap('batch')) {
      const lines = text.split(/\r?\n/);
      if (lines.length <= this.multilineMaxLines) { this.multilineMsg(target, lines, ctx); return; }
    }
    const pre = ctx ? `@${ctx} ` : '';
    for (const part of this.splitForLine('PRIVMSG', target, text)) this.send(`${pre}PRIVMSG ${target} :${part}`);
  }
  private batchSeq = 0;
  private multilineMsg(target: string, lines: string[], ctx = ''): void {
    // A multiline batch is ONE logical message — send it atomically (sendRaw),
    // so the per-line token bucket doesn't pace it. The server enforces the
    // draft/multiline size limits.
    const ref = `ml${++this.batchSeq}`;
    this.sendRaw(`BATCH +${ref} draft/multiline ${target}`);
    for (const line of lines) {
      const parts = this.splitForLine('PRIVMSG', target, line);
      // First wire-line of an input line is a new line; over-long splits continue it.
      parts.forEach((part, i) =>
        this.sendRaw(`@batch=${ref}${i ? ';draft/multiline-concat' : ''}${ctx ? ';' + ctx : ''} PRIVMSG ${target} :${part}`));
    }
    this.sendRaw(`BATCH -${ref}`);
  }
  // draft/reply — thread a message as a reply to another message's msgid.
  privmsgReply(target: string, text: string, replyTo: string, context?: string): void {
    const ctx = context ? `;+draft/channel-context=${context}` : '';
    const parts = this.splitForLine('PRIVMSG', target, text);
    // only the first line carries the reply (+ context) tags; continuations are plain.
    parts.forEach((part, i) =>
      this.send(i === 0 ? `@+draft/reply=${replyTo}${ctx} PRIVMSG ${target} :${part}` : `PRIVMSG ${target} :${part}`));
  }
  action(target: string, text: string): void {
    // Proper CTCP ACTION (\x01ACTION …\x01); reserve 9 bytes for the wrapper.
    for (const part of this.splitForLine('PRIVMSG', target, text, 9)) this.send(`PRIVMSG ${target} :ACTION ${part}`);
  }
  setNick(nick: string): void { this.send(`NICK ${nick}`); }
  // User modes (global, per-user). Query with no modestring → RPL_UMODEIS (221).
  queryUserModes(): void { this.send(`MODE ${this.nick}`); }
  setUserModes(modestring: string): void { this.send(`MODE ${this.nick} ${modestring}`); }
  setTopic(channel: string, topic: string): void { this.send(`TOPIC ${channel} :${topic}`); }
  kick(channel: string, nick: string, reason = ''): void { this.send(`KICK ${channel} ${nick}${reason ? ` :${reason}` : ''}`); }
  // Channel user-mode change, e.g. setUserMode('#x','o',true,'bob') → MODE #x +o bob.
  setUserMode(channel: string, mode: string, add: boolean, nick: string): void {
    this.send(`MODE ${channel} ${add ? '+' : '-'}${mode} ${nick}`);
  }
  ban(channel: string, mask: string): void { this.send(`MODE ${channel} +b ${mask}`); }
  unban(channel: string, mask: string): void { this.send(`MODE ${channel} -b ${mask}`); }
  // Toggle a no-parameter channel flag (+i/+m/+n/+t/+s…).
  setChannelMode(channel: string, mode: string, add: boolean): void {
    this.send(`MODE ${channel} ${add ? '+' : '-'}${mode}`);
  }
  // draft/account-registration: create + confirm a Swaygo/Tchatou account.
  register(account: string, email: string, password: string): void {
    this.send(`REGISTER ${account} ${email} :${password}`);
  }
  verify(account: string, code: string): void { this.send(`VERIFY ${account} ${code}`); }
  // draft/webpush: register/remove a Web Push subscription. <keys> is the
  // message-tag-format "p256dh=<b64url>;auth=<b64url>".
  webpushRegister(endpoint: string, keys: string): void { this.send(`WEBPUSH REGISTER ${endpoint} ${keys}`); }
  webpushUnregister(endpoint: string): void { this.send(`WEBPUSH UNREGISTER ${endpoint}`); }
  resend(account: string): void { this.send(`RESEND ${account}`); }
  list(): void { this.send('LIST'); }
  whois(nick: string): void { this.send(`WHOIS ${nick} ${nick}`); }
  whowas(nick: string): void { this.send(`WHOWAS ${nick}`); }
  invite(nick: string, channel: string): void { this.send(`INVITE ${nick} ${channel}`); }
  names(channel: string): void { this.send(`NAMES ${channel}`); }
  // draft/chathistory — load up to `limit` messages older than the given ISO time.
  chathistoryBefore(target: string, beforeIso: string, limit: number): void {
    this.send(`CHATHISTORY BEFORE ${target} timestamp=${beforeIso} ${limit}`);
  }
  // draft/chathistory — most recent `limit` items (messages + events w/ event-playback).
  // Low priority: prefetched on join for every channel, must not block typing.
  chathistoryLatest(target: string, limit: number): void {
    this.lowSend(`CHATHISTORY LATEST ${target} * ${limit}`);
  }
  // Remember the away message so draft/pre-away can re-apply it during the next
  // (re)connect's registration. '' = back (clears it).
  awayMessage = '';
  setAway(reason: string): void { this.awayMessage = reason; this.send(reason ? `AWAY :${reason}` : 'AWAY'); }
  // MONITOR (online-notify): + add, - remove, L list, C clear.
  monitor(op: '+' | '-' | 'L' | 'C', targets = ''): void {
    this.send(`MONITOR ${op}${targets ? ` ${targets}` : ''}`);
  }
  // Query a channel's ban/except/invex list (replies via 367/348/346).
  modeList(channel: string, mode: 'b' | 'e' | 'I'): void { this.send(`MODE ${channel} ${mode}`); }
  // WHOX: request token(t)/channel(c)/nick(n)/flags(f)/account(a) so we can map
  // members → their services account (for real avatars). Token 152 echoes back.
  who(target: string): void { this.send(`WHO ${target} %tcnfa,152`); }
  react(target: string, msgid: string, emoji: string): void {
    // draft/message-tags reaction via TAGMSG + draft/reply + react
    this.send(`@+draft/reply=${msgid};+draft/react=${emoji} TAGMSG ${target}`);
  }
  redact(target: string, msgid: string, reason = ''): void {
    this.send(`REDACT ${target} ${msgid}${reason ? ` :${reason}` : ''}`);
  }
  markRead(target: string, ts: string): void {
    this.send(`MARKREAD ${target} timestamp=${ts}`);
  }
  sendTyping(target: string, state: 'active' | 'done'): void {
    // +typing client-only tag, relayed to channel members via message-tags.
    this.send(`@+typing=${state} TAGMSG ${target}`);
  }
}
