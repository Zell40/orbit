// The IRC registration handshake.
//
// Owns the connection sequencing: the CAP/SASL negotiation and the pre-registered
// exchange (NICK/USER, nick-in-use retry, RPL_WELCOME). Split out of client.ts so
// all the handshake ordering lives in one place. It drives the transport + IRCv3
// layer and writes its results (nick, registered) back to the client through a
// small host interface, so it can be unit-tested against a fake.
import type { ConnectOptions, ConnectionStatus, IrcMessage } from './types';
import type { Ircv3 } from './ircv3';

// SASL PLAIN payload is base64 of "\0<authzid>\0<passwd>", UTF-8.
function b64utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// What the registration layer needs from the client. Kept as an interface (not a
// client reference) so the client's internals stay private and this is testable.
export interface RegistrationHost {
  send(line: string): void;
  setStatus(status: ConnectionStatus): void; // emit the 'status' event
  forward(msg: IrcMessage): void;            // re-emit a message (post-registration manual `cap ls`)
  readonly ircv3: Ircv3;
  opts(): ConnectOptions;
  getNick(): string;
  setNick(nick: string): void;
  isRegistered(): boolean;
  setRegistered(registered: boolean): void;
  resetBackoff(): void;   // transport: a healthy registration clears the backoff
  awayMessage(): string;  // for draft/pre-away, applied before CAP END
}

export class Registration {
  private capEnded = false;
  private readonly host: RegistrationHost;
  constructor(host: RegistrationHost) { this.host = host; }

  // Socket just opened → send the registration burst (spec order: CAP LS, [PASS],
  // NICK, USER; CAP END follows once negotiation finishes). Resets the negotiated
  // caps + registration flags so a (re)connect starts clean.
  start(): void {
    this.capEnded = false;
    this.host.ircv3.reset();
    this.host.setRegistered(false);
    const o = this.host.opts();
    this.host.setNick(o.nick);
    this.host.send(`CAP LS 302`);
    if (o.serverPassword) this.host.send(`PASS :${o.serverPassword}`);
    this.host.send(`NICK ${o.nick}`);
    this.host.send(`USER ${o.username || 'guest'} 0 * :${o.realname || o.nick}`);
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
      case '904': // SASL failed
      case '905':
      case '906':
      case '907':
        if (msg.command !== '903') this.host.setStatus('sasl-failed');
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
    });
    switch (action.do) {
      case 'req': this.host.send(`CAP REQ :${action.caps.join(' ')}`); break;
      case 'sasl': this.host.send('AUTHENTICATE PLAIN'); break;
      case 'end': this.endCap(); break;
      case 'forward': this.host.forward(msg); break; // post-registration manual `cap ls`
      // 'none': nothing to do
    }
  }

  private handleAuthenticate(msg: IrcMessage): void {
    if (msg.params[0] !== '+') return;
    const o = this.host.opts();
    const payload = b64utf8(`\0${o.nick}\0${o.password ?? ''}`);
    // chunk into 400-char pieces per the SASL spec
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
