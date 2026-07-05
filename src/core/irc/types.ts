// IRC / IRCv3 shared types for the Tchatou client.

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
  password?: string;       // SASL PLAIN password (optional)
  serverPassword?: string; // server connection password — sent via PASS (optional)
  channels?: string[];
}
