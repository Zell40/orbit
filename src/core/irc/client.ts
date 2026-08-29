// Orbit IRC client — orchestrates the WebSocket transport, the IRCv3 capability
// layer, the registration handshake, and the high-level command senders.
import { parseLine, escapeTagValue } from './parser';
import { casefold } from './casemap';
import { Transport } from './transport';
import { Ircv3 } from './ircv3';
import { Registration } from './registration';
import { passkeyAssertion } from './webauthn';
import { ServerInfo } from './server-info';
import { Numerics } from './numerics';
import { CTCP_REPLIES } from './ctcp';
import type { ConnectOptions, IrcMessage, IrcClientEvents } from './types';


type AnyListener = (...args: unknown[]) => void;


export class IrcClient {
  // Storage is loose (all handlers are the same shape); the type safety lives on
  // the on()/emit() signatures below, keyed by the IrcClientEvents map.
  private listeners: Record<string, AnyListener[]> = {};
  private opts!: ConnectOptions;

  // Server descriptor (parsed ISUPPORT/MYINFO/LUSERS). Reached as `client.server`.
  readonly server = new ServerInfo();

  // Numeric-reply knowledge (RPL_*/ERR_* names + error classification) — a pure
  // protocol table with no connection state. Reached as `client.numerics`.
  readonly numerics = new Numerics();

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
    isupport: () => this.server.isupport,
  });

  // The registration handshake: CAP/SASL negotiation, NICK/USER, nick-in-use
  // retry, RPL_WELCOME. Drives the transport + IRCv3 layer and writes nick /
  // registered back here. Reached as `client.registration`.
  readonly registration = new Registration({
    send: (l) => this.send(l),
    setStatus: (s) => this.emit('status', s),
    forward: (m) => this.emit('message', m),
    abort: () => this.transport.disconnect('SASL authentication failed'),
    ircv3: this.ircv3,
    opts: () => this.opts,
    getNick: () => this.nick,
    setNick: (n) => { this.nick = n; },
    isRegistered: () => this.registered,
    setRegistered: (v) => { this.registered = v; },
    resetBackoff: () => this.transport.resetBackoff(),
    awayMessage: () => this.awayMessage,
    getPasskeyAssertion: (challenge) => passkeyAssertion(challenge),
  });

  nick = '';
  private registered = false;

  /** Remember GECOS for the next (re)registration USER line (EntreNous ASL). */
  setRealname(realname: string): void {
    if (!this.opts) return;
    this.opts.realname = realname.trim() || undefined;
  }

  // Fold a nick/channel to its canonical form per the server's CASEMAPPING.
  casefold(name: string): string { return casefold(name, this.server.casemapping); }

  on<K extends keyof IrcClientEvents>(event: K, fn: IrcClientEvents[K]): void {
    (this.listeners[event] ??= []).push(fn as AnyListener);
  }

  private emit<K extends keyof IrcClientEvents>(event: K, ...args: Parameters<IrcClientEvents[K]>): void {
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
    this.transport.connect(opts.url, {
      plain: !!(opts.serverPassword || opts.bouncerHost),
    });
  }

  disconnect(reason = 'Au revoir'): void {
    this.transport.disconnect(reason);
  }

  // Outbound writes go through the transport's flood-control queues.
  send(line: string): void { this.transport.send(line); }
  private sendRaw(line: string): void { this.transport.sendRaw(line); }
  private lowSend(line: string): void { this.transport.lowSend(line); }

  // Socket reached OPEN → run the registration handshake.
  private onOpen(): void {
    this.registration.start();
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
      case 'CAP':          // CAP negotiation
      case 'AUTHENTICATE': // SASL
      case '903': case '904': case '905': case '906': case '907': // SASL result
      case '433': case '432': // nick in use / erroneous — handshake retries while
        // unregistered; once connected, forward so the UI can show the failure.
        this.registration.handle(msg);
        if (!this.registered) return;
        break;
      case '005': this.server.applyISupport(msg); break; // RPL_ISUPPORT
      case '004': this.server.applyMyInfo(msg); break;   // RPL_MYINFO
      case '002': this.server.applyYourHost(msg); break; // RPL_YOURHOST (version fallback)
      case '251': this.server.applyLuserClient(msg); break; // RPL_LUSERCLIENT
      case '266': this.server.applyGlobalUsers(msg); break; // RPL_GLOBALUSERS
      case '001': // RPL_WELCOME — registration handles it, then it's forwarded on
        this.registration.handle(msg);
        break;
    }
    this.emit('message', msg);
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

  // ---- line-length handling (the 512-byte IRC line limit) -----------------
  private enc = new TextEncoder();
  private byteLen(s: string): number { return this.enc.encode(s).length; }

  // Split `text` so each "<verb> <target> :<chunk>" line stays within 512 bytes
  // once the server prepends our ":nick!user@host " source. UTF-8-aware (never
  // splits a codepoint), breaks on \n and prefers word boundaries.
  private splitForLine(verb: string, target: string, text: string, extra = 0): string[] {
    const userlen = parseInt(this.server.isupport['USERLEN'] || '10', 10) || 10;
    const hostlen = parseInt(this.server.isupport['HOSTLEN'] || '64', 10) || 64;
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
    // The channel-context client tag only propagates with message-tags; without the
    // cap a tagged PRIVMSG can 421 on a lean ircd (and the tag is dropped anyway).
    const ctx = context && this.ircv3.hasCap('message-tags') ? `+draft/channel-context=${context}` : '';
    if (this.useMultiline && /\r?\n/.test(text) && this.ircv3.hasCap('draft/multiline') && this.ircv3.hasCap('batch')) {
      const lines = text.split(/\r?\n/);
      if (lines.length <= this.ircv3.multilineMaxLines) { this.multilineMsg(target, lines, ctx); return; }
    }
    const pre = ctx ? `@${ctx} ` : '';
    for (const part of this.splitForLine('PRIVMSG', target, text)) this.send(`${pre}PRIVMSG ${target} :${part}`);
  }
  /** PRIVMSG with arbitrary client tags (needs message-tags). Falls back to plain msg. */
  privmsgTagged(target: string, text: string, tags: Record<string, string>): void {
    if (!this.ircv3.hasCap('message-tags') || !Object.keys(tags).length) {
      this.privmsg(target, text);
      return;
    }
    const tagStr = Object.entries(tags)
      .map(([k, v]) => (v === '' ? k : `${k}=${escapeTagValue(v)}`))
      .join(';');
    for (const part of this.splitForLine('PRIVMSG', target, text)) this.send(`@${tagStr} PRIVMSG ${target} :${part}`);
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
    // The reply itself is a client-only tag — without message-tags it can't
    // propagate (and may 421), so fall back to a plain message.
    if (!this.ircv3.hasCap('message-tags')) { this.privmsg(target, text, context); return; }
    const ctx = context ? `;+draft/channel-context=${context}` : '';
    const parts = this.splitForLine('PRIVMSG', target, text);
    // only the first line carries the reply (+ context) tags; continuations are plain.
    parts.forEach((part, i) =>
      this.send(i === 0 ? `@+draft/reply=${replyTo}${ctx} PRIVMSG ${target} :${part}` : `PRIVMSG ${target} :${part}`));
  }
  action(target: string, text: string): void {
    // Proper CTCP ACTION (\x01ACTION …\x01); reserve 9 bytes for the wrapper.
    // Without the \x01 delimiters other clients (mIRC, …) show a literal "ACTION"
    // in a normal line instead of rendering "* nick …".
    for (const part of this.splitForLine('PRIVMSG', target, text, 9)) this.send(`PRIVMSG ${target} :\x01ACTION ${part}\x01`);
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
  // Set/clear a channel mode that carries a parameter (key +k, limit +l). -k needs
  // the current key echoed back; -l takes none. Caller passes the param when needed.
  setChannelModeParam(channel: string, mode: string, add: boolean, param = ''): void {
    this.send(`MODE ${channel} ${add ? '+' : '-'}${mode}${param ? ` ${param}` : ''}`);
  }
  list(): void { this.send('LIST'); }
  whois(nick: string): void {
    if (!nick || nick.startsWith('$')) return; // local buffers ($server, $notice:…)
    this.send(`WHOIS ${nick} ${nick}`);
  }
  whowas(nick: string): void {
    if (!nick || nick.startsWith('$')) return;
    this.send(`WHOWAS ${nick}`);
  }
  invite(nick: string, channel: string): void { this.send(`INVITE ${nick} ${channel}`); }
  names(channel: string): void { this.send(`NAMES ${channel}`); }
  // Remember the away message so draft/pre-away can re-apply it during the next
  // (re)connect's registration. '' = back (clears it).
  awayMessage = '';
  setAway(reason: string): void { this.awayMessage = reason; this.send(reason ? `AWAY :${reason}` : 'AWAY'); }
  // Query a channel's ban/except/invex list (replies via 367/348/346).
  modeList(channel: string, mode: 'b' | 'e' | 'I'): void { this.send(`MODE ${channel} ${mode}`); }
  // WHOX: token(t)/channel(c)/nick(n)/flags(f)/account(a)/realname(r) so we can
  // map members → services account (avatars) and GECOS (EntreNous age/sexe/ville).
  // `r` must be last — it's the trailing parameter. Token 152 echoes back.
  who(target: string): void { this.send(`WHO ${target} %tcnfar,152`); }
}
