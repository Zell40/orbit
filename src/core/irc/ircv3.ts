// IRCv3 capability layer for the IRC client.
//
// Split out of client.ts so the transport (WebSocket, reconnect, send queues) and
// the core IRC verbs stay separate from the IRCv3 feature surface. This owns:
//   * capability negotiation (CAP LS/REQ/ACK/NAK/NEW/DEL) + the negotiated cap set,
//   * the cap-gated extended-feature commands (reactions, read markers, typing,
//     redaction, chathistory, account registration, web push, MONITOR).
//
// The client holds one instance and exposes it as `client.ircv3`; the rest of the
// app reaches every IRCv3 feature through that API rather than the raw socket.
import { WANTED_CAPS } from './caps';
import type { IrcMessage } from './types';

// The minimal slice of the client the IRCv3 layer needs. Kept as an interface
// (not a client reference) so the client's send queues stay private and this
// module can be unit-tested against a fake transport.
export interface Ircv3Transport {
  /** Throttled send (token bucket). */
  send(line: string): void;
  /** Low-priority background queue — history prefetch, must yield to live traffic. */
  lowSend(line: string): void;
  /** Live view of the parsed ISUPPORT (005) tokens. */
  isupport(): Record<string, string>;
}

/** Local Orbit buffers ($…) and ZNC module nicks (*status) are not ircd users. */
function skipIrcdTarget(target: string): boolean {
  return !target || target.startsWith('$') || target.startsWith('*');
}

// What the client should do in response to a CAP line. The negotiation *logic*
// lives here (pure + testable); the client performs the actual I/O so the
// registration/SASL ordering stays in one place.
export type CapAction =
  | { do: 'req'; caps: string[] } // send CAP REQ for these caps
  | { do: 'sasl'; mech: string }  // begin SASL with this mechanism (AUTHENTICATE <mech>)
  | { do: 'end' }                 // finish negotiation (CAP END)
  | { do: 'forward' }             // a post-registration manual `cap ls` → let the UI print it
  | { do: 'none' };               // nothing to do

export class Ircv3 {
  private available = new Set<string>();
  private acked = new Set<string>();
  /** SASL mechanisms the server offers, learned from CAP LS (`sasl=PLAIN,SCRAM-SHA-256,…`). */
  private saslMechs = new Set<string>();
  /** draft/multiline max-lines, learned from CAP LS (`draft/multiline=max-lines=N`). */
  multilineMaxLines = 20;
  private readonly tx: Ircv3Transport;

  constructor(tx: Ircv3Transport) { this.tx = tx; }

  /** Forget every negotiated cap — called when a socket (re)opens. */
  reset(): void {
    this.available.clear();
    this.acked.clear();
    this.saslMechs.clear();
    this.multilineMaxLines = 20;
  }

  /** True if the server advertised SASL mechanism `name` (e.g. 'WEBAUTHN') in CAP LS. */
  hasSaslMech(name: string): boolean { return this.saslMechs.has(name.toUpperCase()); }

  /** True once the server ACK'd `name` and we're using it. */
  hasCap(name: string): boolean { return this.acked.has(name); }
  /** True if the server advertised `name` in CAP LS (whether or not we requested it). */
  isAvailable(name: string): boolean { return this.available.has(name); }

  // Snapshot for the Settings "IRCv3 capabilities" panel. `enabled` = ACK'd and in
  // use; `available` = advertised in CAP LS.
  listCaps(): { name: string; available: boolean; enabled: boolean }[] {
    return WANTED_CAPS.map((name) => ({
      name,
      available: this.available.has(name),
      enabled: this.acked.has(name),
    }));
  }

