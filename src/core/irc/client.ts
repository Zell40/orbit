// Tchatou IRC client — orchestrates the WebSocket transport, the IRCv3 capability
// layer, the registration handshake, and the high-level command senders.
import { parseLine } from './parser';
import { casefold } from './casemap';
import { Transport } from './transport';
import { Ircv3 } from './ircv3';
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
  private listeners: Record<string, Listener[]> = {};
  private opts!: ConnectOptions;

  // WebSocket transport: the socket lifecycle (connect, reconnect, keepalive,
  // mobile resume), inbound line framing, and the outbound flood-control queues.
  // It calls back through these hooks; the socket + timers + queues stay private
  // to it. Reached as `client.transport`.
  readonly transport = new Transport({
    onOpen: () => this.onOpen(),
    onLine: (l) => this.onLine(l),
    onStatus: (s) => this.emit('status', s),
    onReconnecting: (n) => this.emit('reconnecting', n),
    onRawOut: (l) => this.emit('raw-out', l),
  });

  // The IRCv3 capability layer: negotiation, the negotiated cap set, and every
  // cap-gated extended-feature command. Reached as `client.ircv3`.
  readonly ircv3 = new Ircv3({
    send: (l) => this.send(l),
    lowSend: (l) => this.lowSend(l),
    isupport: () => this.isupport,
  });
  private capEnded = false;

  nick = '';
  private registered = false;
  isupport: Record<string, string> = {};
  prefixModes = '@+'; // prefix symbols, strongest first (from ISUPPORT PREFIX)
  prefixModeToChar: Record<string, string> = {}; // mode letter -> prefix symbol (o->@, v->+, …)
  chantypes = '#&';        // valid channel-name prefixes (ISUPPORT CHANTYPES)
  casemapping = 'rfc1459'; // ISUPPORT CASEMAPPING — how names are compared/folded
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
    // A throwing listener (e.g. the message handler hitting an unexpected server
    // line, or a buggy plugin) must not escape into the WebSocket callback and
    // kill the receive loop. Isolate each listener; log and carry on.
    for (const fn of this.listeners[event] ?? []) {
      try { fn(...args); }
      catch (e) { console.error(`[irc] listener for '${event}' threw`, e); }
    }
  }

  connect(opts: ConnectOptions): void {
    this.opts = opts;
    this.transport.connect(opts.url);
  }

  disconnect(reason = 'Au revoir'): void {
    this.transport.disconnect(reason);
  }

  // Outbound writes go through the transport's flood-control queues.
  send(line: string): void { this.transport.send(line); }
  private sendRaw(line: string): void { this.transport.sendRaw(line); }
  private lowSend(line: string): void { this.transport.lowSend(line); }

  // ---- registration handshake --------------------------------------------
  // Socket reached OPEN → (re)start registration. Clear the negotiated caps and
  // registration flags for a clean (re)connect, then send the handshake burst in
  // spec order (CAP LS, [PASS], NICK, USER, …, CAP END once negotiated).
  private onOpen(): void {
    this.ircv3.reset();
    this.capEnded = false;
    this.registered = false;
    this.nick = this.opts.nick;
    this.send(`CAP LS 302`);
    if (this.opts.serverPassword) this.send(`PASS :${this.opts.serverPassword}`);
    this.send(`NICK ${this.opts.nick}`);
    this.send(`USER ${this.opts.username || 'guest'} 0 * :${this.opts.realname || this.opts.nick}`);
  }

  private onLine(line: string): void {
    // Real IRC lines are ≤512 bytes on the wire (a few KiB with message-tags).
    // Drop pathological oversized input rather than parse and format it.
    if (line.length > 16384) return;
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
        this.transport.resetBackoff(); // healthy connection — clear the backoff
        this.nick = msg.params[0] ?? this.nick;
        this.emit('status', 'registered');
        for (const ch of this.opts.channels ?? []) this.join(ch);
        break;
    }
    this.emit('message', msg);
  }

  private handleCap(msg: IrcMessage): void {
    // Negotiation logic + the cap set live in the IRCv3 layer; it returns the
    // action to take so the registration/SASL ordering stays here.
    const action = this.ircv3.handleCap(msg, {
      registered: this.registered,
      hasPassword: !!this.opts.password,
    });
    switch (action.do) {
      case 'req': this.send(`CAP REQ :${action.caps.join(' ')}`); break;
      case 'sasl': this.send('AUTHENTICATE PLAIN'); break;
      case 'end': this.endCap(); break;
      case 'forward': this.emit('message', msg); break; // post-registration manual `cap ls`
      // 'none': nothing to do
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
    if (this.awayMessage && this.ircv3.hasCap('draft/pre-away'))
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
    if (this.useMultiline && /\r?\n/.test(text) && this.ircv3.hasCap('draft/multiline') && this.ircv3.hasCap('batch')) {
      const lines = text.split(/\r?\n/);
      if (lines.length <= this.ircv3.multilineMaxLines) { this.multilineMsg(target, lines, ctx); return; }
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
    for (const part of this.splitForLine('PRIVMSG', target, text, 9)) this.send(`PRIVMSG ${target} :ACTION ${part}`);
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
  list(): void { this.send('LIST'); }
  whois(nick: string): void { this.send(`WHOIS ${nick} ${nick}`); }
  whowas(nick: string): void { this.send(`WHOWAS ${nick}`); }
  invite(nick: string, channel: string): void { this.send(`INVITE ${nick} ${channel}`); }
  names(channel: string): void { this.send(`NAMES ${channel}`); }
  // Remember the away message so draft/pre-away can re-apply it during the next
  // (re)connect's registration. '' = back (clears it).
  awayMessage = '';
  setAway(reason: string): void { this.awayMessage = reason; this.send(reason ? `AWAY :${reason}` : 'AWAY'); }
  // Query a channel's ban/except/invex list (replies via 367/348/346).
  modeList(channel: string, mode: 'b' | 'e' | 'I'): void { this.send(`MODE ${channel} ${mode}`); }
  // WHOX: request token(t)/channel(c)/nick(n)/flags(f)/account(a) so we can map
  // members → their services account (for real avatars). Token 152 echoes back.
  who(target: string): void { this.send(`WHO ${target} %tcnfa,152`); }
}
