import { create } from 'zustand';
import i18n from './i18n';
import { IrcClient } from './irc/client';
import { initNotify } from '../platform/notify';
import { getPrefs, savePrefs, applyPrefs, type Prefs } from '../ui/prefs';
import type { Buffer, ConnectOptions, WhoisInfo, MessageKind } from './irc/types';
import { getConfig } from './config';
import { HIGHLIGHT_KEY, loadStr, saveStr, loadIgnored, saveIgnored, loadFriends, saveFriends, loadNotify, saveNotify, loadPins, savePins, togglePinIn, unpinIn, type NotifyLevel, type Pin } from './store/persistence';
import { SERVER, canon, isChannelName, resetBatches, newId } from './store/context';
export { SERVER } from './store/context';
import { makeHelpers } from './store/helpers';
import { makeHandler } from './store/handler';
import { makeCommands } from './store/commands';
import { makeUpload } from './store/upload';
import { makeAccount } from './store/account';
import { fetchProfileGecos } from '../platform/profile-gecos';



// Pending /FILEHOST token request (resolved when the server NOTICEs the upload URL).
const filehost: { resolve: ((token: string) => void) | null; reject: ((err: Error) => void) | null; timer: ReturnType<typeof setTimeout> | null } = { resolve: null, reject: null, timer: null };




export type Modal = '' | 'join' | 'settings' | 'explore' | 'friends' | 'chanadmin' | 'report' | 'switcher' | 'shortcuts' | 'cban' | 'moderated';
export interface ChannelInfo { name: string; users: number; topic: string }
export interface KickInfo {
  channel: string;
  by: string;
  reason: string;
  /** kick = expelled; ban = join refused; moderated = +m without voice; mute = can't send (ban/quiet). */
  kind: 'kick' | 'ban' | 'mute' | 'moderated';
}

export interface ServiceAlert {
  from: string;
  text: string;
  ts: number;
}

export interface ChatState {
  status: 'idle' | 'connecting' | 'registered' | 'closed' | 'error' | 'sasl-failed';
  nick: string;
  buffers: Record<string, Buffer>;
  order: string[];
  active: string;
  isActive: boolean;      // is this the network the user is currently viewing (registry-managed)
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
  exceptlists: Record<string, { mask: string; by: string; ts: number }[]>; // +e ban exceptions
  invexlists: Record<string, { mask: string; by: string; ts: number }[]>;  // +I invite exceptions
  loadBanList: (channel: string) => void;
  setChannelMode: (channel: string, mode: string, add: boolean) => void;
  setChannelModeParam: (channel: string, mode: string, add: boolean, param?: string) => void;
  removeBan: (channel: string, mask: string) => void;
  notifyLevel: Record<string, NotifyLevel>; // canon key → 'all' | 'mentions' | 'mute' (absent = 'mentions')
  setNotifyLevel: (name: string, level: NotifyLevel) => void;
  markAllRead: () => void;
  markReadHere: () => void;
  highlightWords: string[];    // extra words (besides your nick) that trigger a highlight
  setHighlightWords: (words: string[]) => void;
  drafts: Record<string, string>; // buffer key → unsent composer text
  setDraft: (name: string, text: string) => void;
  pins: Record<string, Pin[]>; // canon key → pinned messages (newest first), client-local
  togglePin: (msgid: string) => void;
  unpin: (channel: string, id: string) => void;
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
  cban: { channel: string; reason: string } | null; // CBANed-join details for the cban window
  kicked: KickInfo | null; // last time we got kicked — drives the dismissible toast
  nickServAlert: ServiceAlert | null; // incoming NickServ notice — centered popup
  pmContext: Record<string, string>; // canon(nick) → channel this DM relates to (+draft/channel-context)

