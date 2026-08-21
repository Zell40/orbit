// The IRC registration handshake.
//
// Owns the connection sequencing: the CAP/SASL negotiation and the pre-registered
// exchange (NICK/USER, nick-in-use retry, RPL_WELCOME). Split out of client.ts so
// all the handshake ordering lives in one place. It drives the transport + IRCv3
// layer and writes its results (nick, registered) back to the client through a
// small host interface, so it can be unit-tested against a fake.
import type { ConnectOptions, ConnectionStatus, IrcMessage } from './types';
import type { Ircv3 } from './ircv3';
import { ScramClient } from './scram';

// SASL PLAIN payload is base64 of "\0<authzid>\0<passwd>", UTF-8. Also used to
// base64 the (ASCII) WebAuthn assertion JSON for the WEBAUTHN mechanism.
function b64utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Decode a base64 SASL payload (the server-first WEBAUTHN challenge) to raw bytes.
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// What the registration layer needs from the client. Kept as an interface (not a
// client reference) so the client's internals stay private and this is testable.
export interface RegistrationHost {
  send(line: string): void;
  setStatus(status: ConnectionStatus): void; // emit the 'status' event
  forward(msg: IrcMessage): void;            // re-emit a message (post-registration manual `cap ls`)
  abort(): void;                             // give up the connection (failed SASL) with no auto-reconnect
  readonly ircv3: Ircv3;
  opts(): ConnectOptions;
  getNick(): string;
  setNick(nick: string): void;
  isRegistered(): boolean;
  setRegistered(registered: boolean): void;
  resetBackoff(): void;   // transport: a healthy registration clears the backoff
  awayMessage(): string;  // for draft/pre-away, applied before CAP END
  // SASL WEBAUTHN: run a passkey ceremony over the server's challenge and resolve
  // to the assertion JSON (as the Django verifier expects). Rejects on cancel/error.
  getPasskeyAssertion(challenge: Uint8Array): Promise<string>;
}

export class Registration {
  private capEnded = false;
  private mech = 'PLAIN'; // the SASL mechanism chosen at CAP ACK (routes AUTHENTICATE)
  private scram: ScramClient | null = null; // live SCRAM exchange, when mech is SCRAM-SHA-256
  private scramFellBack = false;            // SCRAM failed → already retried with PLAIN (don't loop)
  private readonly host: RegistrationHost;
  constructor(host: RegistrationHost) { this.host = host; }

  // Socket just opened → send the registration burst (spec order: CAP LS, [PASS],
  // NICK, USER; CAP END follows once negotiation finishes). Resets the negotiated
  // caps + registration flags so a (re)connect starts clean.
  // When oauthBearer+refreshBearer and/or resolveRealname are set, finish those
  // first so USER carries a fresh JWT + GECOS (no post-connect SETNAME).
  start(): void {
    this.capEnded = false;
    this.mech = 'PLAIN';
    this.scram = null;
    this.scramFellBack = false;
    this.host.ircv3.reset();
    this.host.setRegistered(false);
    const o = this.host.opts();
    this.host.setNick(o.nick);
    const begin = () => {
      // webircgateway: HOST selects the upstream (ZNC vs ircd). Ignored unless
      // `[gateway] enabled = true`; swallowed, never forwarded to IRC.
      if (o.bouncerHost) this.host.send(`HOST ${o.bouncerHost}`);
      this.host.send(`CAP LS 302`);
      if (o.serverPassword) this.host.send(`PASS :${o.serverPassword}`);
      this.host.send(`NICK ${o.nick}`);
      this.host.send(`USER ${o.username || 'guest'} 0 * :${o.realname || o.nick}`);
    };
    const needsPrepare = !!(o.oauthBearer && o.refreshBearer) || !!o.resolveRealname;
    if (!needsPrepare) {
      begin();
      return;
    }
    void (async () => {
      if (o.oauthBearer && o.refreshBearer) {
        try {
          const token = await o.refreshBearer();
          if (token) o.password = token;
        } catch { /* keep existing password */ }
      }
      if (o.resolveRealname) {
        try {
          const rn = await o.resolveRealname();
          if (typeof rn === 'string' && rn.trim()) o.realname = rn.trim();
        } catch { /* keep existing realname */ }
      }
    })().finally(begin);
  }

