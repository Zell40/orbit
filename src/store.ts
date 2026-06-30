import { create } from 'zustand';
import i18n from './i18n';
import { IrcClient } from './irc/client';
import { initNotify, desktopNotify, blip } from './services/notify';
import { getPrefs, savePrefs, applyPrefs, type Prefs } from './ui/prefs';
import type { Buffer, ChatMessage, ConnectOptions, IrcMessage, Member, MessageKind, WhoisInfo } from './irc/types';
import { NUMERICS, ERROR_NUMERICS } from './irc/numerics';
import { buildModeContext, parseModeChanges, applyChannelFlag, applyUserModes } from './irc/modes';
import { usePluginRegistry } from './plugins/registry';
import { casefold } from './irc/casemap';
import { getConfig } from './config';
import { hostmask, maskMatches, isService, maskSecret, detectServiceLeak, stripFormatting } from './store/text';
import { HIGHLIGHT_KEY, loadStr, saveStr, loadIgnored, saveIgnored, loadFriends, saveFriends, loadNotify, saveNotify, type NotifyLevel } from './store/persistence';

let localId = 0;
let lastTypingSent = 0;
const closedChannels = new Set<string>(); // channels the user explicitly closed — not auto-resurrected
const lastCantSend: Record<string, number> = {}; // throttle the "you can't write here" notice per channel
const lastAwayNotice: Record<string, number> = {}; // throttle the "X is away" notice per query

const newId = () => `local-${Date.now()}-${localId++}`;


// Pending /FILEHOST token request (resolved when the server NOTICEs the upload URL).
let filehostResolve: ((token: string) => void) | null = null;
let filehostReject: ((err: Error) => void) | null = null;
let filehostTimer: ReturnType<typeof setTimeout> | null = null;


export const SERVER = '$server'; // pseudo-buffer key for the server/network console
const HANDLED_NUMERICS = new Set(['005', '332', '333', '353', '366', '396', '366', '900', '901', '321', '322', '323', '354']);

// Live from ISUPPORT (synced from the client each message). CHANTYPES decides
// what's a channel; CASEMAPPING decides how we fold names to a canonical key.
let chanTypes = '#&';
let casemapping = 'rfc1459';
let statusPrefixes = ''; // ISUPPORT STATUSMSG, e.g. "@%+" — targets like @#chan
// Open IRCv3 BATCHes (ref → info). "quiet" batches (netsplit/netjoin) suppress the
// per-user join/quit noise; "chathistory" batches collect their PRIVMSGs to be
// PREPENDED as older history rather than appended live.
const openBatches: Record<string, { type: string; quiet: boolean; target?: string }> = {};
const historyCollect: Record<string, ChatMessage[]> = {}; // batchRef → collected old messages
// draft/multiline: gather the lines of one batch to render as a single message.
const multilineCollect: Record<string, { base: ChatMessage; lines: { text: string; concat: boolean }[] }> = {};
function inQuietBatch(msg: IrcMessage): boolean {
  const ref = msg.tags['batch'];
  return !!ref && !!openBatches[ref]?.quiet;
}
function inHistoryBatch(msg: IrcMessage): string | undefined {
  const ref = msg.tags['batch'];
  return ref && openBatches[ref]?.type === 'chathistory' ? ref : undefined;
}
function inMultilineBatch(msg: IrcMessage): string | undefined {
  const ref = msg.tags['batch'];
  return ref && openBatches[ref]?.type === 'draft/multiline' ? ref : undefined;
}

function isChannelName(name: string): boolean {
  return !!name && chanTypes.includes(name[0]);
}

// Canonical key for a buffer/member name (channel or nick), per CASEMAPPING, so
// "#Taverne" and "#taverne" never become two buffers. Display names keep their
// original case (Buffer.name / Member.nick); only the map KEY is folded.
function canon(name: string): string {
  return casefold(name, casemapping);
}

export type Modal = '' | 'join' | 'settings' | 'explore' | 'friends' | 'chanadmin' | 'report' | 'switcher' | 'shortcuts';
export interface ChannelInfo { name: string; users: number; topic: string }
export interface KickInfo { channel: string; by: string; reason: string; kind: 'kick' | 'ban' | 'mute' }

interface ChatState {
  status: 'idle' | 'connecting' | 'registered' | 'closed' | 'error' | 'sasl-failed';
  nick: string;
  buffers: Record<string, Buffer>;
  order: string[];
  active: string;
  client: IrcClient | null;
  networkIcon: string;
  account: string; // NickServ account we're logged in as ('' = guest)
  umodes: string;  // our own active user-mode letters, e.g. "iwx" (global, per-user)
  serverName: string;    // the ircd's own hostname (RPL_MYINFO / 004), for the Status title
  serverError: string;   // last ERROR reason from the server (for the connect screen)
  reconnectIn: number;   // seconds until the next auto-reconnect (0 = not reconnecting)
  everRegistered: boolean; // true after the first successful registration (keeps the chat UI mounted during reconnects)
  autoConnecting: boolean; // a handoff (e.g. the site entry form) is connecting for us; show a splash, not the join form
  historyLoading: Record<string, boolean>; // buffer key → chathistory request in flight
  historyDone: Record<string, boolean>;    // buffer key → no more older history
  loadMoreHistory: (name: string) => void;
  away: boolean;                  // are WE marked away?
  setAway: (reason: string) => void; // '' = back
  friends: string[];              // MONITOR list (nicks), persisted
  friendsOnline: Record<string, boolean>; // lowercased nick → online?
  addFriend: (nick: string) => void;
  removeFriend: (nick: string) => void;
  banlists: Record<string, { mask: string; by: string; ts: number }[]>; // channel key → +b list
  loadBanList: (channel: string) => void;
  setChannelMode: (channel: string, mode: string, add: boolean) => void;
  removeBan: (channel: string, mask: string) => void;
  notifyLevel: Record<string, NotifyLevel>; // canon key → 'all' | 'mentions' | 'mute' (absent = 'mentions')
  setNotifyLevel: (name: string, level: NotifyLevel) => void;
  markAllRead: () => void;
  highlightWords: string[];    // extra words (besides your nick) that trigger a highlight
  setHighlightWords: (words: string[]) => void;
  drafts: Record<string, string>; // buffer key → unsent composer text
  setDraft: (name: string, text: string) => void;
  reg: { step: 'idle' | 'code' | 'done'; account: string; busy: boolean; error: string; info: string; challengeUrl: string };
  replyTarget: { id: string; from: string; text: string } | null;
  search: string;
  ignored: string[]; // nicks whose messages are hidden (client-side), persisted
  channels: ChannelInfo[]; // results of the last LIST (Explore)
  listLoading: boolean;
  prefs: Prefs;
  profileUser: string;
  whois: Record<string, WhoisInfo>;
  modal: Modal;
  reportSubject: string; // nick/channel prefilled into the report window
  kicked: KickInfo | null; // last time we got kicked — drives the dismissible toast
  pmContext: Record<string, string>; // canon(nick) → channel this DM relates to (+draft/channel-context)

  connect: (opts: ConnectOptions) => void;
  setActive: (name: string) => void;
  openQuery: (nick: string, fromChannel?: string) => void;
  closeBuffer: (name: string) => void;
  openUser: (nick: string) => void;
  refreshUser: (nick: string) => void;
  closeProfile: () => void;
  setModal: (m: Modal) => void;
  dismissKick: () => void;
  rejoinKicked: () => void;
  sendInput: (text: string) => void;
  setReplyTarget: (id: string) => void;
  clearReply: () => void;
  setSearch: (q: string) => void;
  toggleIgnore: (nick: string) => void;
  modKick: (nick: string) => void;
  modBan: (nick: string) => void;
  modSetMode: (nick: string, mode: string, add: boolean) => void;
  modTopic: (topic: string) => void;
  reportUser: (nick: string) => void; // opens the report window prefilled with this nick
  sendReport: (target: string, reason: string) => void; // files a report via ReportServ (or the fallback channel)
  refreshChannels: () => void;
  notifyTyping: () => void;
  toggleReaction: (msgid: string, emoji: string) => void;
  redact: (msgid: string) => void;
  uploadImage: (file: File) => Promise<void>;
  uploadAudio: (blob: Blob, ext: string) => Promise<void>;
  pushSystem: (buffer: string, text: string) => void;
  accountRegister: (account: string, email: string, password: string) => void;
  accountVerify: (code: string) => void;
  accountResend: () => void;
  accountChangePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; message: string }>;
  accountChallengeComplete: (turnstileToken: string) => void;
  resetReg: () => void;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
}