  // Capability negotiation. Mutates the cap sets and returns the action the client
  // should perform next.
  handleCap(msg: IrcMessage, ctx: { registered: boolean; hasPassword: boolean; wantPasskey?: boolean; wantScram?: boolean; wantOauthBearer?: boolean }): CapAction {
    // The subcommand is case-insensitive and the server echoes back the exact case
    // the client sent (`cap ls` → `ls`), so normalise before matching.
    const sub = (msg.params[1] || '').toUpperCase();
    // A CAP LS / LIST arriving AFTER registration is a manual query the user typed
    // in the status window — forward it to the UI; don't re-run REQ/END.
    if (ctx.registered && (sub === 'LS' || sub === 'LIST')) return { do: 'forward' };

    if (sub === 'LS' || sub === 'NEW') {
      // CAP * LS * :cap1 cap2   (the '*' before the trailing arg means more follow)
      const more = msg.params[2] === '*';
      const capStr = msg.params[more ? 3 : 2] ?? '';
      for (const tok of capStr.split(' ').filter(Boolean)) {
        const eq = tok.indexOf('=');
        const name = eq >= 0 ? tok.slice(0, eq) : tok;
        this.available.add(name);
        if (name === 'sasl' && eq >= 0) {
          // sasl=PLAIN,SCRAM-SHA-256,WEBAUTHN — remember which mechanisms are on offer.
          for (const mech of tok.slice(eq + 1).split(',').filter(Boolean)) this.saslMechs.add(mech.toUpperCase());
        }
        if (name === 'draft/multiline') {
          const m = tok.match(/max-lines=(\d+)/);
          if (m) this.multilineMaxLines = parseInt(m[1], 10) || this.multilineMaxLines;
        }
      }
      if (more) return { do: 'none' };
      // A cap-notify CAP NEW that arrives AFTER we're online (e.g. a server rehash
      // re-advertising a cap): just track availability and pull in any genuinely
      // new feature cap. NEVER re-request `sasl` or send CAP END on a live session
      // — doing so re-authenticates with a one-time/expired credential (a keycard
      // token is single-use) which fails and aborts the connection.
      if (ctx.registered) {
        const fresh = WANTED_CAPS.filter((c) => c !== 'sasl' && this.available.has(c) && !this.acked.has(c));
        return fresh.length ? { do: 'req', caps: fresh } : { do: 'none' };
      }
      const req = WANTED_CAPS.filter((c) => this.available.has(c));
      // Work around servers that drop a capability from CAP LS at a line-split
      // boundary (some servers lose the overflowing cap). message-tags is the
      // usual victim, yet it's mandatory for msgid/labels/reactions and is implied
      // by server-time/echo-message/batch/etc. — so request it explicitly when any
      // tag-dependent cap IS advertised. The server still ACKs it.
      if (!req.includes('message-tags') &&
        ['server-time', 'echo-message', 'batch', 'account-tag', 'labeled-response', 'message-redaction'].some((c) => this.available.has(c))) {
        req.push('message-tags');
      }
      return req.length ? { do: 'req', caps: req } : { do: 'end' };
    }

    if (sub === 'ACK') {
      for (const c of (msg.params[2] ?? '').split(' ').filter(Boolean)) this.acked.add(c);
      // A post-registration ACK (pulling in a cap advertised via cap-notify after a
      // rehash) is bookkeeping only: never start SASL or send CAP END on an
      // already-online session.
      if (ctx.registered) return { do: 'none' };
      // SASL if the server ACK'd it: a WebAuthn passkey (when requested and offered)
      // takes precedence, else OAUTHBEARER for JWT/keycard handoffs, else SCRAM/PLAIN.
      if (this.acked.has('sasl')) {
        if (ctx.wantPasskey && this.saslMechs.has('WEBAUTHN')) return { do: 'sasl', mech: 'WEBAUTHN' };
        if (ctx.hasPassword) {
          if (ctx.wantOauthBearer && this.saslMechs.has('OAUTHBEARER')) return { do: 'sasl', mech: 'OAUTHBEARER' };
          // Prefer SCRAM-SHA-256 when requested + offered (the password stays off the
          // wire); the registration layer falls back to PLAIN if it fails.
          if (ctx.wantScram && this.saslMechs.has('SCRAM-SHA-256')) return { do: 'sasl', mech: 'SCRAM-SHA-256' };
          return { do: 'sasl', mech: 'PLAIN' };
        }
      }
      return { do: 'end' };
    }

    if (sub === 'DEL') { // cap-notify: server withdrew capabilities — forget them.
      for (const c of (msg.params[2] ?? '').split(' ').filter(Boolean)) {
        this.available.delete(c);
        this.acked.delete(c);
      }
      return { do: 'none' };
    }

    if (sub === 'NAK') return { do: 'end' };
    return { do: 'none' };
  }