  // Handle a registration-relevant line: CAP, AUTHENTICATE, the SASL result
  // numerics, nick-in-use, and RPL_WELCOME. The client routes these here.
  handle(msg: IrcMessage): void {
    switch (msg.command) {
      case 'CAP':
        this.handleCap(msg);
        return;
      case 'AUTHENTICATE':
        this.handleAuthenticate(msg);
        return;
      case '903': // SASL success
        this.endCap();
        return;
      case '904': // SASL failed
      case '905': // SASL message too long
      case '906': // SASL aborted
        // If SCRAM was rejected/aborted, retry once with PLAIN on the same
        // connection before giving up (the server may lack a verifier for this
        // account, or SCRAM hit a snag) — this is the graceful fallback.
        if (this.mech === 'SCRAM-SHA-256' && !this.scramFellBack && !!this.host.opts().password) {
          this.scramFellBack = true;
          this.mech = 'PLAIN';
          this.scram = null;
          this.host.send('AUTHENTICATE PLAIN');
          return;
        }
        // Authentication failed with no fallback left. Do NOT finish registration
        // as a guest — the member asked to log in. Abort the connection (no
        // auto-reconnect) so a wrong password/expired keycard surfaces as a failure
        // instead of silently landing them in an unauthenticated session.
        this.host.setStatus('sasl-failed');
        this.host.abort();
        return;
      case '907': // SASL already authenticated
        this.host.setStatus('sasl-failed');
        this.endCap();
        return;
      case '433': // ERR_NICKNAMEINUSE — auto-suffix while still registering
      case '432': // ERR_ERRONEUSNICKNAME
        if (!this.host.isRegistered()) {
          const nick = `${this.host.opts().nick}${Math.floor(Math.random() * 900 + 100)}`;
          this.host.setNick(nick);
          this.host.send(`NICK ${nick}`);
        }
        return;
      case '001': // RPL_WELCOME — we're registered
        this.host.setRegistered(true);
        this.host.resetBackoff(); // healthy connection — clear the backoff
        this.host.setNick(msg.params[0] ?? this.host.getNick());
        this.host.setStatus('registered');
        for (const ch of this.host.opts().channels ?? []) this.host.send(`JOIN ${ch}`);
        return;
    }
  }

  private handleCap(msg: IrcMessage): void {
    // The cap set + negotiation logic live in the IRCv3 layer; it returns the
    // action to take so the registration/SASL ordering stays here.
    const action = this.host.ircv3.handleCap(msg, {
      registered: this.host.isRegistered(),
      hasPassword: !!this.host.opts().password,
      wantPasskey: this.host.opts().passkey === true,
      wantScram: this.host.opts().scram === true,
      wantOauthBearer: this.host.opts().oauthBearer === true,
    });
    switch (action.do) {
      case 'req': this.host.send(`CAP REQ :${action.caps.join(' ')}`); break;
      case 'sasl':
        this.mech = action.mech;
        this.scram = action.mech === 'SCRAM-SHA-256' ? new ScramClient() : null;
        this.host.send(`AUTHENTICATE ${action.mech}`);
        break;
      case 'end': this.endCap(); break;
      case 'forward': this.host.forward(msg); break; // post-registration manual `cap ls`
      // 'none': nothing to do
    }
  }

