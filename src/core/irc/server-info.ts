// Server descriptor — everything the server tells us about itself: the parsed
// ISUPPORT (005) tokens plus the derived limits/prefixes, RPL_MYINFO (004), and
// the LUSERS user counts. Split out of client.ts so the parsing is a testable
// unit and the client stays a pure orchestrator. Reached as `client.server`.
import type { IrcMessage } from './types';

export class ServerInfo {
  isupport: Record<string, string> = {};         // raw 005 tokens (KEY -> value, or '')
  prefixModes = '@+';                             // prefix symbols, strongest first (ISUPPORT PREFIX)
  prefixModeToChar: Record<string, string> = {};  // mode letter -> prefix symbol (o->@, v->+, …)
  chantypes = '#&';                               // valid channel-name prefixes (ISUPPORT CHANTYPES)
  casemapping = 'rfc1459';                        // how names are compared/folded (ISUPPORT CASEMAPPING)
  vapid = '';                                     // Web Push public key, base64url P-256 (ISUPPORT VAPID)
  network = '';                                   // network name (ISUPPORT NETWORK)
  nicklen = 30;                                   // ISUPPORT NICKLEN
  channellen = 50;                                // ISUPPORT CHANNELLEN
  topiclen = 390;                                 // ISUPPORT TOPICLEN
  serverName = '';                                // RPL_MYINFO (004) — the ircd's own hostname
  serverVersion = '';                             // RPL_MYINFO (004) / RPL_YOURHOST (002) — the ircd version
  users = 0;                                      // RPL_GLOBALUSERS (266) / RPL_LUSERCLIENT (251)

  // RPL_ISUPPORT (005): merge the advertised tokens, then refresh the derived
  // limits and the prefix map.
  applyISupport(msg: IrcMessage): void {
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

  // RPL_MYINFO (004): <me> <servername> <version> <usermodes> <chanmodes> …
  applyMyInfo(msg: IrcMessage): void {
    this.serverName = msg.params[1] || this.serverName;
    this.serverVersion = msg.params[2] || this.serverVersion;
  }

  // RPL_YOURHOST (002) fallback: "Your host is X, running version Y".
  applyYourHost(msg: IrcMessage): void {
    if (this.serverVersion) return;
    const m = (msg.params[msg.params.length - 1] || '').match(/running version (\S+)/i);
    if (m) this.serverVersion = m[1];
  }

  // RPL_LUSERCLIENT (251): "There are N users and M invisible on K servers".
  applyLuserClient(msg: IrcMessage): void {
    const m = (msg.params[msg.params.length - 1] || '').match(/(\d+)\D+(\d+)\s+invisible/i);
    if (m && !this.users) this.users = parseInt(m[1], 10) + parseInt(m[2], 10);
  }

  // RPL_GLOBALUSERS (266): explicit current global user count (more precise).
  applyGlobalUsers(msg: IrcMessage): void {
    const cur = parseInt(msg.params[1], 10);
    if (Number.isFinite(cur)) this.users = cur;
  }
}