  connect: (opts: ConnectOptions) => void;
  setActive: (name: string) => void;
  openQuery: (nick: string, fromChannel?: string) => void;
  closeBuffer: (name: string) => void;
  openUser: (nick: string) => void;
  refreshUser: (nick: string) => void;
  whoisText: (nick: string) => void;
  closeProfile: () => void;
  setModal: (m: Modal) => void;
  dismissKick: () => void;
  rejoinKicked: () => void;
  dismissNickServAlert: () => void;
  openStatusFromNickServAlert: () => void;
  sendInput: (text: string) => void;
  setReplyTarget: (id: string) => void;
  clearReply: () => void;
  setSearch: (q: string) => void;
  toggleIgnore: (nick: string) => void;
  modKick: (nick: string, reason?: string) => void;
  modBan: (nick: string) => void;
  modBanOnly: (nick: string) => void;
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
  /** Local-only line in a buffer (plugins) — does not send IRC. Default kind: privmsg. */
  pushLocal: (buffer: string, text: string, from?: string, kind?: MessageKind) => void;
  accountRegister: (account: string, email: string, password: string) => void;
  accountVerify: (code: string) => void;
  accountResend: () => void;
  accountChangePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; message: string }>;
  accountChallengeComplete: (turnstileToken: string) => void;
  resetReg: () => void;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
}