  private handleAuthenticate(msg: IrcMessage): void {
    if (this.mech === 'WEBAUTHN') { this.handleWebauthn(msg); return; }
    if (this.mech === 'SCRAM-SHA-256') { this.handleScram(msg); return; }
    // PLAIN / OAUTHBEARER: the server sends a bare '+' when it's ready for client-first data.
    if (msg.params[0] !== '+') return;
    const o = this.host.opts();
    if (this.mech === 'OAUTHBEARER') {
      // RFC 7628: n,a=<authzid>,\x01auth=Bearer <token>\x01\x01
      const authzid = o.saslAuthzid || o.nick;
      const token = o.password ?? '';
      this.sendSaslData(b64utf8(`n,a=${authzid},\x01auth=Bearer ${token}\x01\x01`));
      return;
    }
    this.sendSaslData(b64utf8(`\0${o.nick}\0${o.password ?? ''}`));
  }

  // SCRAM-SHA-256 is a multi-step challenge-response (server '+' → client-first →
  // server-first → client-final → server-final → empty ack → 903). The password is
  // never sent; only a proof derived from it. Any snag (bad server message, wrong
  // password, no verifier) aborts with AUTHENTICATE * → the 906/904 handler retries
  // once with PLAIN. The crypto is async (Web Crypto), so client-final resolves later.
  private handleScram(msg: IrcMessage): void {
    const scram = this.scram;
    if (!scram) { this.host.send('AUTHENTICATE *'); return; }
    const payload = msg.params[0] ?? '';
    if (!scram.started) {
      // Server sent '+' (ready) → send client-first.
      this.sendSaslData(scram.clientFirst(this.host.opts().nick));
      return;
    }
    if (!scram.sentClientFinal) {
      // Server-first → derive and send client-final.
      scram.clientFinal(payload, this.host.opts().password ?? '')
        .then((data) => this.sendSaslData(data))
        .catch(() => this.host.send('AUTHENTICATE *')); // → 906 → PLAIN fallback
      return;
    }
    // Server-final → authenticate the server, then an empty message completes it.
    if (scram.verifyServerFinal(payload)) this.host.send('AUTHENTICATE +');
    else this.host.send('AUTHENTICATE *'); // server signature bad → abort → fallback
  }

  // WEBAUTHN is server-first: the ircd sends the challenge as a base64 AUTHENTICATE
  // payload (never '+'). Decode it, run the passkey ceremony, and send the assertion
  // JSON back (base64'd + chunked). On cancel/error, abort the exchange per the spec
  // (AUTHENTICATE *) so the server fails cleanly and registration falls through as a
  // guest — exactly like a wrong PLAIN password.
  private handleWebauthn(msg: IrcMessage): void {
    const payload = msg.params[0] ?? '';
    if (!payload || payload === '+') return; // no usable challenge yet
    let challenge: Uint8Array;
    try { challenge = b64ToBytes(payload); }
    catch { this.host.send('AUTHENTICATE *'); return; }
    this.host.getPasskeyAssertion(challenge)
      .then((json) => this.sendSaslData(b64utf8(json)))
      .catch(() => { this.host.setStatus('sasl-failed'); this.host.send('AUTHENTICATE *'); });
  }

  // Send a base64 SASL payload, chunked into 400-char pieces per the SASL spec (a
  // trailing empty '+' line marks the end when the last chunk is exactly full or the
  // payload is empty).
  private sendSaslData(payload: string): void {
    let rest = payload;
    if (rest.length === 0) this.host.send('AUTHENTICATE +');
    while (rest.length > 0) {
      const chunk = rest.slice(0, 400);
      this.host.send(`AUTHENTICATE ${chunk}`);
      rest = rest.slice(400);
      if (rest.length === 0 && chunk.length === 400) this.host.send('AUTHENTICATE +');
    }
  }

  private endCap(): void {
    if (this.capEnded) return;
    this.capEnded = true;
    // draft/pre-away: if we're (re)connecting while marked away, set it DURING
    // registration so we're away from the instant we're connected — before CAP END.
    if (this.host.awayMessage() && this.host.ircv3.hasCap('draft/pre-away'))
      this.host.send(`AWAY :${this.host.awayMessage()}`);
    this.host.send('CAP END');
  }
}
