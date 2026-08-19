// IRC / IRCv3 shared types for the Orbit client.

export interface IrcMessage {
  raw: string;
  tags: Record<string, string>;
  prefix: string;
  nick: string;
  user: string;
  host: string;
  command: string;
  params: string[];
}

export type MessageKind =
  | 'privmsg'
  | 'action'
  | 'notice'
  | 'system'
  | 'info'
  | 'url'
  | 'motd'
  | 'warning'
  | 'mode'
  | 'ban'
  | 'join'
  | 'part'
  | 'quit'
  | 'nick'
  | 'topic';

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ChatMessage {
  id: string;            // server msgid when available, else local id
  msgid?: string;        // real server msgid (absent on +H replay / optimistic / system lines)
  bufferName: string;
  from: string;          // nick of sender (empty for system lines)
  account?: string;
  text: string;
  ts: number;            // epoch ms (server-time tag when present)
  kind: MessageKind;
  self: boolean;
  redacted?: boolean;    // draft/message-redaction
  reactions?: Reaction[];
  replyTo?: string;      // msgid this replies to
  channelContext?: string; // +draft/channel-context: this DM relates to this channel
  /** Client / server message-tags worth keeping for plugins (e.g. conference invites). */
  tags?: Record<string, string>;
  mask?: string;         // user@host for join/part/quit lines (shown mIRC-style in yomirc)
}

export interface WhoisInfo {
  nick: string;
  loading: boolean;
  user?: string;
  host?: string;
  realname?: string;
  account?: string;       // RPL_WHOISACCOUNT (services login)
  server?: string;
  serverInfo?: string;
  channels?: string;      // RPL_WHOISCHANNELS (space-separated, with prefixes)
  idle?: number;          // seconds idle (RPL_WHOISIDLE)
  signon?: number;        // epoch seconds (RPL_WHOISIDLE)
  away?: string;          // RPL_AWAY message
  secure?: boolean;       // RPL_WHOISSECURE
  oper?: boolean;         // RPL_WHOISOPERATOR
  bot?: boolean;          // RPL_WHOISBOT
  actualHost?: string;    // RPL_WHOISACTUALLY / HOST
  offline?: boolean;      // populated from WHOWAS (user is no longer connected)
  certfp?: string;        // RPL_WHOISCERTFP (276)
  regnick?: boolean;      // RPL_WHOISREGNICK (307)
  special?: string[];     // RPL_WHOISSPECIAL (320) — one entry per line
  modes?: string;         // RPL_WHOISMODES (379)
  meta?: Record<string, string>; // draft/metadata-2 profile keys (avatar/bio/pronouns/timezone/url)
  printTo?: string;       // buffer key: print this WHOIS as text lines here (yomirc) instead of the panel
}

export interface Member {
  nick: string;
  user?: string;         // ident — for matching ban masks (nick!user@host)
  host?: string;         // host/cloak — for matching ban masks
  prefix: string;        // strongest prefix char: ~ & @ % + or '' (derived from prefixes[0])
  prefixes?: string;     // all held prefix symbols, strongest-first (for live MODE updates)
  away?: boolean;
  oper?: boolean;        // visible IRC operator (WHO flags '*' — hidden +H opers won't show)
  bot?: boolean;         // WHO flags 'B'
  account?: string;      // services account (from WHOX 'a' / extended-join / ACCOUNT) — real avatars
  realname?: string;     // from extended-join / SETNAME
}

export interface Buffer {
  name: string;          // '#salon' or a nick (query)
  isChannel: boolean;
  messages: ChatMessage[];
  members: Record<string, Member>;
  topic: string;
  modes?: string;        // active channel mode letters, e.g. "+nt" (RPL_CHANNELMODEIS / live MODE)
  modeParams?: Record<string, string>; // type B/C mode params, e.g. { k: 'secret', l: '50' }
  createdAt?: number;    // channel creation unix time (RPL_CREATIONTIME 329)
  topicBy?: string;      // who last set the topic (RPL_TOPICWHOTIME 333 / live TOPIC)
  topicAt?: number;      // when the topic was last set (unix ms)
  unread: number;
  highlight?: boolean;   // a mention (nick/highlight word) is waiting in this buffer
  joined: boolean;
  readTs: number;                  // draft/read-marker: ts of last-read message (0 = none)
  typing: Record<string, number>;  // nick -> expiry ms (draft/typing)
}

export interface ConnectOptions {
  url: string;
  nick: string;
  username?: string;
  realname?: string;
  password?: string;       // SASL password / token (optional)
  passkey?: boolean;       // authenticate with a WebAuthn passkey via SASL WEBAUTHN instead of a password
  scram?: boolean;         // prefer SASL SCRAM-SHA-256 for this password (falls back to PLAIN); set by the store
  keycard?: boolean;       // the password is a single-use keycard/token, not an account password → no SCRAM
  oauthBearer?: boolean;   // prefer SASL OAUTHBEARER (RFC 7628) with password as Bearer token — for site JWT handoff
  /** Before (re)registration, mint a fresh Bearer token (e.g. /accounts/api/chat_resume/). */
  refreshBearer?: () => Promise<string | undefined>;
  /**
   * Before NICK/USER, resolve IRC GECOS (e.g. WordPress âge-genre-ville).
   * Applied to `realname` so registration never needs a post-connect SETNAME.
   */
  resolveRealname?: () => Promise<string | undefined>;
  saslAuthzid?: string;    // SASL authzid (defaults to nick); use the NickServ account when nick ≠ account
  serverPassword?: string; // server connection password — sent via PASS (optional)
  channels?: string[];
}

// Connection lifecycle states the client reports via the 'status' event. ('idle'
// is the store's initial state and is never emitted by the client.)
export type ConnectionStatus = 'connecting' | 'registered' | 'closed' | 'error' | 'sasl-failed';

// Events the IrcClient emits, mapped to their payloads — so client.on()/emit() are
// typed (event names + argument types checked at every call site).
export interface IrcClientEvents {
  message: (msg: IrcMessage) => void;
  status: (status: ConnectionStatus) => void;
  reconnecting: (seconds: number) => void;
  'raw-in': (line: string) => void;
  'raw-out': (line: string) => void;
}