// A chat store is created PER NETWORK (multi-network) — each owns its own
// connection, buffers, nick and per-instance throttles. `useChat` below is the
// primary (default) network; additional ones come from the networks registry.
export function createChatStore(ns = '') {
  let lastTypingSent = 0;
  const closedChannels = new Set<string>(); // channels the user explicitly closed — not auto-resurrected
  const knownServices = new Set<string>(); // canon nicks the server tagged as services
  const namesInFlight = new Set<string>(); // channels currently receiving a NAMES (353…366) burst
  // Soft cache of GECOS/account across reconnect nicklist clears (until WHOX refills).
  const profileCache = new Map<string, { realname?: string; account?: string }>();
  const lastCantSend: Record<string, number> = {}; // throttle the "you can't write here" notice per channel
  const lastAwayNotice: Record<string, number> = {}; // throttle the "X is away" notice per query
  const store = create<ChatState>((set, get) => {
  // Buffer/message helpers live in store/helpers.ts.
  const helpers = makeHelpers(set, get, closedChannels);
  const { ensureBuffer, patchBuffer, dropBuffer, sysLine, addMessage } = helpers;
  const readMarkSent: Record<string, number> = {}; // throttle server MARKREAD per buffer

  const handle = makeHandler({ set, get, helpers, closedChannels, knownServices, lastCantSend, lastAwayNotice, filehost, namesInFlight, profileCache });
  // Outgoing input/slash-command parser lives in store/commands.ts.
  const { sendInput } = makeCommands({ get, set, helpers, resetTyping: () => { lastTypingSent = 0; } });
  const { uploadImage, uploadAudio } = makeUpload({ get, filehost, helpers });
  const { accountRegister, accountVerify, accountResend, accountChangePassword, accountChallengeComplete, resetReg } = makeAccount({ get, set });

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
    exceptlists: {},
    invexlists: {},
    notifyLevel: loadNotify(ns),
    highlightWords: loadStr(HIGHLIGHT_KEY),
    drafts: {},
    pins: loadPins(ns),
    isActive: true, // is this network the one the user is currently viewing (set by the registry)
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
    cban: null,
    kicked: null,
    nickServAlert: null,

    connect(opts) {
      // Retrying after a failed/closed attempt re-enters connect() on the same
      // store; tear down the previous client first so it can't keep reconnecting
      // in the background and process every inbound line a second time.
      get().client?.disconnect();
      // Ident (the "user" in nick!user@host): logged-in members authenticate over
      // SASL (a password is present) and show their own nick; guests show the
      // configured guest ident. IRC idents are ASCII-only, so accents are folded.
      if (!opts.username) {
        // IRC idents are ASCII [A-Za-z0-9._-]; fold accents (Invité->Invite), cap 10.
        const ident = (v: string, fb: string) =>
          (v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9._-]/g, '').slice(0, 10) || fb;
        const guest = ident(getConfig().server.guestIdent || 'Invité', 'Invite');
        // Authenticated members (SASL password or a passkey) show their own nick as
        // the ident; guests show the configured guest ident.
        opts.username = (opts.password || opts.passkey) ? ident(opts.nick, guest) : guest;
      }
      // Prefer SASL SCRAM-SHA-256 (the password never goes on the wire) for a real
      // account password — never for a one-time keycard (SCRAM can't verify a token)
      // or a passkey — when the deployment enables it. Registration falls back to
      // PLAIN if SCRAM isn't offered or fails.
      if (opts.scram === undefined && opts.password && !opts.keycard && !opts.passkey
          && getConfig().features.saslScram) {
        opts.scram = true;
      }
      // Site JWT handoff: prefer SASL OAUTHBEARER when the deployment asks for it
      // (EntreNous). Falls back to PLAIN if the ircd does not advertise OAUTHBEARER.
      if (opts.oauthBearer === undefined && opts.password && opts.keycard
          && getConfig().features.saslOauthBearer) {
        opts.oauthBearer = true;
      }
      // EntreNous / site JWT: refresh the Bearer before every (re)registration so a
      // tab reload or WS drop does not reuse an expired handoff token.
      // GECOS may also arrive here (chat_resume prefers WP); resolveRealname below
      // re-fetches profile_gecos so USER always has ASL before NICK/USER.
      if (opts.oauthBearer && !opts.refreshBearer) {
        opts.refreshBearer = async () => {
          try {
            const ctrl = new AbortController();
            const to = setTimeout(() => ctrl.abort(), 4000);
            const r = await fetch('/accounts/api/chat_resume/', {
              credentials: 'include', headers: { Accept: 'application/json' }, signal: ctrl.signal,
            }).finally(() => clearTimeout(to));
            if (!r.ok) return undefined;
            const j = await r.json() as { ok?: boolean; keycard?: string; nick?: string; realname?: string };
            if (j?.ok && j.keycard) {
              if (typeof j.nick === 'string' && j.nick) opts.nick = j.nick;
              if (typeof j.realname === 'string' && j.realname.trim()) {
                opts.realname = j.realname.trim();
              }
              return j.keycard;
            }
          } catch { /* offline / no endpoint */ }
          return undefined;
        };
      }
      // WordPress profile = source of truth: resolve âge/genre/ville before USER.
      if (!opts.resolveRealname) {
        opts.resolveRealname = async () => {
          const acct = (opts.saslAuthzid || get().account || '').trim()
            || ((opts.password || opts.passkey || opts.keycard) ? opts.nick.trim() : '');
          if (!acct) return opts.realname;
          const rn = await fetchProfileGecos(acct);
          return rn || opts.realname;
        };
      }
      const client = new IrcClient();
      initNotify();
      set({ client, nick: opts.nick, status: 'connecting' });
      client.on('status', (st) => {
        set({ status: st, nick: client.nick });
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
          if (fr.length) client.ircv3.monitor('+', fr.join(','));
          // Subscribe to account-profile metadata so cards show avatar/bio/etc.
          client.ircv3.subscribeMetadata(['avatar', 'bio', 'pronouns', 'timezone', 'url']);
          // On a RECONNECT, rejoin every channel we still have open (the client
          // only auto-joins the initial set; this restores ones joined later).
          if (wasReconnect) {
            const s = get();
            for (const name of s.order) {
              const b = s.buffers[name];
              if (b?.isChannel && !closedChannels.has(name)) client.join(b.name);
            }
          }
          // network icon from the server's draft/ICON ISUPPORT token (else branding favicon)
          const icon = client.server.isupport['draft/ICON'] || client.server.isupport['ICON'];
          if (icon) set({ networkIcon: icon });
        }
      });
      client.on('reconnecting', (secs) => {
        resetBatches(); // drop any batch left half-open when the socket dropped
        knownServices.clear(); // re-learn services after reconnect rather than accrete forever
        namesInFlight.clear();
        // Drop stale nicklists immediately — NAMES on rejoin will refill them.
        // Avoids ghost guests (Harry208 + Harry365) while the socket is down.
        // Keep a short-lived GECOS/account cache so âge/genre/ville flash back
        // before WHOX arrives (and survive if WHO is slow).
        profileCache.clear();
        const s = get();
        for (const name of s.order) {
          const b = s.buffers[name];
          if (!b?.isChannel) continue;
          for (const [nick, m] of Object.entries(b.members || {})) {
            if (m.realname || m.account) {
              profileCache.set(canon(nick), {
                ...(m.realname ? { realname: m.realname } : {}),
                ...(m.account ? { account: m.account } : {}),
              });
            }
          }
          if (Object.keys(b.members).length) {
            patchBuffer(name, (bb) => ({ ...bb, members: {} }));
          }
        }
        set({ reconnectIn: secs as number });
        sysLine(SERVER, i18n.t('system.reconnecting', { secs }), 'system');
      });
      // Coalesce inbound messages so a burst renders once, not once per line. The
      // server frames each IRC line as its own WebSocket message (text.ircv3.net),
      // so a join burst — NAMES plus a WHO reply per member, across every channel
      // joined at once — would otherwise fire one React render PER LINE. Buffering
      // to a timer lets React batch the burst into a single render; under load the
      // timer macrotasks back up, so each drain naturally swallows more lines.
      // A 0ms timer (not rAF) keeps processing unread counts + mention notifications
      // in a backgrounded tab, where rAF is paused. Protocol-critical lines
      // (PING/PONG, CAP, SASL) are answered in the client before it emits 'message',
      // so this never delays the handshake or keepalive.
      const inbox: Parameters<typeof handle>[0][] = [];
      let pending = 0;
      const drain = () => {
        pending = 0;
        // Splice so anything arriving mid-drain rides the next tick, in order.
        for (const m of inbox.splice(0, inbox.length)) handle(m);
      };
      client.on('message', (m) => {
        inbox.push(m);
        if (!pending) pending = setTimeout(drain, 0) as unknown as number;
      });
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
      s.client?.ircv3.fetchMetadata(nick);
    },

    // Classic-mIRC WHOIS: collect the reply but print it to the window it was run
    // from (printTo) as text lines instead of opening the panel. No profileUser set.
    whoisText(nick) {
      if (!nick) return;
      const s = get();
      set({ whois: { ...s.whois, [nick]: { nick, loading: true, printTo: s.active } } });
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
      s.client?.ircv3.fetchMetadata(nick);
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
      if (!client || !buf || !client.ircv3.hasCap('draft/chathistory')) return;
      // A channel we've parted is no longer a valid CHATHISTORY target — the server
      // would answer FAIL INVALID_TARGET, so don't ask.
      if (isChannelName(buf.name) && !buf.joined) return;
      // anchor on the oldest real message currently shown
      const oldest = buf.messages.find((m) => m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice');
      if (!oldest) return;
      set({ historyLoading: { ...s.historyLoading, [key]: true } });
      client.ircv3.chathistoryBefore(buf.name, new Date(oldest.ts).toISOString(), 50);
      // safety: clear the spinner if the server never answers.
      setTimeout(() => set({ historyLoading: { ...get().historyLoading, [key]: false } }), 8000);
    },

    setAway(reason) {
      get().client?.setAway(reason);
      // away-notify tells OTHER members we're away, never us — patch our own entry
      // in every channel so the member list reflects it immediately.
      helpers.patchMemberEverywhere(get().nick, { away: !!reason });
      set({ away: !!reason });
    },

    addFriend(nick) {
      const n = nick.trim();
      if (!n) return;
      const cur = get().friends;
      if (cur.some((f) => f.toLowerCase() === n.toLowerCase())) return;
      const next = [...cur, n];
      saveFriends(next); syncGlobal();
      set({ friends: next });
      get().client?.ircv3.monitor('+', n); // start watching
    },

    removeFriend(nick) {
      const next = get().friends.filter((f) => f.toLowerCase() !== nick.toLowerCase());
      saveFriends(next); syncGlobal();
      const online = { ...get().friendsOnline }; delete online[nick.toLowerCase()];
      set({ friends: next, friendsOnline: online });
      get().client?.ircv3.monitor('-', nick);
    },

    loadBanList(channel) {
      const key = canon(channel);
      const c = get().client;
      // Reset all three lists; the 367/348/346 replies refill them.
      set({
        banlists: { ...get().banlists, [key]: [] },
        exceptlists: { ...get().exceptlists, [key]: [] },
        invexlists: { ...get().invexlists, [key]: [] },
      });
      const typeA = (c?.server.isupport.CHANMODES || '').split(',')[0] || 'b';
      c?.modeList(channel, 'b');
      if (typeA.includes('e')) c?.modeList(channel, 'e'); // ban exceptions, if supported
      if (typeA.includes('I')) c?.modeList(channel, 'I'); // invite exceptions, if supported
    },
    setChannelModeParam(channel, mode, add, param) {
      if (isChannelName(channel)) get().client?.setChannelModeParam(channel, mode, add, param);
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
      saveNotify(next, ns);
      set({ notifyLevel: next });
    },

    togglePin(msgid) {
      const key = get().active;
      const m = get().buffers[key]?.messages.find((x) => x.id === msgid);
      if (!m) return;
      const next = togglePinIn(get().pins, key, { id: m.id, from: m.from, text: m.text, ts: m.ts });
      savePins(next, ns);
      set({ pins: next });
    },
    unpin(channel, id) {
      const next = unpinIn(get().pins, canon(channel), id);
      savePins(next, ns);
      set({ pins: next });
    },
    setHighlightWords(words) {
      const clean = words.map((w) => w.trim()).filter(Boolean);
      saveStr(HIGHLIGHT_KEY, clean); syncGlobal();
      set({ highlightWords: clean });
    },
    setDraft(name, text) {
      const key = canon(name);
      const drafts = { ...get().drafts };
      if (text) drafts[key] = text; else delete drafts[key];
      set({ drafts });
    },
    dismissKick() { set({ kicked: null }); },
    dismissNickServAlert() { set({ nickServAlert: null }); },
    openStatusFromNickServAlert() {
      get().setActive(SERVER);
      set({ nickServAlert: null });
    },
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
            get().client?.ircv3.markRead(pb.name, new Date(latest).toISOString());
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
          if (latest > b.readTs) s.client?.ircv3.markRead(b.name, new Date(latest).toISOString());
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
    // Advance the ACTIVE buffer's read marker to its newest line — called by the
    // message list whenever it's scrolled to the bottom (you've read everything),
    // so the "New messages" divider and jump button clear instead of freezing.
    // Local readTs moves freely; the server MARKREAD is throttled to avoid spam.
    markReadHere() {
      const s = get();
      const key = s.active;
      const b = s.buffers[key];
      if (!b || !b.messages.length) return;
      const latest = b.messages[b.messages.length - 1].ts;
      if (latest <= b.readTs) return;
      patchBuffer(key, (bf) => ({ ...bf, readTs: latest, unread: 0, highlight: false }));
      const now = Date.now();
      if (now - (readMarkSent[key] || 0) > 2000) {
        readMarkSent[key] = now;
        s.client?.ircv3.markRead(b.name, new Date(latest).toISOString());
      }
    },

    notifyTyping() {
      const { client, active } = get();
      if (!client || !active || !isChannelName(active)) return;
      const now = Date.now();
      if (now - lastTypingSent > 3000) { lastTypingSent = now; client.ircv3.sendTyping(active, 'active'); }
    },

    sendInput,

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
      saveIgnored(next); syncGlobal();
      set({ ignored: next });
    },
    modKick(nick, reason) { const { client, active } = get(); if (isChannelName(active)) client?.kick(active, nick, reason); },
    // Ban by host if known (host bans survive nick changes), else by nick — no kick.
    modBanOnly(nick) {
      const { client, active } = get();
      if (!isChannelName(active)) return;
      const host = get().whois[nick]?.host || get().buffers[active]?.members[nick]?.host;
      client?.ban(active, host ? `*!*@${host}` : `${nick}!*@*`);
    },
    modBan(nick) {
      const { active } = get();
      get().modBanOnly(nick);
      if (isChannelName(active) && get().buffers[active]?.members[nick]) get().modKick(nick, 'banni');
    },
    modSetMode(nick, mode, add) { const { client, active } = get(); if (isChannelName(active)) client?.setUserMode(active, mode, add, nick); },
    modTopic(topic) { const { client, active } = get(); if (isChannelName(active)) client?.setTopic(active, topic); },
    reportUser(nick) {
      const n = (nick || '').trim();
      if (!n) return;
      const { query } = getConfig().report;
      const desk = (query || '').trim();
      // HelpServ-style desk (e.g. SignalMoi): open the PV + natural-language draft
      // (no REPORT command — the bot opens the ticket on the user's first real message).
      if (desk) {
        const active = get().active;
        const fromChan = isChannelName(active) ? active : undefined;
        get().setDraft(desk, `Je souhaiterais vous signaler ${n} : motif ?`);
        get().openQuery(desk, fromChan);
        return;
      }
      set({ reportSubject: n, modal: 'report' });
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
      client?.ircv3.react(active, msgid, emoji);
    },

    redact(msgid) {
      const { client, active } = get();
      client?.ircv3.redact(active, msgid);
    },

    uploadImage,
    uploadAudio,

    // Surface a one-off system line in a buffer (used by UI for local hints).
    pushSystem(buffer, text) { sysLine(buffer || get().active, text, 'system'); },
    // Local-only chat line (e.g. HelpServ welcome plugin) — never hits the wire.
    pushLocal(buffer, text, from = '', kind: MessageKind = 'privmsg') {
      const target = (buffer || get().active || '').trim();
      const body = (text || '').trim();
      if (!target || !body) return;
      ensureBuffer(target);
      addMessage(target, {
        id: newId(),
        bufferName: target,
        from: (from || '').trim(),
        text: body,
        ts: Date.now(),
        kind,
        self: false,
      });
    },

    // ---- account management (draft/account-registration) — see store/account.ts ----
    accountRegister,
    accountVerify,
    accountResend,
    accountChangePassword,
    accountChallengeComplete,
    resetReg,
    setPref(key, value) {
      const prefs = { ...get().prefs, [key]: value };
      savePrefs(prefs);
      applyPrefs(prefs);
      set({ prefs });
      // Leaving Status hidden while looking at it → jump to a real conversation.
      if (key === 'showStatus' && value === false && get().active === SERVER) {
        const next = get().order.find((n) => n !== SERVER) || '';
        if (next) get().setActive(next);
      }
      syncGlobal();
    },
  };
  });
  // Keep truly-global state (prefs / friends / ignored / highlights) consistent
  // across networks: any store that changes it dispatches, every store re-reads.
  if (typeof window !== 'undefined') {
    window.addEventListener('orbit:globalsync', () => store.setState({
      prefs: getPrefs(), friends: loadFriends(), ignored: loadIgnored(), highlightWords: loadStr(HIGHLIGHT_KEY),
    }));
  }
  return store;
}
function syncGlobal() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('orbit:globalsync')); }

// The primary network. Existing single-network usage is unchanged.
export const useChat = createChatStore();