  // ---- cap-gated extended-feature commands --------------------------------
  // Each guards on the negotiated cap/ISUPPORT: a leaner ircd rejects an
  // unsupported command as 421 "Unknown command", so we skip it entirely.

  // draft/chathistory — load up to `limit` messages older than the given ISO time.
  chathistoryBefore(target: string, beforeIso: string, limit: number): void {
    if (skipIrcdTarget(target)) return;
    this.tx.send(`CHATHISTORY BEFORE ${target} timestamp=${beforeIso} ${limit}`);
  }
  // draft/chathistory — most recent `limit` items (messages + events w/ event-playback).
  // Low priority: prefetched on join for every channel, must not block typing.
  chathistoryLatest(target: string, limit: number): void {
    if (skipIrcdTarget(target)) return;
    this.tx.lowSend(`CHATHISTORY LATEST ${target} * ${limit}`);
  }
  // draft/metadata-2 — subscribe to the account-profile keys the network publishes
  // so the server pushes them (live + on channel join) for every user we can see.
  subscribeMetadata(keys: string[]): void {
    if (!this.acked.has('draft/metadata-2') || !keys.length) return;
    this.tx.send(`METADATA * SUB ${keys.join(' ')}`);
  }
  // Pull one user's current profile metadata on demand (profile card open). GET
  // names the keys explicitly, so it works regardless of what we're subscribed to
  // (SUB only streams FUTURE changes); the reply fills the card in.
  fetchMetadata(target: string): void {
    if (!this.acked.has('draft/metadata-2') || skipIrcdTarget(target)) return;
    this.tx.send(`METADATA ${target} GET avatar bio pronouns timezone url`);
  }
  // MONITOR (online-notify): + add, - remove, L list, C clear.
  monitor(op: '+' | '-' | 'L' | 'C', targets = ''): void {
    if (this.tx.isupport()['MONITOR'] === undefined) return; // server doesn't advertise MONITOR
    this.tx.send(`MONITOR ${op}${targets ? ` ${targets}` : ''}`);
  }
  // Reaction rides on TAGMSG (message-tags); without the cap the server rejects it.
  react(target: string, msgid: string, emoji: string): void {
    if (!this.acked.has('message-tags') || skipIrcdTarget(target)) return;
    this.tx.send(`@+draft/reply=${msgid};+draft/react=${emoji} TAGMSG ${target}`);
  }
  redact(target: string, msgid: string, reason = ''): void {
    if (!this.acked.has('draft/message-redaction')) return;
    this.tx.send(`REDACT ${target} ${msgid}${reason ? ` :${reason}` : ''}`);
  }
  markRead(target: string, ts: string): void {
    if (!this.acked.has('draft/read-marker') || skipIrcdTarget(target)) return;
    this.tx.send(`MARKREAD ${target} timestamp=${ts}`);
  }
  sendTyping(target: string, state: 'active' | 'done'): void {
    if (!this.acked.has('message-tags') || skipIrcdTarget(target)) return;
    this.tx.send(`@+typing=${state} TAGMSG ${target}`);
  }
  // draft/account-registration: create + confirm a network account. Gated at
  // the UI (the register form only shows when the cap is present), so no guard here.
  register(account: string, email: string, password: string): void {
    this.tx.send(`REGISTER ${account} ${email} :${password}`);
  }
  verify(account: string, code: string): void { this.tx.send(`VERIFY ${account} ${code}`); }
  resend(account: string): void { this.tx.send(`RESEND ${account}`); }
  // draft/webpush: register/remove a Web Push subscription. Gated on the VAPID
  // ISUPPORT key (where the server advertises its Web Push public key) so a server
  // without Web Push never sees a 421. <keys> is "p256dh=<b64url>;auth=<b64url>".
  webpushRegister(endpoint: string, keys: string): void {
    if (this.tx.isupport()['VAPID'] === undefined) return;
    this.tx.send(`WEBPUSH REGISTER ${endpoint} ${keys}`);
  }
  webpushUnregister(endpoint: string): void {
    if (this.tx.isupport()['VAPID'] === undefined) return;
    this.tx.send(`WEBPUSH UNREGISTER ${endpoint}`);
  }
}