export const useChat = create<ChatState>((set, get) => {
  // ---- helpers that mutate state immutably -------------------------------
  // Buffers are keyed by the CASEMAPPING-folded name (canon); Buffer.name keeps
  // the original display case so the UI shows "#Taverne" while "#taverne" maps
  // to the same buffer.
  function ensureBuffer(name: string): void {
    const key = canon(name);
    const s = get();
    if (s.buffers[key]) return;
    if (isChannelName(name) && closedChannels.has(key)) return; // don't resurrect a closed channel
    const buf: Buffer = {
      name, isChannel: isChannelName(name), messages: [], members: {},
      topic: '', unread: 0, joined: false, readTs: 0, typing: {},
    };
    set({ buffers: { ...s.buffers, [key]: buf }, order: [...s.order, key] });
  }

  function patchBuffer(name: string, fn: (b: Buffer) => Buffer): void {
    const key = canon(name);
    const s = get();
    const cur = s.buffers[key];
    if (!cur) return;
    set({ buffers: { ...s.buffers, [key]: fn(cur) } });
  }

  // Apply a member patch in every channel where the nick is present — used by the
  // IRCv3 state-update messages (AWAY / ACCOUNT / CHGHOST / SETNAME) so we never
  // have to re-poll WHO to keep away/account/host/realname fresh.
  // Remove a buffer (by any-case name) and pick a sensible next active buffer.
  function dropBuffer(name: string): void {
    const key = canon(name);
    const s = get();
    if (!s.buffers[key]) return;
    const buffers = { ...s.buffers }; delete buffers[key];
    const order = s.order.filter((n) => n !== key);
    let active = s.active;
    if (active === key) active = order.find((n) => buffers[n]?.isChannel) || order[0] || '';
    set({ buffers, order, active });
  }

  function patchMemberEverywhere(nick: string, patch: Partial<Member>): void {
    const s = get();
    for (const name of s.order) {
      const b = s.buffers[name];
      const m = b.members[nick];
      if (m) patchBuffer(name, (bb) => ({ ...bb, members: { ...bb.members, [nick]: { ...m, ...patch } } }));
    }
  }

  function addMessage(name: string, m: ChatMessage): void {
    ensureBuffer(name);
    const key = canon(name);
    const s = get();
    patchBuffer(name, (b) => {
      // Reconcile: a server-stamped copy of OUR OWN message (real msgid, arriving
      // via echo-message or a history replay) matching a still-optimistic local
      // copy → upgrade that copy in place instead of adding a duplicate.
      if (m.self && !m.id.startsWith('local-') && (m.kind === 'privmsg' || m.kind === 'action')) {
        const i = b.messages.findIndex((x) => x.self && x.id.startsWith('local-') && x.kind === m.kind && x.text === m.text);
        if (i !== -1) {
          const msgs = b.messages.slice();
          msgs[i] = { ...msgs[i], id: m.id, ts: m.ts, reactions: m.reactions ?? msgs[i].reactions };
          return { ...b, messages: msgs };
        }
      }
      // Idempotent: the exact same message id already present → ignore.
      if (m.id && b.messages.some((x) => x.id === m.id)) return b;
      return {
        ...b,
        messages: [...b.messages, m].slice(-500),
        unread: key === s.active ? 0 : b.unread + ((name === SERVER || m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice') ? 1 : 0),
      };
    });
  }

  const tsOf = (msg: IrcMessage): number => {
    const t = msg.tags['time'];
    return t ? Date.parse(t) : Date.now();
  };

  // Content signature for dedup across history sources (+H replay vs CHATHISTORY).
  // Second-precision ts tolerates ms differences between the two replays.
  const msgSig = (m: ChatMessage): string =>
    `${m.kind} ${m.from} ${Math.floor(m.ts / 1000)} ${m.text}`;

  function sysLine(name: string, text: string, kind: MessageKind, from = '', mask = ''): void {
    addMessage(name, { id: newId(), bufferName: name, from, text, ts: Date.now(), kind, self: false, mask: mask || undefined });
  }

  function serverLine(text: string, kind: MessageKind = 'system'): void {
    if (!text) return;
    ensureBuffer(SERVER);
    if (!get().active) set({ active: SERVER });
    addMessage(SERVER, { id: newId(), bufferName: SERVER, from: '', text, ts: Date.now(), kind, self: false });
  }

  function patchWhois(nick: string, fn: (w: WhoisInfo) => WhoisInfo): void {
    const s = get();
    const cur = s.whois[nick] ?? { nick, loading: true };
    set({ whois: { ...s.whois, [nick]: fn(cur) } });
  }

  // ---- IRC event -> state ------------------------------------------------
  function handle(msg: IrcMessage): void {
    const me = get().nick;
    // Keep CHANTYPES/CASEMAPPING/STATUSMSG current from the negotiated ISUPPORT.
    const cl = get().client;
    if (cl) { chanTypes = cl.chantypes; casemapping = cl.casemapping; statusPrefixes = cl.isupport['STATUSMSG'] || ''; }

    // draft/event-playback: a JOIN/PART/QUIT/KICK/NICK/TOPIC inside a chathistory
    // batch is HISTORICAL — collect it as a system line (prepended with the rest of
    // the history); never let it mutate live channel/member state.
    const epRef = inHistoryBatch(msg);
    if (epRef && ['JOIN', 'PART', 'QUIT', 'KICK', 'NICK', 'TOPIC', 'MODE'].includes(msg.command)) {
      const chan = openBatches[epRef].target;
      if (chan) {
        let text = '', kind: MessageKind = 'system';
        if (msg.command === 'JOIN') { text = i18n.t('system.join', { nick: msg.nick }); kind = 'join'; }
        else if (msg.command === 'PART') { text = i18n.t('system.part', { nick: msg.nick }); kind = 'part'; }
        else if (msg.command === 'QUIT') { text = i18n.t('system.quit', { nick: msg.nick }); kind = 'quit'; }
        else if (msg.command === 'KICK') { text = i18n.t('system.kick', { target: msg.params[1], by: msg.nick }); kind = 'system'; }
        else if (msg.command === 'NICK') { text = i18n.t('system.nick', { nick: msg.nick, newnick: msg.params[0] }); kind = 'nick'; }
        else if (msg.command === 'TOPIC') { text = msg.params[1] || ''; kind = 'topic'; }
        else if (msg.command === 'MODE') {
          const modestr = [msg.params[1], ...msg.params.slice(2)].filter(Boolean).join(' ');
          text = i18n.t('system.modes', { nick: msg.nick, modes: modestr }); kind = 'system';
        }
        // Deterministic id so the same historical event dedups across re-fetches
        // (events carry no msgid, so newId() would duplicate them on every reconnect).
        const evId = msg.tags['msgid'] || `evt:${msg.command}:${tsOf(msg)}:${msg.nick}:${msg.params.join(',')}`;
        const evMask = ['JOIN', 'PART', 'QUIT'].includes(msg.command) ? hostmask(msg) : '';
        (historyCollect[epRef] ||= []).push({
          id: evId, bufferName: chan, from: msg.nick, text,
          ts: tsOf(msg), kind, self: false, mask: evMask || undefined,
        });
      }
      return;
    }

    // WHOIS replies → user-info panel (and suppress them from the console).
    switch (msg.command) {
      case '311': // RPL_WHOISUSER: <me> <nick> <user> <host> * :<realname>
        patchWhois(msg.params[1], (w) => ({ ...w, user: msg.params[2], host: msg.params[3], realname: msg.params[5] }));
        return;
      case '312': // RPL_WHOISSERVER: <me> <nick> <server> :<info>
        patchWhois(msg.params[1], (w) => ({ ...w, server: msg.params[2], serverInfo: msg.params[3] }));
        return;
      case '313': // RPL_WHOISOPERATOR
        patchWhois(msg.params[1], (w) => ({ ...w, oper: true }));
        return;
      case '317': // RPL_WHOISIDLE: <me> <nick> <idle> <signon> :seconds idle, signon time
        patchWhois(msg.params[1], (w) => ({ ...w, idle: Number(msg.params[2]) || 0, signon: Number(msg.params[3]) || 0 }));
        return;
      case '319': { // RPL_WHOISCHANNELS (can arrive across multiple lines)
        const add = (msg.params[2] ?? '').split(' ').filter(Boolean);
        patchWhois(msg.params[1], (w) => {
          const seen = new Set((w.channels ? w.channels.split(' ') : []).filter(Boolean));
          for (const c of add) seen.add(c);
          return { ...w, channels: [...seen].join(' ') };
        });
        return;
      }
      case '330': // RPL_WHOISACCOUNT: <me> <nick> <account> :is logged in as
        patchWhois(msg.params[1], (w) => ({ ...w, account: msg.params[2] }));
        return;
      case '301': { // RPL_AWAY: <me> <nick> :<away message>
        const who = msg.params[1];
        const reason = msg.params[2] || '';
        patchWhois(who, (w) => ({ ...w, away: reason }));
        // If we have a query open with them (i.e. we just messaged them), tell us
        // they're away — throttled so it isn't repeated on every line.
        const key = canon(who);
        if (get().buffers[key] && Date.now() - (lastAwayNotice[key] || 0) > 60000) {
          lastAwayNotice[key] = Date.now();
          sysLine(who, `💤 ${who} est absent${reason ? ` : ${reason}` : ''}`, 'info');
        }
        return;
      }
      case '335': // RPL_WHOISBOT (server)
        patchWhois(msg.params[1], (w) => ({ ...w, bot: true }));
        return;
      case '338': // RPL_WHOISACTUALLY
      case '378': // RPL_WHOISHOST
        patchWhois(msg.params[1], (w) => ({ ...w, actualHost: msg.params[2] }));
        return;
      case '671': // RPL_WHOISSECURE
        patchWhois(msg.params[1], (w) => ({ ...w, secure: true }));
        return;
      case '276': // RPL_WHOISCERTFP: <me> <nick> :has client cert fingerprint <fp>
        patchWhois(msg.params[1], (w) => ({ ...w, certfp: (msg.params[2] || '').replace(/^.*fingerprint\s*/i, '') }));
        return;
      case '307': // RPL_WHOISREGNICK: nick is a registered/identified account
        patchWhois(msg.params[1], (w) => ({ ...w, regnick: true }));
        return;
      case '320': // RPL_WHOISSPECIAL: free-form extra whois line
        patchWhois(msg.params[1], (w) => ({ ...w, special: [...(w.special ?? []), msg.params[2]] }));
        return;
      case '379': // RPL_WHOISMODES: <me> <nick> :is using modes <modes>
        patchWhois(msg.params[1], (w) => ({ ...w, modes: (msg.params[2] || '').replace(/^.*modes\s*/i, '') }));
        return;
      case '314': // RPL_WHOWASUSER: <me> <nick> <user> <host> * :<realname>
        patchWhois(msg.params[1], (w) => ({ ...w, user: msg.params[2], host: msg.params[3], realname: msg.params[5], offline: true }));
        return;
      case '369': // RPL_ENDOFWHOWAS
        patchWhois(msg.params[1], (w) => ({ ...w, loading: false }));
        return;
      case '318': // RPL_ENDOFWHOIS
        patchWhois(msg.params[1], (w) => ({ ...w, loading: false }));
        return;
      case '352': { // RPL_WHOREPLY: <me> <chan> <user> <host> <server> <nick> <flags> :<hop> <real>
        const chan = msg.params[1];
        const who = msg.params[5];
        const flags = msg.params[6] ?? '';
        if (isChannelName(chan)) {
          patchBuffer(chan, (b) => {
            const m = b.members[who];
            if (!m) return b;
            return { ...b, members: { ...b.members, [who]: { ...m, user: msg.params[2] || m.user, host: msg.params[3] || m.host, oper: flags.includes('*'), bot: flags.includes('B'), away: flags.startsWith('G') } } };
          });
        }
        return;
      }
      case '354': { // RPL_WHOSPCRPL (WHOX): <me> <token> <chan> <nick> <flags> <account>
        if (msg.params[1] !== '152') break; // not our query
        const chan = msg.params[2];
        const who = msg.params[3];
        const flags = msg.params[4] ?? '';
        const account = msg.params[5] && msg.params[5] !== '0' ? msg.params[5] : undefined;
        if (isChannelName(chan)) {
          patchBuffer(chan, (b) => {
            const m = b.members[who];
            if (!m) return b;
            return { ...b, members: { ...b.members, [who]: { ...m, oper: flags.includes('*'), bot: flags.includes('B'), away: flags.startsWith('G'), account } } };
          });
        }
        return;
      }
      case '315': // RPL_ENDOFWHO
        return;
      case '366': { // RPL_ENDOFNAMES → pull WHO (oper/away flags) + the channel modes
        const chan = msg.params[1];
        if (isChannelName(chan)) { get().client?.who(chan); get().client?.send(`MODE ${chan}`); }
        return;
      }
      case '324': { // RPL_CHANNELMODEIS: <me> <chan> <modes> [params…]
        const chan = msg.params[1];
        if (!isChannelName(chan)) return;
        ensureBuffer(chan);
        // Parse the modes + their params (key/limit) the same way as a live MODE.
        const client = get().client;
        const ctx = buildModeContext(client?.isupport ?? {}, client?.prefixModeToChar ?? {});
        const changes = parseModeChanges(msg.params[2] ?? '', msg.params.slice(3), ctx);
        let modes = '', modeParams: Record<string, string> = {};
        for (const c of changes) {
          if (c.kind === 'param' || c.kind === 'flag') ({ modes, modeParams } = applyChannelFlag(modes, modeParams, c));
        }
        patchBuffer(chan, (b) => ({ ...b, modes, modeParams }));
        return;
      }
      case '329': { // RPL_CREATIONTIME: <me> <chan> <unixtime> — store it, don't spam the console
        const chan = msg.params[1];
        const ts = Number(msg.params[2]) || 0;
        if (isChannelName(chan)) { ensureBuffer(chan); patchBuffer(chan, (b) => ({ ...b, createdAt: ts })); }
        return;
      }
      case '321': // RPL_LISTSTART
        set({ channels: [], listLoading: true });
        return;
      case '322': { // RPL_LIST: <me> <channel> <#users> :<topic>
        const name = msg.params[1];
        if (isChannelName(name)) {
          const entry = { name, users: Number(msg.params[2]) || 0, topic: (msg.params[3] || '').replace(/^\[\+[^\]]*\]\s*/, '') };
          set({ channels: [...get().channels, entry] });
        }
        return;
      }
      case '323': // RPL_LISTEND
        set({ listLoading: false });
        return;
      case '900': // RPL_LOGGEDIN: <me> <nick!user@host> <account> :You are now logged in as …
        set({ account: msg.params[2] || '' });
        return;
      case '901': // RPL_LOGGEDOUT
        set({ account: '' });
        return;
      case '221': // RPL_UMODEIS: <me> <modestring> — our current user modes
        set({ umodes: applyUserModes('', msg.params[1] ?? '') });
        return;
      case '004': // RPL_MYINFO: <me> <servername> … — the ircd's own hostname
        set({ serverName: msg.params[1] || get().serverName });
        return;
      case '331': { // RPL_NOTOPIC
        const ch = msg.params[1];
        if (isChannelName(ch)) { ensureBuffer(ch); patchBuffer(ch, (b) => ({ ...b, topic: '' })); }
        return;
      }
      case '367': { // RPL_BANLIST: <me> <chan> <mask> [<who> <ts>] — collect into state
        const ch = msg.params[1];
        const mask = msg.params[2];
        if (isChannelName(ch) && mask) {
          const key = canon(ch);
          const entry = { mask, by: (msg.params[3] || '').split('!')[0], ts: Number(msg.params[4]) * 1000 || 0 };
          set({ banlists: { ...get().banlists, [key]: [...(get().banlists[key] || []), entry] } });
        }
        return;
      }
      case '348': // RPL_EXCEPTLIST
      case '346': { // RPL_INVEXLIST
        const ch = msg.params[1];
        const mask = msg.params[2];
        const tag = msg.command === '348' ? 'Exception' : 'Invitation';
        const who = msg.params[3] ? ` — par ${msg.params[3].split('!')[0]}` : '';
        if (isChannelName(ch) && mask) sysLine(ch, `📋 ${tag} : ${mask}${who}`, 'info');
        return;
      }
      case '368': // RPL_ENDOFBANLIST
      case '349': // RPL_ENDOFEXCEPTLIST
      case '347': // RPL_ENDOFINVEXLIST
      case '337': // RPL_ENDOFINVITELIST
        return; // list terminators — nothing to show
      case '336': // RPL_INVITELIST (a channel you're invited to)
        if (msg.params[1]) serverLine(i18n.t('system.invitePending', { chan: msg.params[1] }));
        return;
      case '341': // RPL_INVITING: <me> <nick> <channel> — confirm our invite was sent
        serverLine(i18n.t('system.inviteSent', { nick: msg.params[1], chan: msg.params[2] }));
        return;
      case '305': // RPL_UNAWAY
        set({ away: false }); serverLine(i18n.t('system.awayOff'));
        return;
      case '306': // RPL_NOWAWAY
        set({ away: true }); serverLine(i18n.t('system.awayOn'));
        return;
      case '730': { // RPL_MONONLINE: <me> :<target>[,<target>…] came online
        const targets = (msg.params[1] || '').split(',').map((t) => t.split('!')[0]).filter(Boolean);
        if (!targets.length) return;
        const online = { ...get().friendsOnline };
        for (const t of targets) {
          const wasOff = !online[t.toLowerCase()];
          online[t.toLowerCase()] = true;
          if (wasOff && get().friends.some((f) => f.toLowerCase() === t.toLowerCase())) {
            desktopNotify('Ami en ligne', `${t} vient de se connecter`);
            if (get().prefs.sound) blip();
          }
        }
        set({ friendsOnline: online });
        return;
      }
      case '731': { // RPL_MONOFFLINE
        const targets = (msg.params[1] || '').split(',').map((t) => t.split('!')[0]).filter(Boolean);
        if (!targets.length) return;
        const online = { ...get().friendsOnline };
        for (const t of targets) online[t.toLowerCase()] = false;
        set({ friendsOnline: online });
        return;
      }
      case '732': // RPL_MONLIST
      case '733': // RPL_ENDOFMONLIST
        return;
      case '401': // ERR_NOSUCHNICK
        if (get().whois[msg.params[1]]) {
          // The user is offline — fall back to WHOWAS for their last-known info.
          if (get().profileUser === msg.params[1]) { get().client?.whowas(msg.params[1]); return; }
          patchWhois(msg.params[1], (w) => ({ ...w, loading: false }));
          return;
        }
        break;
      case '404': { // ERR_CANNOTSENDTOCHAN: we tried to talk but we're banned / channel is moderated
        const ch = msg.params[1];
        if (!isChannelName(ch)) return;
        const now = Date.now();
        if (now - (lastCantSend[ch] || 0) < 12000) return; // already told them recently — don't spam
        lastCantSend[ch] = now;
        sysLine(ch, `⛔ ${i18n.t('system.cantWriteHere')}`, 'system');
        desktopNotify(i18n.t('system.cantWriteTitle', { ch }), i18n.t('system.cantWriteBody'));
        if (get().prefs.sound) blip();
        set({ kicked: { channel: ch, by: '', reason: '', kind: 'mute' } });
        return;
      }
      case '474': { // ERR_BANNEDFROMCHAN: join refused — we're banned from the channel
        const ch = msg.params[1];
        if (!isChannelName(ch)) return;
        sysLine(SERVER, i18n.t('system.bannedFrom', { ch }), 'system');
        desktopNotify(i18n.t('system.bannedTitle', { ch }), i18n.t('system.bannedBody'));
        if (get().prefs.sound) blip();
        closedChannels.add(canon(ch)); // a failed join may have opened a buffer — drop it
        dropBuffer(ch);
        set({ kicked: { channel: ch, by: '', reason: '', kind: 'ban' } });
        return;
      }
    }

    // Every remaining numeric is recognised (see irc/numerics.ts) and routed:
    // errors → a visible ⚠ line where the user is looking; everything else →
    // the server console. Nothing is ever dumped unlabelled.
    if (/^\d{3}$/.test(msg.command) && !HANDLED_NUMERICS.has(msg.command)) {
      const code = msg.command;
      const serverText = msg.params.length > 1 ? msg.params[msg.params.length - 1] : '';
      if (ERROR_NUMERICS.has(code)) {
        const ctx = msg.params[1];
        const dest = ctx && isChannelName(ctx) && get().buffers[canon(ctx)] ? ctx
          : isChannelName(get().active) ? get().active : SERVER;
        sysLine(dest, `⚠ ${i18n.t(`numerics.${code}`, '') || serverText}`, 'system');
        if (get().prefs.sound) blip();
        return;
      }
      // Informational numeric → console. Tag unknown ones with their RPL name so
      // it's recognised rather than a bare number.
      const label = NUMERICS[code];
      serverLine(label && !serverText ? `[${label}]` : msg.params.slice(1).join(' '));
      return;
    }

    switch (msg.command) {
      case 'PRIVMSG':
      case 'NOTICE': {
        const target = msg.params[0];
        let text = msg.params[1] ?? '';
        const self = msg.nick === me;
        // Server-originated NOTICE (no user@host, or to "*") → Server console,
        // styled as an info callout.
        if (msg.command === 'NOTICE' && (target === '*' || !msg.user)) {
          // FILEHOST service notices are machine/help noise triggered by our own
          // automatic /FILEHOST command (every image/voice upload) — always hide
          // them. When an upload is waiting, pull the one-time token from the URL,
          // or surface the not-identified case (a guest can't upload).
          if (/FILEHOST|file hosting/i.test(text)) {
            if (filehostResolve) {
              const tok = text.match(/[?&]token=([\w.-]+)/);
              if (tok) {
                if (filehostTimer) clearTimeout(filehostTimer);
                const r = filehostResolve; filehostResolve = null; filehostReject = null;
                r(tok[1]);
              } else if (/must be logged in|not (logged|identif|authentic)/i.test(text)) {
                if (filehostTimer) clearTimeout(filehostTimer);
                const rj = filehostReject; filehostResolve = null; filehostReject = null;
                rj?.(new Error('not_identified'));
              }
            }
            break; // swallow all FILEHOST service notices
          }
          // Cloudflare/Turnstile anti-bot gate during REGISTER → surface it in the
          // account UI instead of dumping the raw challenge link in the console.
          const inReg = get().reg.busy || !!get().reg.challengeUrl;
          const challenge = text.match(/(https?:\/\/\S+\/cloudflare\/verify\/\S+)/i);
          if (challenge && /ctx=register/i.test(challenge[1])) {
            set({ reg: { ...get().reg, step: 'code', busy: false, error: '', challengeUrl: challenge[1],
              info: i18n.t('reg.antibotInfo') } });
            break; // swallow — shown as a button in the Connexion tab
          }
          if (inReg && /défi anti-robot|code de vérification vous sera envoyé/i.test(text)) {
            break; // swallow the companion turnstile lines
          }
          serverLine(text, 'info');
          break;
        }
        // Client-side ignore: drop messages from ignored nicks (not our own).
        if (!self && msg.nick) {
          const lc = msg.nick.toLowerCase();
          if (get().ignored.some((n) => n.toLowerCase() === lc)) return;
        }
        // Plugin message filters: a plugin can hide a message from the chat
        // display (e.g. a service's machine-readable control lines). The plugin
        // still receives it via on('raw').
        const mfilters = usePluginRegistry.getState().messageFilters;
        if (mfilters.length && mfilters.some((f) => f.fn({ nick: msg.nick || '', command: msg.command, target, text })))
          return;
        let kind: MessageKind = msg.command === 'NOTICE' ? 'notice' : 'privmsg';
        // CTCP ACTION
        if (text.startsWith('\x01ACTION ') && text.endsWith('\x01')) {
          text = text.slice(8, -1);
          kind = 'action';
        } else if (text.startsWith('\x01') && text.endsWith('\x01')) {
          return; // other CTCP — ignore for now
        }
        // Host/server-mask broadcast ("$$host" / "$#server", oper-only on send):
        // we may RECEIVE one if it matches us. Show it on the console as a clear
        // server-wide broadcast rather than a confusing private message.
        if (target && target[0] === '$') {
          serverLine(`📢 Diffusion de ${msg.nick} (${target}) : ${text}`, 'info');
          break;
        }
        // STATUSMSG: a target like "@#chan" / "+#chan" addresses only members at
        // that status. Strip the prefix, route to the channel, and tag the line.
        let chanTarget = target;
        let statusTag = '';
        if (target && statusPrefixes.includes(target[0]) && isChannelName(target.slice(1))) {
          const lvl = target[0];
          chanTarget = target.slice(1);
          statusTag = lvl === '+' ? '🔉 voix+ · ' : lvl === '%' ? '🛡 halfops+ · ' : '🔒 ops · ';
        }
        // The report service (ReportServ) is not a conversation: route both our own
        // "REPORT …" command echo and its replies to the Status window, so filing a
        // report never spawns a ReportServ PM buffer.
        const reportSvc = (getConfig().report.service || '').toLowerCase();
        const otherParty = (self ? chanTarget : msg.nick) || '';
        const toReportSvc = !!reportSvc && !isChannelName(chanTarget) && otherParty.toLowerCase() === reportSvc;
        // A NOTICE is not a conversation: a user/service NOTICE addressed to us must
        // never open or land in a PM query. Per convention it shows in the buffer the
        // user currently has open (active window), falling back to the console.
        const noticeToActive = kind === 'notice' && !isChannelName(chanTarget) && !toReportSvc;
        const bufferName = isChannelName(chanTarget)
          ? chanTarget
          : toReportSvc
            ? SERVER
            : noticeToActive
              ? (get().active || SERVER)
              : (self ? chanTarget : msg.nick);
        // +draft/channel-context: this DM relates to a channel. Only meaningful on PMs.
        const chanCtx = !noticeToActive && !isChannelName(chanTarget) ? msg.tags['+draft/channel-context'] : undefined;
        // A notice we send shows the recipient; one we receive shows the sender.
        const noticeText = noticeToActive && self ? `→ ${chanTarget} : ${text}` : statusTag + text;
        const cm: ChatMessage = {
          id: msg.tags['msgid'] || newId(),
          msgid: msg.tags['msgid'] || undefined,
          bufferName, from: msg.nick, account: msg.tags['account'],
          text: self && isService(bufferName) ? maskSecret(noticeText) : noticeText, ts: tsOf(msg), kind, self,
          replyTo: msg.tags['+draft/reply'],
          channelContext: chanCtx,
        };
        // Remember an incoming PM's channel context so our replies carry it back.
        if (chanCtx && !self && isChannelName(chanCtx)) {
          const s = get();
          if (s.pmContext[canon(msg.nick)] !== chanCtx)
            set({ pmContext: { ...s.pmContext, [canon(msg.nick)]: chanCtx } });
        }
        // chathistory replay: collect into the batch (prepended on BATCH close),
        // don't append live or notify.
        const histRef = inHistoryBatch(msg);
        if (histRef) { (historyCollect[histRef] ||= []).push(cm); break; }
        // draft/multiline: gather the lines to render as one message at batch close.
        const mlRef = inMultilineBatch(msg);
        if (mlRef) {
          const concat = msg.tags['draft/multiline-concat'] !== undefined;
          const slot = (multilineCollect[mlRef] ||= { base: cm, lines: [] });
          slot.lines.push({ text, concat });
          break;
        }
        addMessage(bufferName, cm);
        // Notifications honour the per-channel level: 'all' alerts on every line,
        // 'mentions' (default) only on your nick / a highlight word, 'mute' never.
        // A mention = your nick OR any of your highlight words; PMs always alert.
        if (!self && kind !== 'notice') {
          const isPM = !isChannelName(chanTarget);
          const level = isPM ? 'all' : (get().notifyLevel[canon(bufferName)] || 'mentions');
          const lc = text.toLowerCase();
          const mention = (me.length > 1 && lc.includes(me.toLowerCase()))
            || get().highlightWords.some((w) => lc.includes(w.toLowerCase()));
          const inactive = document.hidden || canon(bufferName) !== get().active;
          if (mention && level !== 'mute') patchBuffer(bufferName, (b) => ({ ...b, highlight: true }));
          const wants = level === 'all' || (level === 'mentions' && mention);
          if (inactive && wants) {
            desktopNotify(isPM ? i18n.t('system.pmNotif', { nick: msg.nick }) : `${msg.nick} · ${bufferName}`, text.slice(0, 120));
            if (get().prefs.sound) blip();
          }
        }
        break;
      }
      case 'JOIN': {
        const ch = msg.params[0];
        if (msg.nick === me) closedChannels.delete(canon(ch)); // we're (re)joining → allow the buffer again
        ensureBuffer(ch);
        if (msg.nick === me) {
          patchBuffer(ch, (b) => ({ ...b, joined: true }));
          if (!isChannelName(get().active) || get().active === '') get().setActive(ch);
          // Pull full history (messages + JOIN/PART/KICK/MODE/TOPIC events via event-playback)
          // from m_ircv3_chathistory — the +H auto-replay only carries messages. Deduped by id.
          const cl = get().client;
          if (cl?.hasCap('draft/chathistory')) cl.chathistoryLatest(ch, 50);
        }
        // extended-join: ":nick JOIN #chan <account> :<realname>" — '*'/'0' = none.
        // Gives us account + realname up front, so no WHO needed for joiners.
        const joinAcct = msg.params[1] && msg.params[1] !== '*' && msg.params[1] !== '0' ? msg.params[1] : undefined;
        const joinReal = msg.params[2] || undefined;
        patchBuffer(ch, (b) => ({ ...b, members: { ...b.members, [msg.nick]: { nick: msg.nick, user: msg.user || undefined, host: msg.host || undefined, prefix: '', account: joinAcct, realname: joinReal } } }));
        if (!inQuietBatch(msg)) sysLine(ch, i18n.t('system.join', { nick: msg.nick }), 'join', msg.nick, hostmask(msg));
        break;
      }
      case 'PART': {
        const ch = msg.params[0];
        patchBuffer(ch, (b) => {
          const members = { ...b.members }; delete members[msg.nick];
          return { ...b, members };
        });
        if (!inQuietBatch(msg)) sysLine(ch, i18n.t('system.part', { nick: msg.nick }), 'part', msg.nick, hostmask(msg));
        break;
      }
      case 'KICK': {
        const ch = msg.params[0];
        const target = msg.params[1];
        const reason = msg.params[2] ?? '';
        if (target === me) {
          // We got kicked out. Tell the user, then close the salon and drop it
          // from the list (closedChannels stops a late stray line resurrecting it).
          const tail = reason ? ` (${reason})` : '';
          sysLine(SERVER, `${i18n.t('system.kickedFrom', { ch, by: msg.nick })}${tail}`, 'system');
          desktopNotify(i18n.t('system.kickedTitle', { ch }), `${i18n.t('system.kickedByNotif', { by: msg.nick })}${tail}`);
          if (get().prefs.sound) blip();
          closedChannels.add(canon(ch));
          dropBuffer(ch);
          set({ profileUser: '', kicked: { channel: ch, by: msg.nick, reason, kind: 'kick' } });
        } else {
          // Someone else was kicked — drop them from the member list + a notice.
          patchBuffer(ch, (b) => {
            const members = { ...b.members }; delete members[target];
            return { ...b, members };
          });
          sysLine(ch, i18n.t('system.kick', { target, by: msg.nick }) + (reason ? ` (${reason})` : ''), 'system');
        }
        break;
      }
      case 'QUIT': {
        const s = get();
        for (const name of s.order) {
          if (s.buffers[name].members[msg.nick]) {
            patchBuffer(name, (b) => {
              const members = { ...b.members }; delete members[msg.nick];
              return { ...b, members };
            });
            if (!inQuietBatch(msg)) sysLine(name, i18n.t('system.quit', { nick: msg.nick }), 'quit', msg.nick, hostmask(msg));
          }
        }
        break;
      }
      case 'NICK': {
        const nn = msg.params[0];
        if (msg.nick === me) set({ nick: nn });
        const s = get();
        for (const name of s.order) {
          const b = s.buffers[name];
          if (b.members[msg.nick]) {
            patchBuffer(name, (bb) => {
              const members = { ...bb.members };
              members[nn] = { ...members[msg.nick], nick: nn };
              delete members[msg.nick];
              return { ...bb, members };
            });
            sysLine(name, i18n.t('system.nick', { nick: msg.nick, newnick: nn }), 'nick');
          }
        }
        break;
      }
      case 'CHGHOST': {
        // chghost: ":nick!olduser@oldhost CHGHOST <newuser> <newhost>" — the user's
        // ident/host changed. Update their user@host in every channel they share and
        // show an old→new system line (like MODE/TOPIC).
        const newUser = msg.params[0];
        const newHost = msg.params[1];
        const newId2 = `${newUser}@${newHost}`;
        const s = get();
        for (const name of s.order) {
          const m = s.buffers[name].members[msg.nick];
          if (!m) continue;
          // Prefer the member's tracked host as the "old" value; fall back to the
          // source prefix (which carries the pre-change user@host).
          const oldId = `${m.user || msg.user}@${m.host || msg.host}`;
          patchBuffer(name, (bb) => {
            const mm = bb.members[msg.nick];
            if (!mm) return bb;
            return { ...bb, members: { ...bb.members, [msg.nick]: { ...mm, user: newUser, host: newHost } } };
          });
          if (oldId !== newId2) sysLine(name, i18n.t('system.hostChange', { nick: msg.nick, old: oldId, new: newId2 }), 'system');
        }
        // Keep an open WHOIS/profile panel in sync.
        if (get().whois[msg.nick]) patchWhois(msg.nick, (w) => ({ ...w, user: newUser, host: newHost }));
        break;
      }
      case 'SETNAME': {
        // setname: ":nick!user@host SETNAME :<new realname>" — live realname change.
        const newReal = msg.params[0] ?? '';
        const s = get();
        for (const name of s.order) {
          if (s.buffers[name].members[msg.nick]) {
            patchBuffer(name, (bb) => {
              const m = bb.members[msg.nick];
              if (!m) return bb;
              return { ...bb, members: { ...bb.members, [msg.nick]: { ...m, realname: newReal } } };
            });
          }
        }
        if (get().whois[msg.nick]) patchWhois(msg.nick, (w) => ({ ...w, realname: newReal }));
        break;
      }
      case 'BATCH': {
        // :src BATCH +<ref> <type> [params…]  /  :src BATCH -<ref>
        const ref = msg.params[0] || '';
        const id = ref.slice(1);
        if (ref[0] === '+') {
          const type = msg.params[1] || '';
          // chathistory replays old messages → collect+prepend, don't append live.
          const quiet = type === 'netsplit' || type === 'netjoin';
          openBatches[id] = { type, quiet, target: msg.params[2] };
          if (type === 'chathistory') historyCollect[id] = [];
          else if (type === 'netsplit') serverLine(`📡 ${i18n.t('system.netsplit')}`, 'info');
          else if (type === 'netjoin') serverLine(`📡 ${i18n.t('system.netjoin')}`, 'info');
        } else if (ref[0] === '-') {
          const b = openBatches[id];
          if (b?.type === 'chathistory' && b.target) {
            const items = historyCollect[id] || [];
            const key = canon(b.target);
            // Prepend older messages, keep buffer ordered oldest→newest.
            // Dedup by id AND by a content signature: the legacy +H auto-replay and
            // our CHATHISTORY response deliver the SAME message with different ids
            // (+H carries no msgid → random id; CHATHISTORY carries the real msgid),
            // so id-only dedup would double every recent message. The signature
            // (kind+sender+second+text) matches them since both preserve the original
            // server-time and text.
            patchBuffer(b.target, (buf) => {
              const base = [...buf.messages];
              const sigIdx = new Map<string, number>();
              base.forEach((m, i) => sigIdx.set(msgSig(m), i));
              const haveId = new Set(base.map((m) => m.id));
              const seen = new Set<string>();
              const fresh: ChatMessage[] = [];
              for (const m of items) {
                const sig = msgSig(m);
                const at = sigIdx.get(sig);
                if (at !== undefined) {
                  // Same message already present (other replay source). Upgrade it to
                  // the copy that carries the real msgid so REDACT/react target it.
                  if (m.msgid && !base[at].msgid) base[at] = { ...base[at], id: m.id, msgid: m.msgid };
                  continue;
                }
                if (haveId.has(m.id) || seen.has(sig)) continue;
                seen.add(sig);
                fresh.push(m);
              }
              const merged = [...fresh, ...base].sort((a, z) => a.ts - z.ts);
              return { ...buf, messages: merged.slice(-1000) };
            });
            set({
              historyLoading: { ...get().historyLoading, [key]: false },
              historyDone: { ...get().historyDone, [key]: items.length === 0 },
            });
            delete historyCollect[id];
          } else if (b?.type === 'draft/multiline' && multilineCollect[id]) {
            // Merge the batch's lines into ONE message (concat = no newline).
            const { base, lines } = multilineCollect[id];
            if (lines.length) {
              let merged = lines[0].text;
              for (let i = 1; i < lines.length; i++) merged += (lines[i].concat ? '' : '\n') + lines[i].text;
              addMessage(base.bufferName, { ...base, text: merged });
            }
            delete multilineCollect[id];
          }
          delete openBatches[id];
        }
        break;
      }
      case 'ERROR': { // server is closing the link — show why
        const reason = msg.params[msg.params.length - 1] || i18n.t('system.serverErrorDefault');
        sysLine(SERVER, `⛔ ${i18n.t('system.serverError', { reason })}`, 'system');
        set({ serverError: reason });
        break;
      }
      case 'WALLOPS': { // :src WALLOPS :message — network-wide oper broadcast
        sysLine(SERVER, `📣 ${i18n.t('system.wallops', { nick: msg.nick, msg: msg.params[0] ?? '' })}`, 'info');
        if (get().prefs.sound) blip();
        break;
      }
      case 'KILL': { // :src KILL <target> :reason
        if (msg.params[0] === me) {
          const reason = msg.params[1] || '';
          sysLine(SERVER, `⛔ ${i18n.t('system.killed', { nick: msg.nick })}${reason ? ` : ${reason}` : ''}`, 'system');
          desktopNotify(i18n.t('system.killedTitle'), i18n.t('system.killedBody', { nick: msg.nick }));
        }
        break;
      }
      case 'INVITE': {
        // :<nick> INVITE <target> <channel>
        const target = msg.params[0];
        const chan = msg.params[1] ?? '';
        if (target === me) {
          sysLine(SERVER, `📨 ${i18n.t('system.inviteYou', { nick: msg.nick, chan })}`, 'info');
          if (isChannelName(get().active)) sysLine(get().active, `📨 ${i18n.t('system.inviteYou', { nick: msg.nick, chan })}`, 'info');
          desktopNotify(i18n.t('system.inviteTitle'), i18n.t('system.inviteYou', { nick: msg.nick, chan }));
          if (get().prefs.sound) blip();
        } else if (isChannelName(chan) && get().buffers[canon(chan)]) {
          // invite-notify: someone invited another user to a channel we're in.
          sysLine(chan, `📨 ${i18n.t('system.inviteOther', { nick: msg.nick, target })}`, 'info');
        }
        break;
      }
      case 'AWAY': {
        // away-notify: ":nick AWAY :<reason>" = away, ":nick AWAY" = back. Keeps
        // away state live in every common channel — no WHO poll needed.
        patchMemberEverywhere(msg.nick, { away: msg.params.length > 0 });
        break;
      }
      case 'ACCOUNT': {
        // account-notify: ":nick ACCOUNT <account>" ('*' = logged out). Live account
        // = live avatar; no WHOX re-poll.
        const acct = msg.params[0];
        const account = acct && acct !== '*' ? acct : undefined;
        patchMemberEverywhere(msg.nick, { account });
        if (msg.nick === me) set({ account: account ?? '' });
        break;
      }
      case 'TOPIC': { // :<nick> TOPIC <channel> :<new topic>
        const ch = msg.params[0];
        const topic = msg.params[1] ?? '';
        patchBuffer(ch, (b) => ({ ...b, topic }));
        // text = the new topic ('' = removed); from = who changed it. Rendered as
        // a tagged "sujet" line (like the MODE line) by MsgList.
        sysLine(ch, topic, 'topic', msg.nick);
        break;
      }
      case 'MODE': {
        const chan = msg.params[0];
        if (!isChannelName(chan)) {
          // User mode change. User modes are global per-user and take no params;
          // we only track our own (target === our nick).
          if (chan === me) {
            const change = msg.params[1] ?? '';
            const next = applyUserModes(get().umodes, change);
            set({ umodes: next });
            const named = change.replace(/[+-]/g, '').split('').map((c) => i18n.t(`umodes.${c}`, '')).filter(Boolean);
            serverLine(named.length
              ? i18n.t('system.yourModesNamed', { modes: next, change, names: named.join(', ') })
              : i18n.t('system.yourModes', { modes: next, change }));
          }
          break;
        }
        const client = get().client;
        const order = client?.prefixModes ?? '~&@%+';
        const ctx = buildModeContext(client?.isupport ?? {}, client?.prefixModeToChar ?? {});
        const changes = parseModeChanges(msg.params[1] ?? '', msg.params.slice(2), ctx);

        const banLines: string[] = []; // +b/-b shown as their own clear lines (like mIRC)
        let showCombined = false;      // any prefix/flag/param change → show the mode line

        for (const c of changes) {
          if (c.kind === 'prefix' && c.param && c.prefix) {
            // membership grant (+o/+v/…) → update that member's held prefixes
            showCombined = true;
            const sym = c.prefix;
            patchBuffer(chan, (b) => {
              const m = b.members[c.param!];
              if (!m) return b;
              const held = (m.prefixes ?? m.prefix ?? '').split('').filter((x) => x !== sym);
              if (c.add) held.push(sym);
              held.sort((a, z) => order.indexOf(a) - order.indexOf(z));
              const prefixes = held.join('');
              return { ...b, members: { ...b.members, [c.param!]: { ...m, prefixes, prefix: prefixes[0] ?? '' } } };
            });
          } else if (c.kind === 'list') {
            // type A list mode. A ban (+b/-b) gets its own clear lines + who it hits;
            // other list modes (+e/+I) ride along in the combined line.
            if (c.mode === 'b' && c.param) {
              const mask = c.param;
              banLines.push(c.add ? `🔨 ${i18n.t('system.banned', { nick: msg.nick, mask })}` : `♻️ ${i18n.t('system.unbanned', { nick: msg.nick, mask })}`);
              const members = get().buffers[canon(chan)]?.members ?? {};
              const hit = Object.values(members)
                .filter((m) => maskMatches(mask, `${m.nick}!${m.user || '*'}@${m.host || '*'}`))
                .map((m) => m.nick);
              if (hit.length) banLines.push(i18n.t(c.add ? 'system.bansAdded' : 'system.bansRemoved', { list: hit.join(', ') }));
            } else showCombined = true;
          } else {
            // type B/C param mode or type D flag → maintain the channel mode string
            showCombined = true;
            patchBuffer(chan, (b) => ({ ...b, ...applyChannelFlag(b.modes || '', b.modeParams || {}, c) }));
          }
        }

        for (const line of banLines) sysLine(chan, line, 'ban');
        // The combined mode line is shown for everything except a pure ban change
        // (those are already covered by the dedicated ban lines above).
        if (showCombined) {
          const argStr = msg.params.length > 2 ? ' ' + msg.params.slice(2).join(' ') : '';
          sysLine(chan, `${msg.params[1] ?? ''}${argStr}`, 'mode', msg.nick);
        }
        break;
      }
      case '332': // RPL_TOPIC
        ensureBuffer(msg.params[1]);
        patchBuffer(msg.params[1], (b) => ({ ...b, topic: msg.params[2] ?? '' }));
        break;
      case '353': { // RPL_NAMREPLY
        const ch = msg.params[2];
        ensureBuffer(ch);
        const prefixChars = get().client?.prefixModes ?? '@+';
        const adds: Record<string, Member> = {};
        for (const raw of (msg.params[3] ?? '').split(' ').filter(Boolean)) {
          let i = 0;
          while (i < raw.length && prefixChars.includes(raw[i])) i++;
          // userhost-in-names → token is prefix+nick!user@host; keep nick + user@host
          // (the user@host lets us tell who a ban mask hits).
          const full = raw.slice(i);
          const nick = full.split('!')[0];
          const bang = full.indexOf('!'), at = full.indexOf('@');
          const user = bang > -1 && at > bang ? full.slice(bang + 1, at) : undefined;
          const host = at > -1 ? full.slice(at + 1) : undefined;
          const prefixes = raw.slice(0, i); // all prefix symbols (multi-prefix), strongest-first
          adds[nick] = { nick, user, host, prefixes, prefix: prefixes[0] ?? '' };
        }
        patchBuffer(ch, (b) => ({ ...b, members: { ...b.members, ...adds } }));
        break;
      }
      case 'REDACT': {
        const ch = msg.params[0];
        const id = msg.params[1];
        patchBuffer(ch, (b) => ({
          ...b,
          messages: b.messages.map((m) => (m.id === id ? { ...m, redacted: true } : m)),
        }));
        break;
      }
      case 'MARKREAD': {
        const ch = msg.params[0];
        const arg = msg.params[1] ?? '';
        ensureBuffer(ch);
        if (arg.startsWith('timestamp=')) {
          const t = Date.parse(arg.slice('timestamp='.length));
          if (!Number.isNaN(t)) patchBuffer(ch, (b) => ({ ...b, readTs: t }));
        }
        break;
      }
      case 'TAGMSG': {
        const target = msg.params[0];
        const fromMe = msg.nick === me;

        // typing indicator (+typing client tag)
        const typing = msg.tags['+typing'] || msg.tags['+draft/typing'];
        if (typing && isChannelName(target) && !fromMe) {
          ensureBuffer(target);
          if (typing === 'done' || typing === 'paused') {
            patchBuffer(target, (b) => {
              const t = { ...b.typing }; delete t[msg.nick]; return { ...b, typing: t };
            });
          } else {
            const exp = Date.now() + 6000;
            patchBuffer(target, (b) => ({ ...b, typing: { ...b.typing, [msg.nick]: exp } }));
            setTimeout(() => patchBuffer(target, (b) => {
              if ((b.typing[msg.nick] ?? 0) <= Date.now()) {
                const t = { ...b.typing }; delete t[msg.nick]; return { ...b, typing: t };
              }
              return b;
            }), 6200);
          }
        }

        // reactions (draft/react on a draft/reply target)
        const reply = msg.tags['+draft/reply'];
        const react = msg.tags['+draft/react'];
        if (reply && react) {
          patchBuffer(target, (b) => ({
            ...b,
            messages: b.messages.map((m) => {
              if (m.id !== reply) return m;
              const reactions = [...(m.reactions ?? [])];
              const i = reactions.findIndex((r) => r.emoji === react);
              if (i === -1) {
                reactions.push({ emoji: react, count: 1, mine: fromMe });
              } else if (fromMe && reactions[i].mine) {
                // my second identical react = toggle off
                reactions[i] = { ...reactions[i], count: reactions[i].count - 1, mine: false };
                if (reactions[i].count <= 0) reactions.splice(i, 1);
              } else {
                reactions[i] = { ...reactions[i], count: reactions[i].count + 1, mine: reactions[i].mine || fromMe };
              }
              return { ...m, reactions };
            }),
          }));
        }
        break;
      }

      // ---- draft/account-registration structured replies ----
      case 'REGISTER': { // :server REGISTER <sub> <account> :<message>
        const sub = msg.params[0];
        const message = msg.params[msg.params.length - 1] ?? '';
        if (sub === 'VERIFICATION_REQUIRED') {
          set({ reg: { step: 'code', account: get().reg.account || msg.params[1] || '', busy: false, error: '', info: message, challengeUrl: '' } });
        } else if (sub === 'SUCCESS') {
          set({ reg: { ...get().reg, step: 'done', busy: false, error: '', info: message } });
        }
        break;
      }
      case 'VERIFY': { // :server VERIFY <sub> <account> :<message>
        const sub = msg.params[0];
        const message = msg.params[msg.params.length - 1] ?? '';
        if (sub === 'SUCCESS') {
          set({ reg: { ...get().reg, step: 'done', busy: false, error: '', info: message } });
        }
        break;
      }
      // IRCv3 standard-replies: "<FAIL|WARN|NOTE> <command> <code> [<context>…] :<description>"
      case 'FAIL':
      case 'WARN':
      case 'NOTE': {
        const cmd = msg.params[0];
        const code = msg.params[1] || '';
        const desc = msg.params.length > 2 ? msg.params[msg.params.length - 1] : '';
        // REGISTER/VERIFY failures drive the account UI (not a console line).
        if (msg.command === 'FAIL' && (cmd === 'REGISTER' || cmd === 'VERIFY')) {
          set({ reg: { ...get().reg, busy: false, error: desc || 'Échec.' } });
          break;
        }
        // Otherwise surface it where the user is looking: FAIL/WARN as a ⚠ line,
        // NOTE as an info callout. Label with the command + code when present.
        const tag = cmd && cmd !== '*' ? `${cmd}${code && code !== '*' ? ` (${code})` : ''} — ` : '';
        const dest = isChannelName(get().active) ? get().active : SERVER;
        if (msg.command === 'NOTE') {
          sysLine(dest, `ℹ️ ${tag}${desc}`, 'info');
        } else {
          sysLine(dest, `⚠ ${tag}${desc}`, 'system');
          if (msg.command === 'FAIL' && get().prefs.sound) blip();
        }
        break;
      }
    }
  }

  return {
    status: 'idle',
    nick: '',
    buffers: {},
    order: [],
    active: '',
    client: null,
    networkIcon: getConfig().branding.icon,
    account: '',
    umodes: '',
    serverName: '',
    serverError: '',
    reconnectIn: 0,
    everRegistered: false,
    autoConnecting: false,
    historyLoading: {},
    historyDone: {},
    away: false,
    friends: loadFriends(),
    friendsOnline: {},
    banlists: {},
    notifyLevel: loadNotify(),
    highlightWords: loadStr(HIGHLIGHT_KEY),
    drafts: {},
    reg: { step: 'idle', account: '', busy: false, error: '', info: '', challengeUrl: '' },
    replyTarget: null,
    search: '',
    ignored: loadIgnored(),
    channels: [],
    listLoading: false,
    prefs: getPrefs(),
    profileUser: '',
    whois: {},
    pmContext: {},
    modal: '',
    reportSubject: '',
    kicked: null,

    connect(opts) {
      const client = new IrcClient();
      initNotify();
      set({ client, nick: opts.nick, status: 'connecting' });
      client.on('status', (st) => {
        set({ status: st as ChatState['status'], nick: client.nick });
        // Once we leave 'connecting' (registered, or an auth/connection failure),
        // a handoff is no longer in flight: drop the splash so failures fall back
        // to the join form (with the nick/channel still prefilled from the URL).
        if (st !== 'connecting') set({ autoConnecting: false });
        if (st === 'registered') {
          const wasReconnect = get().everRegistered;
          set({ reconnectIn: 0, serverError: '', everRegistered: true, friendsOnline: {} });
          // Ask the server for our current user modes (RPL_UMODEIS/221) so the
          // Status title can show them mIRC-style, even if the ircd didn't
          // volunteer an initial MODE line.
          client.queryUserModes();
          // Watch our friends via MONITOR (server pushes 730/731 on presence change).
          const fr = get().friends;
          if (fr.length) client.monitor('+', fr.join(','));
          // On a RECONNECT, rejoin every channel we still have open (the client
          // only auto-joins the initial set; this restores ones joined later).
          if (wasReconnect) {
            const s = get();
            for (const name of s.order) {
              const b = s.buffers[name];
              if (b?.isChannel && !closedChannels.has(name)) client.join(b.name);
            }
          }
          // network icon from the server's draft/ICON ISUPPORT token (else Tchatou favicon)
          const icon = client.isupport['draft/ICON'] || client.isupport['ICON'];
          if (icon) set({ networkIcon: icon });
        }
      });
      client.on('reconnecting', (secs) => {
        set({ reconnectIn: secs as number });
        sysLine(SERVER, `🔌 Connexion perdue — nouvelle tentative dans ${secs}s…`, 'system');
      });
      client.on('message', (m) => handle(m as IrcMessage));
      client.connect(opts);
    },

    openQuery(nick, fromChannel) {
      if (!nick || isChannelName(nick)) return;
      ensureBuffer(nick);
      // Record the channel this DM was started from (+draft/channel-context).
      if (fromChannel && isChannelName(fromChannel)) {
        const s = get();
        set({ pmContext: { ...s.pmContext, [canon(nick)]: fromChannel } });
      }
      get().setActive(nick);
    },

    openUser(nick) {
      if (!nick) return;
      const s = get();
      set({ profileUser: nick, whois: { ...s.whois, [nick]: { nick, loading: true } } });
      s.client?.whois(nick);
    },

    // Re-query WITHOUT clearing the displayed data (no flash) — channels dedup via Set.
    refreshUser(nick) {
      if (!nick) return;
      const s = get();
      const cur = s.whois[nick];
      if (!cur) { s.openUser(nick); return; }
      // Reset the fields that a WHOIS response REBUILDS by appending across its
      // lines (319 channels, 320 special) so repeated refreshes don't accumulate
      // / duplicate them; keep the rest visible so there's no flash.
      set({ whois: { ...s.whois, [nick]: { ...cur, loading: true, channels: '', special: [] } } });
      s.client?.whois(nick);
    },

    closeBuffer(name) {
      const key = canon(name);
      if (key === SERVER) return; // the console can't be closed
      const buf = get().buffers[key];
      if (!buf) return;
      if (buf.isChannel) { closedChannels.add(key); if (buf.joined) get().client?.part(buf.name); } // leave + don't resurrect
      dropBuffer(key);
      set({ profileUser: '' });
    },

    closeProfile() { set({ profileUser: '' }); },
    setModal(m) { set({ modal: m }); },

    // draft/chathistory: load older messages above what's shown (scroll-up).
    loadMoreHistory(name) {
      const key = canon(name);
      const s = get();
      if (s.historyLoading[key] || s.historyDone[key]) return;
      const client = s.client;
      const buf = s.buffers[key];
      if (!client || !buf || !client.hasCap('draft/chathistory')) return;
      // anchor on the oldest real message currently shown
      const oldest = buf.messages.find((m) => m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice');
      if (!oldest) return;
      set({ historyLoading: { ...s.historyLoading, [key]: true } });
      client.chathistoryBefore(buf.name, new Date(oldest.ts).toISOString(), 50);
      // safety: clear the spinner if the server never answers.
      setTimeout(() => set({ historyLoading: { ...get().historyLoading, [key]: false } }), 8000);
    },

    setAway(reason) {
      get().client?.setAway(reason);
      set({ away: !!reason });
    },

    addFriend(nick) {
      const n = nick.trim();
      if (!n) return;
      const cur = get().friends;
      if (cur.some((f) => f.toLowerCase() === n.toLowerCase())) return;
      const next = [...cur, n];
      saveFriends(next);
      set({ friends: next });
      get().client?.monitor('+', n); // start watching
    },

    removeFriend(nick) {
      const next = get().friends.filter((f) => f.toLowerCase() !== nick.toLowerCase());
      saveFriends(next);
      const online = { ...get().friendsOnline }; delete online[nick.toLowerCase()];
      set({ friends: next, friendsOnline: online });
      get().client?.monitor('-', nick);
    },

    loadBanList(channel) {
      const key = canon(channel);
      set({ banlists: { ...get().banlists, [key]: [] } }); // reset; 367 fills it
      get().client?.modeList(channel, 'b');
    },
    setChannelMode(channel, mode, add) {
      get().client?.setChannelMode(channel, mode, add);
    },
    removeBan(channel, mask) {
      get().client?.unban(channel, mask);
    },

    setNotifyLevel(name, level) {
      const key = canon(name);
      const next = { ...get().notifyLevel };
      // 'mentions' is the default → store nothing, keeping the map small.
      if (level === 'mentions') delete next[key]; else next[key] = level;
      saveNotify(next);
      set({ notifyLevel: next });
    },
    setHighlightWords(words) {
      const clean = words.map((w) => w.trim()).filter(Boolean);
      saveStr(HIGHLIGHT_KEY, clean);
      set({ highlightWords: clean });
    },
    setDraft(name, text) {
      const key = canon(name);
      const drafts = { ...get().drafts };
      if (text) drafts[key] = text; else delete drafts[key];
      set({ drafts });
    },
    dismissKick() { set({ kicked: null }); },
    rejoinKicked() {
      const k = get().kicked;
      if (!k) return;
      closedChannels.delete(canon(k.channel));
      get().client?.join(k.channel);
      get().setActive(k.channel);
      set({ kicked: null });
    },

    setActive(name) {
      ensureBuffer(name);
      const key = canon(name);
      set({ profileUser: '', replyTarget: null, search: '' });
      const prev = get().active;
      // Mark the buffer we're leaving as read (advances its read-marker).
      if (prev && prev !== key) {
        const pb = get().buffers[prev];
        if (pb && pb.messages.length) {
          const latest = pb.messages[pb.messages.length - 1].ts;
          if (latest > pb.readTs) {
            get().client?.markRead(pb.name, new Date(latest).toISOString());
            patchBuffer(prev, (b) => ({ ...b, readTs: latest }));
          }
        }
      }
      patchBuffer(key, (b) => ({ ...b, unread: 0, highlight: false }));
      set({ active: key });
    },
    markAllRead() {
      const s = get();
      // Advance the server-side read marker for every buffer with new messages…
      for (const name of s.order) {
        const b = s.buffers[name];
        if (b?.messages.length) {
          const latest = b.messages[b.messages.length - 1].ts;
          if (latest > b.readTs) s.client?.markRead(b.name, new Date(latest).toISOString());
        }
      }
      // …then clear unread/highlight everywhere in one update.
      set((st) => {
        const buffers: typeof st.buffers = {};
        for (const [name, b] of Object.entries(st.buffers)) {
          const latest = b.messages.length ? b.messages[b.messages.length - 1].ts : b.readTs;
          buffers[name] = { ...b, unread: 0, highlight: false, readTs: Math.max(b.readTs, latest) };
        }
        return { buffers };
      });
    },

    notifyTyping() {
      const { client, active } = get();
      if (!client || !active || !isChannelName(active)) return;
      const now = Date.now();
      if (now - lastTypingSent > 3000) { lastTypingSent = now; client.sendTyping(active, 'active'); }
    },

    sendInput(text) {
      const { client, active } = get();
      if (!client || !active || !text.trim()) return;

      // Detect /commands from the FORMATTING-STRIPPED text: "sticky" bold/italic
      // etc. can prefix the line with a control byte, which would otherwise hide
      // the leading '/' and send the command as a plain (formatted) message.
      const cmdline = stripFormatting(text).trimStart();

      // The Console buffer is a raw IRC command line (leading '/' optional).
      if (active === SERVER) {
        const raw = cmdline.startsWith('/') ? cmdline.slice(1) : cmdline;
        if (!raw.trim()) return;
        sysLine(SERVER, `» ${raw}`, 'system');
        client.send(raw);
        return;
      }

      if (cmdline.startsWith('/')) {
        const [cmd, ...rest] = cmdline.slice(1).split(' ');
        const arg = rest.join(' ');
        switch (cmd.toLowerCase()) {
          case 'me': client.action(active, arg); break;
          case 'join': client.join(arg); get().setActive(arg.split(' ')[0]); break;
          case 'part': client.part(active); break;
          case 'nick': client.setNick(arg); break;
          case 'whois': get().openUser(arg.trim().split(' ')[0] || active); break;
          case 'msg': {
            const [t, ...m] = rest; const body = m.join(' ');
            if (!t || !body) break;
            client.privmsg(t, body);
            // Optimistic echo (masked for services) so the user sees feedback.
            if (!client.hasCap('echo-message')) {
              const dest = isChannelName(t) ? t : t;
              addMessage(dest, {
                id: newId(), bufferName: dest, from: get().nick,
                text: isService(t) ? maskSecret(body) : body,
                ts: Date.now(), kind: 'privmsg', self: true,
              });
            }
            break;
          }
          case 'notice': {
            const [t, ...m] = rest;
            const body = m.join(' ');
            if (!t || !body) break;
            client.send(`NOTICE ${t} :${body}`);
            // No optimistic echo if the server will echo it back to us.
            if (!client.hasCap('echo-message')) {
              const dest = isChannelName(t) ? t : (active || SERVER);
              addMessage(dest, {
                id: newId(), bufferName: dest, from: get().nick,
                text: isChannelName(t) ? body : `→ ${t} : ${body}`,
                ts: Date.now(), kind: 'notice', self: true,
              });
            }
            break;
          }
          case 'topic': if (isChannelName(active)) client.setTopic(active, arg); break;
          case 'kick': { const [t, ...r] = rest; if (isChannelName(active) && t) client.kick(active, t, r.join(' ')); break; }
          case 'op': if (isChannelName(active) && arg) client.setUserMode(active, 'o', true, arg.trim()); break;
          case 'deop': if (isChannelName(active) && arg) client.setUserMode(active, 'o', false, arg.trim()); break;
          case 'voice': if (isChannelName(active) && arg) client.setUserMode(active, 'v', true, arg.trim()); break;
          case 'ignore': if (arg.trim()) get().toggleIgnore(arg.trim()); break;
          case 'unignore': if (arg.trim()) get().toggleIgnore(arg.trim()); break;
          case 'list': get().refreshChannels(); get().setModal('explore'); break; // open the Explore window
          default: client.send(cmdline.slice(1)); // raw passthrough (formatting stripped)
        }
        return;
      }
      // Credential safety: a services command typed without the leading slash
      // (e.g. "IDENTIFY nick pass" in a channel) would broadcast the password to
      // everyone. Catch it, send it to the service privately, and warn — unless
      // we're already in that service's window. Use the stripped text so sticky
      // formatting can't smuggle the password past the guard.
      const leak = detectServiceLeak(cmdline);
      if (leak && !isService(active)) {
        client.privmsg(leak.service, leak.command);
        sysLine(active,
          i18n.t('security.leakGuard', { channel: active, service: leak.service }),
          'warning');
        ensureBuffer(leak.service);
        if (!client.hasCap('echo-message')) {
          addMessage(leak.service, {
            id: newId(), bufferName: leak.service, from: get().nick,
            text: maskSecret(leak.command), ts: Date.now(), kind: 'privmsg', self: true,
          });
        }
        return;
      }

      const reply = get().replyTarget;
      // +draft/channel-context: on a DM that was started from a channel, tag it.
      const ctx = !isChannelName(active) ? get().pmContext[canon(active)] : undefined;
      if (reply) { client.privmsgReply(active, text, reply.id, ctx); set({ replyTarget: null }); }
      else client.privmsg(active, text, ctx);
      if (isChannelName(active)) { client.sendTyping(active, 'done'); lastTypingSent = 0; }
      // Optimistic echo only if the server won't echo it back to us.
      if (!client.hasCap('echo-message')) {
        addMessage(active, {
          id: newId(), bufferName: active, from: get().nick,
          text: isService(active) ? maskSecret(text) : text,
          ts: Date.now(), kind: 'privmsg', self: true, replyTo: reply?.id, channelContext: ctx,
        });
      }
    },

    setReplyTarget(id) {
      const b = get().buffers[get().active];
      const m = b?.messages.find((x) => x.id === id);
      if (m) set({ replyTarget: { id, from: m.from, text: m.text.slice(0, 120) } });
    },
    clearReply() { set({ replyTarget: null }); },
    setSearch(q) { set({ search: q }); },

    toggleIgnore(nick) {
      const lc = nick.toLowerCase();
      const cur = get().ignored;
      const next = cur.some((n) => n.toLowerCase() === lc)
        ? cur.filter((n) => n.toLowerCase() !== lc)
        : [...cur, nick];
      saveIgnored(next);
      set({ ignored: next });
    },
    modKick(nick) { const { client, active } = get(); if (isChannelName(active)) client?.kick(active, nick); },
    modBan(nick) {
      const { client, active } = get();
      if (!isChannelName(active)) return;
      const m = get().buffers[active]?.members[nick];
      // Ban by host if known (host bans survive nick changes), else by nick.
      const host = get().whois[nick]?.host;
      client?.ban(active, host ? `*!*@${host}` : `${nick}!*@*`);
      if (m) client?.kick(active, nick, 'banni');
    },
    modSetMode(nick, mode, add) { const { client, active } = get(); if (isChannelName(active)) client?.setUserMode(active, mode, add, nick); },
    modTopic(topic) { const { client, active } = get(); if (isChannelName(active)) client?.setTopic(active, topic); },
    reportUser(nick) {
      set({ reportSubject: nick, modal: 'report' });
    },
    sendReport(target, reason) {
      const { client, active } = get();
      const t = target.trim();
      const r = reason.trim();
      if (!client || !t) return;
      const { service, target: channel } = getConfig().report;
      const where = (active && active !== SERVER) ? active : '';
      if (service) {
        // ReportServ queues "REPORT <target> <reason>" for staff and is not
        // blocked by a +n staff channel the reporter isn't a member of.
        const ctx = where ? ` (dans ${where})` : '';
        client.privmsg(service, `REPORT ${t} ${r}${ctx}`);
      } else {
        client.privmsg(channel, `⚠ Signalement : ${t}${where ? ` (dans ${where})` : ''} par ${get().nick} — ${r}`);
      }
      sysLine(SERVER, i18n.t('system.reportFiled', { target: t }), 'system');
    },
    refreshChannels() {
      set({ channels: [], listLoading: true });
      get().client?.list();
    },

    toggleReaction(msgid, emoji) {
      const { client, active } = get();
      client?.react(active, msgid, emoji);
    },

    redact(msgid) {
      const { client, active } = get();
      client?.redact(active, msgid);
    },

    async uploadImage(file) {
      const { client, active } = get();
      if (!client || !active || active === SERVER) return;
      if (!file.type.startsWith('image/')) { sysLine(active, `⚠ ${i18n.t('system.onlyImages')}`, 'system'); return; }
      if (file.size > 16 * 1024 * 1024) { sysLine(active, `⚠ ${i18n.t('system.imageTooLarge')}`, 'system'); return; }

      sysLine(active, `📤 ${i18n.t('system.sendingImage', { name: file.name })}`, 'system');
      try {
        // 1) Ask the server for a one-time upload token via /FILEHOST.
        const token = await new Promise<string>((resolve, reject) => {
          filehostResolve = resolve; filehostReject = reject;
          filehostTimer = setTimeout(() => { filehostResolve = null; filehostReject = null; reject(new Error('timeout')); }, 10000);
          client.send('FILEHOST');
        });
        // 2) Upload the file to the Tchatou filehost (same origin as the app).
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/upload?token=${encodeURIComponent(token)}`, { method: 'POST', body: fd });
        if (!res.ok) {
          let detail = `http_${res.status}`;
          try { const j = await res.json(); if (j?.detail) detail = `${res.status}:${j.detail}`; } catch { /* ignore */ }
          throw new Error(detail);
        }
        const data = await res.json() as { url: string };
        // 3) Share it as a CTCP ACTION so it reads as an action everywhere —
        //    "* Mik 📷 partage une image : <url>" (mIRC/irssi etc.); web renders the card.
        const caption = `📷 ${i18n.t('system.shareImage', { url: data.url })}`;
        client.action(active, caption);
        if (!client.hasCap('echo-message')) {
          addMessage(active, { id: newId(), bufferName: active, from: get().nick, text: caption, ts: Date.now(), kind: 'action', self: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isPolicyHit = msg.includes('nsfw_image') || msg.includes('violent_image')
          || msg.includes('infected') || msg.includes('scanner_unavailable');
        const human = msg === 'not_identified'
          ? i18n.t('system.uploadNeedAccount')
          : msg === 'timeout' ? i18n.t('system.uploadTimeout')
          : msg.includes('scanner_unavailable') ? i18n.t('system.uploadAvDown')
          : msg.includes('nsfw_image') ? i18n.t('system.uploadNsfw')
          : msg.includes('violent_image') ? i18n.t('system.uploadViolent')
          : msg.includes('infected') ? i18n.t('system.uploadInfected')
          : i18n.t('system.uploadFailed', { msg });
        if (isPolicyHit) {
          sysLine(active, `\x01ALERT\x01${human}`, 'system');
        } else {
          sysLine(active, `⚠ ${human}`, 'system');
        }
      }
    },

    // Surface a one-off system line in a buffer (used by UI for local hints).
    pushSystem(buffer, text) { sysLine(buffer || get().active, text, 'system'); },

    // Voice message: a recorded audio blob, uploaded via the same /FILEHOST flow
    // as images and shared as an action; other clients render an inline player.
    async uploadAudio(blob, ext) {
      const { client, active } = get();
      if (!client || !active || active === SERVER) return;
      if (blob.size > 16 * 1024 * 1024) { sysLine(active, `⚠ ${i18n.t('system.imageTooLarge')}`, 'system'); return; }

      sysLine(active, `📤 ${i18n.t('system.sendingVoice')}`, 'system');
      try {
        const token = await new Promise<string>((resolve, reject) => {
          filehostResolve = resolve; filehostReject = reject;
          filehostTimer = setTimeout(() => { filehostResolve = null; filehostReject = null; reject(new Error('timeout')); }, 10000);
          client.send('FILEHOST');
        });
        const fd = new FormData();
        fd.append('file', new File([blob], `voice.${ext}`, { type: blob.type || 'audio/webm' }));
        const res = await fetch(`/upload?token=${encodeURIComponent(token)}`, { method: 'POST', body: fd });
        if (!res.ok) {
          let detail = `http_${res.status}`;
          try { const j = await res.json(); if (j?.detail) detail = `${res.status}:${j.detail}`; } catch { /* ignore */ }
          throw new Error(detail);
        }
        const data = await res.json() as { url: string };
        const caption = `🎤 ${i18n.t('system.shareVoice', { url: data.url })}`;
        client.action(active, caption);
        if (!client.hasCap('echo-message')) {
          addMessage(active, { id: newId(), bufferName: active, from: get().nick, text: caption, ts: Date.now(), kind: 'action', self: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const isPolicyHit = msg.includes('nsfw_image') || msg.includes('violent_image')
          || msg.includes('infected') || msg.includes('scanner_unavailable');
        const human = msg === 'not_identified'
          ? i18n.t('system.uploadNeedAccount')
          : msg === 'timeout' ? i18n.t('system.uploadTimeout')
          : msg.includes('scanner_unavailable') ? i18n.t('system.uploadAvDown')
          : msg.includes('nsfw_image') ? i18n.t('system.uploadNsfw')
          : msg.includes('violent_image') ? i18n.t('system.uploadViolent')
          : msg.includes('infected') ? i18n.t('system.uploadInfected')
          : i18n.t('system.uploadFailed', { msg });
        if (isPolicyHit) {
          sysLine(active, `\x01ALERT\x01${human}`, 'system');
        } else {
          sysLine(active, `⚠ ${human}`, 'system');
        }
      }
    },

    // ---- account management (draft/account-registration) ----
    accountRegister(account, email, password) {
      const { client } = get();
      if (!client) return;
      set({ reg: { step: 'idle', account, busy: true, error: '', info: '', challengeUrl: '' } });
      client.register(account, email, password);
    },
    accountVerify(code) {
      const { client, reg } = get();
      if (!client || !reg.account) return;
      set({ reg: { ...reg, busy: true, error: '' } });
      client.verify(reg.account, code);
    },
    accountResend() {
      const { client, reg } = get();
      if (!client || !reg.account) return;
      set({ reg: { ...reg, error: '', info: i18n.t('reg.codeResent') } });
      client.resend(reg.account);
    },
    // Change the account password via Django (same-origin proxy → swaygo). The
    // server updates BOTH Anope (IRC login) AND Django (website) so they never
    // drift — NOT a raw NickServ SET PASSWORD, which would only touch Anope.
    async accountChangePassword(currentPassword, newPassword) {
      const account = get().account;
      if (!account) return { ok: false, message: i18n.t('reg.needAccount') };
      try {
        const res = await fetch('/accounts/api/change_password/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account, current_password: currentPassword, new_password: newPassword }),
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (data.status === 'success') {
          return { ok: true, message: (data.message as string) || i18n.t('reg.passwordUpdated') };
        }
        return { ok: false, message: (data.message as string) || i18n.t('reg.passwordChangeFailed') };
      } catch {
        return { ok: false, message: i18n.t('reg.serviceUnavailable') };
      }
    },
    // Native Turnstile solved in-app → tell Django (same-origin via the
    // /cloudflare/ nginx proxy). On success Django auto-finishes the pending
    // REGISTER and e-mails the verification code.
    async accountChallengeComplete(turnstileToken) {
      const reg = get().reg;
      let jwt = '';
      try { jwt = new URL(reg.challengeUrl).searchParams.get('token') || ''; } catch { /* bad url */ }
      set({ reg: { ...reg, busy: true, error: '' } });
      try {
        const res = await fetch('/cloudflare/verify_complete/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: jwt, verification_method: 'turnstile', turnstile_token: turnstileToken }),
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (res.ok && data.success) {
          set({ reg: { ...get().reg, busy: false, challengeUrl: '', error: '',
            info: data.registration === 'sent'
              ? `✅ ${i18n.t('reg.challengeOkSent')}`
              : `✅ ${i18n.t('reg.challengeOkCheck')}` } });
        } else {
          set({ reg: { ...get().reg, busy: false,
            error: (data.message as string) || i18n.t('reg.challengeFail') } });
        }
      } catch {
        set({ reg: { ...get().reg, busy: false, error: i18n.t('reg.challengeUnreachable') } });
      }
    },
    resetReg() {
      set({ reg: { step: 'idle', account: '', busy: false, error: '', info: '', challengeUrl: '' } });
    },
    setPref(key, value) {
      const prefs = { ...get().prefs, [key]: value };
      savePrefs(prefs);
      applyPrefs(prefs);
      set({ prefs });
    },
  };
});
