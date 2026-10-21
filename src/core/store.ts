import { create } from 'zustand';
import i18n from './i18n';
import { IrcClient } from './irc/client';
import { initNotify } from '../platform/notify';
import { getPrefs, savePrefs, applyPrefs, type Prefs } from '../ui/prefs';
import type { Buffer, ConnectOptions, WhoisInfo, MessageKind } from './irc/types';
import { getConfig } from './config';
import { resolveConnectUsername } from './irc/ident';
import { HIGHLIGHT_KEY, loadStr, saveStr, loadIgnored, saveIgnored, loadFriends, saveFriends, loadNotify, saveNotify, loadPins, savePins, togglePinIn, unpinIn, type NotifyLevel, type Pin } from './store/persistence';
import { SERVER, canon, isChannelName, resetBatches, newId, isPseudoBuffer, isBouncerServiceNick, trackBufferMuteSync } from './store/context';
export { SERVER, NOTICES, isNoticeBuffer, noticeBufferNick, noticeBufferName, isBouncerServiceNick } from './store/context';
import { findMemberKey, findWhoisKey, makeHelpers, rememberQueryAccount } from './store/helpers';
import { clearPmPeerOffline, listOpenQueryNicks } from './store/pm-presence';
import { shouldOfferNickRecover, type NickRecoverOffer } from './store/nick-recover';
import { isService, isStatusService } from './services';
import { loadSidebarOrder, saveSidebarOrder, arrangeNames, liveChannels, liveQueries, moveName } from './store/sidebar-order';
import { prefetchLatestHistory } from './store/history-prefetch';
import { prefetchJoinedBufferMutes } from './store/mute-prefetch';
import { refreshPush } from '../platform/push';
import { makeHandler } from './store/handler';
import { requestTextWhois } from './store/whois';
import { makeCommands } from './store/commands';
import { makeUpload } from './store/upload';
import { makeAccount } from './store/account';
import { fetchProfileGecos } from '../platform/profile-gecos';
import { refreshIrcListenCookie, withListenQuery } from '../platform/irc-listen';
import { mintChatResumeResult, saveSaslResume, clearSaslResume } from './resume';
import type { MintResult } from './resume';
import { setExpectedBootChannels } from '../lib/boot-ready';
import { closeMobileNav } from '../lib/mobile-nav';
import { mergeMlock } from './irc/mode-catalog';
import { mphistoryModuleLoaded } from './irc/caps';
import { fetchChannelMlock } from './store/mlock-rpc';
import { fetchChanServPublic } from './store/chanserv-info';
import { resetGardianStatsGate } from './store/gardian-stats';
import { onOwnerChange, setActiveOwner } from '../lib/identity-storage';
import { bus } from '../modules/bus';



// Pending /FILEHOST token request (resolved when the server NOTICEs the upload URL).
const filehost: {
  resolve: ((token: string) => void) | null;
  reject: ((err: Error) => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
  lateToken: string | null;
  lateAt: number;
  awaitingLate: boolean;
} = { resolve: null, reject: null, timer: null, lateToken: null, lateAt: 0, awaitingLate: false };




export type Modal = '' | 'join' | 'settings' | 'explore' | 'friends' | 'chanadmin' | 'chaninfo' | 'report' | 'switcher' | 'shortcuts' | 'moderated';
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
  /** Game HUD (Petit Bac plein écran, etc.) is hiding the message list. */
  chatCovered: boolean;
  setChatCovered: (covered: boolean) => void;
  client: IrcClient | null;
  networkIcon: string;
  account: string; // NickServ account we're logged in as ('' = guest)
  umodes: string;  // our own active user-mode letters, e.g. "iwx" (global, per-user)
  /**
   * When set, informational server lines (NOTICE *, unmatched numerics, OPER
   * replies like CHECK) are printed into this buffer instead of the Status
   * console — so IRCOP tools stay visible without opening Status.
   */
  echoServerTo: string | null;
  setEchoServerTo: (buffer: string | null) => void;
  /**
   * Composer slash/raw command was just sent: until this time, generic IRC
   * errors (481, 421, FAIL, …) echo into the active buffer. Auto Orbit traffic
   * (JOIN on connect, MARKREAD, …) keeps Status / existing popups.
   */
  userCmdEchoUntil: number;
  /** 396 / CHGHOST displayed host (cloak or Anope vHost). */
  displayedHost: string;
  /** Session is under the callerid parental security group (plugin-driven). */
  parentalControls: boolean;
  setParentalControls: (on: boolean) => void;
  serverName: string;    // the ircd's own hostname (RPL_MYINFO / 004), for the Status title
  ircNetwork: string;    // ISUPPORT NETWORK (e.g. EntreNous.chat)
  serverError: string;   // last ERROR reason from the server (for the connect screen)
  /** Sticky pre-register failure for the join form / site redirect (survives closed-after-sasl). */
  connectFail: { status: 'sasl-failed' | 'error' | 'closed'; message: string } | null;
  reconnectIn: number;   // seconds until the next auto-reconnect (0 = not reconnecting)
  everRegistered: boolean; // true after the first successful registration (keeps the chat UI mounted during reconnects)
  autoConnecting: boolean; // a handoff (e.g. the site entry form) is connecting for us; show a splash, not the join form
  /** True when this connect came from the site handoff / keycard (not Orbit join form). */
  connectViaSite: boolean;
  connectUrl: string;      // WebSocket URL of the current/last connect() (network or bouncer)
  viaBouncer: boolean;     // this session authenticated with PASS (ZNC / KiwiBNC), not NickServ SASL
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
  filterlists: Record<string, { mask: string; by: string; ts: number }[]>; // +g chanfilter words
  /** InspIRCd +X exemptchanops (`anticaps:o`, …). */
  exemptlists: Record<string, { mask: string; by: string; ts: number }[]>;
  /** InspIRCd +w autoop (`o:*!*@host`, …). */
  autooplists: Record<string, { mask: string; by: string; ts: number }[]>;
  loadBanList: (channel: string) => void;
  loadChannelMlock: (channel: string) => void;
  /** Refresh ChanServ public INFO (TOPICLOCK, founder, …) into the buffer. */
  loadChanServPublic: (channel: string) => void;
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
  settingsSection: string; // settings pane id ('profil' | 'compte' | …)
  reportSubject: string; // nick/channel prefilled into the report window
  kicked: KickInfo | null; // last time we got kicked — drives the dismissible toast
  nickServAlert: ServiceAlert | null; // incoming NickServ notice — centered popup
  nickError: { nick: string; code: string; text: string } | null; // 432/433 after a NICK attempt
  /** Nick requested at connect (before a 433 suffix). Used for optional RECOVER. */
  wantedNick: string;
  /** Manual NickServ RECOVER offer when SASL ok but the nick is held by a ghost. */
  nickRecoverOffer: NickRecoverOffer | null;
  /** Close of a PM that still has server-replayed history — ask before MPHISTORY CLEAR. */
  pmHistoryClose: { nick: string } | null;
  /** Settings → Server: MPHISTORY CLEAR * (confirm, wait, then done). */
  pmHistoryClearAll: null | { phase: 'confirm' | 'pending' } | { phase: 'done'; n: number };
  /** Last MPHISTORY CLEAR failure, shown on the settings option. */
  pmHistoryClearError: string;
  /** Nicks whose MPHISTORY CLEAR is in flight (canon key). Blocks a second click. */
  pmHistoryClearing: Record<string, true>;
  pmContext: Record<string, string>; // canon(nick) → channel this DM relates to (+draft/channel-context)
  sidebarOrder: { channels: string[]; queries: string[] };

  connect: (opts: ConnectOptions) => void;
  confirmNickRecover: () => void;
  dismissNickRecover: () => void;
  /** Recompute the optional NickServ RECOVER banner (after 900 / NICK). */
  refreshNickRecoverOffer: () => void;
  setActive: (name: string) => void;
  openQuery: (nick: string, fromChannel?: string) => void;
  closeBuffer: (name: string) => void;
  /** Close the PM from the history prompt. `clear` sends MPHISTORY CLEAR first. */
  finishPmHistoryClose: (clear: boolean) => void;
  /** Leave the PM open. */
  dismissPmHistoryClose: () => void;
  /** Open the confirm popup for MPHISTORY CLEAR *. */
  askClearAllPmHistory: () => void;
  /** Send MPHISTORY CLEAR * after the user confirmed. */
  confirmClearAllPmHistory: () => void;
  /** MPHISTORY CLEAR for one PM. Ignored while that nick's clear is in flight. */
  clearPmHistory: (nick: string) => void;
  /** Close the confirm or the done popup. */
  dismissClearAllPmHistory: () => void;
  reorderSidebar: (section: 'channels' | 'queries', from: string, to: string) => void;
  openUser: (nick: string) => void;
  refreshUser: (nick: string) => void;
  whoisText: (nick: string) => void;
  closeProfile: () => void;
  setModal: (m: Modal) => void;
  openSettings: (section?: string) => void;
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
  deleteHostedFile: (url: string) => Promise<boolean>;
  pushSystem: (buffer: string, text: string) => void;
  /** Local-only line in a buffer (plugins) — does not send IRC. Default kind: privmsg.
   *  Pass `asSelf=true` to show as the local user's own bubble (e.g. pending +g DM). */
  pushLocal: (buffer: string, text: string, from?: string, kind?: MessageKind, asSelf?: boolean) => void;
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
  const historyAsked = new Set<string>(); // channels already sent CHATHISTORY LATEST this session
  const muteAsked = new Set<string>(); // channels already sent METADATA GET soju.im/muted this session
  const mlockAsked = new Map<string, number>(); // canon channel → ChanServ INFO expiry for MLOCK
  // Soft cache of GECOS/account across reconnect nicklist clears (until WHOX refills).
  const profileCache = new Map<string, { realname?: string; account?: string }>();
  const lastCantSend: Record<string, number> = {}; // throttle the "you can't write here" notice per channel
  const lastAwayNotice: Record<string, number> = {}; // throttle the "X is away" notice per query
  // Live connect opts — prune refused channels so 001 autojoin does not retry them.
  let activeConnectOpts: { channels?: string[] } | null = null;
  const pruneAutoJoin = (ch: string) => {
    if (!activeConnectOpts?.channels?.length) return;
    const key = canon(ch);
    activeConnectOpts.channels = activeConnectOpts.channels.filter((c) => canon(c) !== key);
  };
  let prefetchFilehostToken: () => Promise<void> = async () => {};
  const store = create<ChatState>((set, get) => {
  // Buffer/message helpers live in store/helpers.ts.
  const helpers = makeHelpers(set, get, closedChannels);
  const { ensureBuffer, patchBuffer, dropBuffer, sysLine, serverLine, addMessage } = helpers;
  const readMarkSent: Record<string, number> = {}; // throttle server MARKREAD per buffer
  const displayedSent: Record<string, number> = {}; // throttle DM displayed TAGMSG per peer
  const pushMarkRead = (name: string, ts: number) => {
    const { client, account } = get();
    client?.ircv3.markRead(name, new Date(ts).toISOString(), account);
  };
  const pushDisplayed = (name: string) => {
    const s = get();
    if (!s.prefs.readReceipts) return;
    if (isChannelName(name) || isPseudoBuffer(name) || isBouncerServiceNick(name) || isService(name)) return;
    const b = s.buffers[canon(name)];
    if (!b) return;
    let latestPeer = 0;
    // Don't TAGMSG a peer we never wrote to: +g/callerid treats TAGMSG like PRIVMSG
    // (716/718), so a mere open/read of their first DM looked like "message pending".
    let wroteThem = false;
    for (const m of b.messages) {
      if (!m.self && (m.kind === 'privmsg' || m.kind === 'action') && m.ts > latestPeer) latestPeer = m.ts;
      if (m.self && (m.kind === 'privmsg' || m.kind === 'action')) wroteThem = true;
    }
    if (!latestPeer || !wroteThem) return;
    const now = Date.now();
    const key = canon(name);
    if (now - (displayedSent[key] || 0) < 2000) return;
    displayedSent[key] = now;
    s.client?.ircv3.sendDisplayed(b.name, latestPeer);
  };

  const handle = makeHandler({ set, get, helpers, closedChannels, knownServices, lastCantSend, lastAwayNotice, filehost, namesInFlight, historyAsked, muteAsked, profileCache, persistNs: ns, mlockAsked, pruneAutoJoin });
  // Outgoing input/slash-command parser lives in store/commands.ts.
  const { sendInput } = makeCommands({ get, set, helpers, resetTyping: () => { lastTypingSent = 0; } });
  const upload = makeUpload({ get, filehost, helpers });
  const { uploadImage, uploadAudio, deleteHostedFile } = upload;
  prefetchFilehostToken = upload.prefetchFilehostToken;
  const { accountRegister, accountVerify, accountResend, accountChangePassword, accountChallengeComplete, resetReg } = makeAccount({ get, set });

  const refreshNickRecoverOffer = () => {
    const s = get();
    const next = shouldOfferNickRecover({
      status: s.status,
      account: s.account,
      nick: s.nick,
      wantedNick: s.wantedNick,
      offer: s.nickRecoverOffer,
    });
    if (next !== s.nickRecoverOffer) set({ nickRecoverOffer: next });
  };

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
    echoServerTo: null,
    userCmdEchoUntil: 0,
    setEchoServerTo(buffer) {
      const b = (buffer || '').trim();
      set({ echoServerTo: b || null });
    },
    displayedHost: '',
    parentalControls: false,
    serverName: '',
    ircNetwork: '',
    serverError: '',
    connectFail: null,
    reconnectIn: 0,
    everRegistered: false,
    autoConnecting: false,
    connectViaSite: false,
    connectUrl: '',
    viaBouncer: false,
    historyLoading: {},
    historyDone: {},
    away: false,
    friends: loadFriends(),
    friendsOnline: {},
    banlists: {},
    exceptlists: {},
    invexlists: {},
    filterlists: {},
    exemptlists: {},
    autooplists: {},
    notifyLevel: loadNotify(ns),
    highlightWords: loadStr(HIGHLIGHT_KEY),
    drafts: {},
    pins: loadPins(ns),
    isActive: true, // is this network the one the user is currently viewing (set by the registry)
    chatCovered: false,
    setChatCovered(covered) {
      if (get().chatCovered === covered) return;
      set({ chatCovered: covered });
      if (!covered) get().markReadHere();
    },
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
    sidebarOrder: loadSidebarOrder(ns),
    modal: '',
    settingsSection: 'profil',
    reportSubject: '',
    kicked: null,
    nickServAlert: null,
    nickError: null,
    wantedNick: '',
    nickRecoverOffer: null,
    pmHistoryClose: null,
    pmHistoryClearAll: null,
    pmHistoryClearError: '',
    pmHistoryClearing: {},

    connect(opts) {
      // Retrying after a failed/closed attempt re-enters connect() on the same
      // store; tear down the previous client first so it can't keep reconnecting
      // in the background and process every inbound line a second time.
      get().client?.disconnect();
      // Scope prefs / lists / plugin storage to this account (or nick) immediately
      // so a second user on the same browser does not inherit the previous session.
      setActiveOwner(opts.saslAuthzid, opts.nick);
      // Ident (the "user" in nick!user@host): logged-in members show their nick;
      // guests show guestIdent, or the nick when server.guestIdentFromNick is on.
      if (!opts.username) opts.username = resolveConnectUsername(opts, getConfig().server);
      // Kiwi BNC speaks HOST so webircgateway uses ZNC, not a random [upstream.N].
      if (opts.serverPassword && !opts.bouncerHost) {
        const host = (getConfig().server.bouncerHost || '').trim();
        if (host) opts.bouncerHost = host;
      }
      // Prefer SASL SCRAM-SHA-256 (the password never goes on the wire) for a real
      // account password — never for a one-time keycard (SCRAM can't verify a token)
      // or a passkey — when the deployment enables it. Registration falls back to
      // PLAIN if SCRAM isn't offered or fails.
      if (opts.scram === undefined && opts.password && !opts.keycard && !opts.passkey
          && getConfig().features.saslScram) {
        opts.scram = true;
      }
      // Classic NickServ password: remember it for F5 in this tab (not a JWT
      // keycard — those stay HttpOnly on the MonIdentité cookie).
      if (getConfig().features.sessionResume && opts.password && !opts.keycard
          && !opts.passkey && !opts.serverPassword) {
        saveSaslResume({
          nick: opts.nick,
          password: opts.password,
          account: opts.saslAuthzid || opts.nick,
          url: opts.url,
        });
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
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 4000);
          let mint: MintResult;
          try { mint = await mintChatResumeResult(ctrl.signal); }
          catch { mint = { ok: false, reason: 'unreachable' }; }
          finally { clearTimeout(to); }
          // Only one try here: the socket is already open and the ircd won't wait
          // forever for NICK/USER, so the retry loop belongs to the transport's
          // backoff ('retry'), not to this handshake.
          if (!mint.ok) return mint.reason === 'unreachable' ? 'retry' : undefined;
          opts.nick = mint.card.nick;
          if (mint.card.account) opts.saslAuthzid = mint.card.account;
          if (mint.card.realname) opts.realname = mint.card.realname;
          return mint.card.keycard;
        };
      }
      // WordPress profile = source of truth: resolve âge/genre/ville before USER.
      // Bouncer sessions already have GECOS on the attached nick — don't delay PASS.
      if (!opts.resolveRealname && !opts.serverPassword) {
        opts.resolveRealname = async () => {
          const acct = (opts.saslAuthzid || get().account || '').trim()
            || ((opts.password || opts.passkey || opts.keycard) ? opts.nick.trim() : '');
          if (!acct) return opts.realname;
          const rn = await fetchProfileGecos(acct);
          return rn || opts.realname;
        };
      }
      const client = new IrcClient();
      activeConnectOpts = opts;
      initNotify();
      // Wait for the room we'll show — resume can list 6–7 channels and the
      // splash would sit at 97% (6/7) while Radio / Mémo / notices are still off.
      // The first requested channel is that room (last one open, or the URL).
      // Config's home salon is only the fallback when nothing was requested.
      const requested = (opts.channels ?? []).map((c) => c.trim()).filter(Boolean);
      const landOn = requested[0] || (getConfig().startup?.channels?.[0] || '').trim();
      setExpectedBootChannels(landOn ? [landOn] : undefined);
      if (filehost.timer) clearTimeout(filehost.timer);
      filehost.resolve = null; filehost.reject = null; filehost.timer = null;
      filehost.lateToken = null; filehost.lateAt = 0; filehost.awaitingLate = false;
      resetGardianStatsGate();
      set({
        client, nick: opts.nick, status: 'connecting',
        connectUrl: opts.url,
        viaBouncer: !!opts.serverPassword,
        connectViaSite: !!opts.fromSite,
        umodes: '',
        echoServerTo: null,
        userCmdEchoUntil: 0,
        displayedHost: '',
        parentalControls: false,
        wantedNick: (opts.nick || '').trim(),
        nickRecoverOffer: null,
        pmHistoryClose: null,
        pmHistoryClearAll: null,
        pmHistoryClearError: '',
        pmHistoryClearing: {},
        serverError: '',
        connectFail: null,
      });
      // Show that room now. The ircd also auto-joins its home salon; the JOIN
      // handler only follows the channel we asked to display.
      if (landOn) get().setActive(landOn);
      // Re-open PM windows from the last session (F5 / session resume).
      for (const raw of opts.queries ?? []) {
        const q = String(raw || '').trim();
        if (!q || isChannelName(q) || isPseudoBuffer(q) || isBouncerServiceNick(q) || isStatusService(q)) continue;
        if (canon(q) === canon(opts.nick)) continue;
        ensureBuffer(q);
      }
      client.on('status', (st) => {
        // Drop stale NickServ identity as soon as the link is not live — a server
        // restart / services outage must not keep Settings showing "Connecté".
        // Re-filled by 900 / ACCOUNT / extended-JOIN / WHOIS 330 after reconnect.
        // Keep the storage owner across disconnect so prefs/lists don't briefly
        // fall back to the unscoped device bucket (and leak across accounts).
        if (st === 'closed' || st === 'error' || st === 'connecting' || st === 'sasl-failed') {
          if (get().account) set({ account: '' });
        }
        set({ status: st, nick: client.nick });
        if (st === 'registered') refreshNickRecoverOffer();
        else {
          set({
            ...(st === 'closed' || st === 'error' || st === 'sasl-failed' ? { nickRecoverOffer: null } : {}),
            pmHistoryClose: null,
            pmHistoryClearAll: null,
            pmHistoryClearError: '',
            pmHistoryClearing: {},
          });
        }
        // Sticky pre-register failure (closed must not erase a prior sasl-failed).
        if (!get().everRegistered && (st === 'sasl-failed' || st === 'error' || st === 'closed')) {
          const prev = get().connectFail;
          if (!(st === 'closed' && prev?.status === 'sasl-failed')) {
            const fallback = st === 'sasl-failed' ? i18n.t('connect.error_sasl')
              : st === 'error' ? i18n.t('connect.error_error')
                : i18n.t('connect.error_closed');
            const message = (get().serverError || '').trim() || fallback;
            set({ connectFail: { status: st, message } });
          }
        }
        // Once we leave 'connecting' (registered, or an auth/connection failure),
        // a handoff is no longer in flight: drop the splash so failures fall back
        // to the join form (with the nick/channel still prefilled from the URL).
        if (st !== 'connecting') set({ autoConnecting: false });
        // Only forget the password parked for this tab when it's the thing that was
        // actually refused and never worked: a keycard failure says nothing about it,
        // and a password that already registered on this session is known good (a
        // services hiccup, not a typo), so a reload should still be able to retry.
        if (st === 'sasl-failed' && !opts.keycard && !get().everRegistered) clearSaslResume();
        // Bouncer: a failed first handshake must not retry — ZNC connection-floods
        // and the join form would keep opening sockets in the background.
        if ((st === 'closed' || st === 'error') && opts.serverPassword && !get().everRegistered) {
          client.disconnect();
          set({ reconnectIn: 0 });
        }
        if (st === 'registered') {
          const wasReconnect = get().everRegistered;
          set({ reconnectIn: 0, serverError: '', connectFail: null, everRegistered: true, friendsOnline: {} });
          // Keep the parked password aligned with the nick we actually registered
          // under (433 may have suffix-mangled it), so a later F5 still matches.
          if (getConfig().features.sessionResume && opts.password && !opts.keycard
              && !opts.passkey && !opts.serverPassword) {
            saveSaslResume({
              nick: client.nick,
              password: opts.password,
              account: opts.saslAuthzid || get().account || client.nick,
              url: opts.url,
            });
          }
          // Snapshot user modes (RPL_UMODEIS/221). ZNC may answer 502 if the
          // local nick differs from the ircd nick — that numeric is swallowed.
          // When the snapshot stays empty (typical bouncer attach, no MODE
          // replay), WHOIS 379 fills `umodes` so Settings matches the server.
          client.queryUserModes();
          if (!get().account) client.whois(client.nick);
          if (get().viaBouncer) {
            window.setTimeout(() => {
              if (get().client !== client || get().status !== 'registered') return;
              if (get().umodes) return;
              client.whois(client.nick);
            }, 500);
          }
          // Watch friends + open PMs via MONITOR (730/731 → online/offline in the PM).
          {
            const s = get();
            const watch = Array.from(new Set([
              ...s.friends,
              ...listOpenQueryNicks(s.buffers, s.order, s.nick),
            ])).slice(0, 80);
            if (watch.length) client.ircv3.monitor('+', watch.join(','));
          }
          // Subscribe to account-profile metadata so cards show avatar/bio/etc.
          client.ircv3.subscribeMetadata(['avatar', 'bio', 'pronouns', 'timezone', 'url']);
          // Re-assert Web Push as soon as 001 lands (don't wait for a React paint).
          if (get().account && getConfig().features.push) void refreshPush(client, get().account);
          prefetchJoinedBufferMutes(get, muteAsked);
          // On a RECONNECT, rejoin every channel we still have open (the client
          // only auto-joins the initial set; this restores ones joined later).
          // Skip joinDenied — retrying a refused salon beeps in a loop.
          if (wasReconnect) {
            const s = get();
            for (const name of s.order) {
              const b = s.buffers[name];
              if (b?.isChannel && !closedChannels.has(name) && !b.joinDenied) client.join(b.name);
            }
          }
          // network icon from the server's draft/ICON ISUPPORT token (else branding favicon)
          const icon = client.server.isupport['draft/ICON'] || client.server.isupport['ICON'];
          const patch: { networkIcon?: string; ircNetwork?: string } = {};
          if (icon) patch.networkIcon = icon;
          if (client.server.network) patch.ircNetwork = client.server.network;
          if (Object.keys(patch).length) set(patch);
          // JOIN/366 can race CAP ACK (bouncer playback). Once registered the cap
          // is settled — pick up any already-joined salon whose prefetch no-op'd.
          window.setTimeout(() => {
            const s = get();
            if (s.client !== client || s.status !== 'registered') return;
            for (const name of s.order) {
              const b = s.buffers[name];
              if (b?.isChannel && b.joined) prefetchLatestHistory(get, historyAsked, b.name);
            }
            prefetchJoinedBufferMutes(get, muteAsked);
          }, 800);
          // Catalogue for Explorer / galerie: start LIST during splash so the
          // first open is not waiting behind ChanServ/WHOIS on the 1/s bucket.
          if (!get().channels.length && !get().listLoading) get().refreshChannels();
        }
      });
      client.on('reconnecting', (secs) => {
        resetBatches(); // drop any batch left half-open when the socket dropped
        knownServices.clear(); // re-learn services after reconnect rather than accrete forever
        namesInFlight.clear();
        historyAsked.clear();
        muteAsked.clear();
        mlockAsked.clear();
        if (get().account) set({ account: '' });
        // Drop stale nicklists immediately — NAMES on rejoin will refill them.
        // Avoids ghost guests (Harry208 + Harry365) while the socket is down.
        // Keep a short-lived GECOS/account cache so âge/genre/ville flash back
        // before WHOX arrives (and survive if WHO is slow).
        profileCache.clear();
        const s = get();
        for (const name of s.order) {
          const b = s.buffers[name];
          if (!b?.isChannel) {
            // So MONITOR's post-reconnect snapshot can re-announce offline peers.
            if (b && !isPseudoBuffer(name)) clearPmPeerOffline(name);
            continue;
          }
          for (const [nick, m] of Object.entries(b.members || {})) {
            if (m.realname || m.account) {
              profileCache.set(canon(nick), {
                ...(m.realname ? { realname: m.realname } : {}),
                ...(m.account ? { account: m.account } : {}),
              });
            }
          }
          // Clear nicklist + joined: the socket is down — next 001 will rejoin.
          // Leaving joined:true made failed rejoins only blip (no joinDenied).
          if (Object.keys(b.members).length || b.joined) {
            patchBuffer(name, (bb) => ({
              ...bb, members: {}, joined: false, whoComplete: false, modes: undefined, modeParams: undefined,
            }));
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
      // Apache routes wss via orbit_en_listen *at* the WebSocket handshake.
      // Resolve GECOS first so age is known — otherwise chat_listen may force
      // `reg` and wipe a prior `cp` cookie (minors land on WebsocketEN).
      const openSocket = () => { client.connect(opts); };
      if (opts.serverPassword) {
        openSocket();
      } else {
        void (async () => {
          try {
            if (opts.resolveRealname) {
              try {
                const rn = await opts.resolveRealname();
                if (typeof rn === 'string' && rn.trim()) opts.realname = rn.trim();
              } catch { /* keep existing realname */ }
            }
            const acct = (opts.saslAuthzid || '').trim()
              || ((opts.password || opts.passkey || opts.keycard) ? opts.nick.trim() : '');
            const listen = await refreshIrcListenCookie({
              account: acct,
              realname: opts.realname,
            });
            // Cookie is one value for the whole browser. Keep this tab's choice
            // on the URL so another account cannot reroute the handshake.
            if (listen) {
              opts.url = withListenQuery(opts.url, listen);
              set({ connectUrl: opts.url });
            }
          } finally {
            openSocket();
          }
        })();
      }
    },

    openQuery(nick, fromChannel) {
      if (!nick || isChannelName(nick) || isPseudoBuffer(nick) || isStatusService(nick)) return;
      ensureBuffer(nick);
      // Record the channel this DM was started from (+draft/channel-context).
      if (fromChannel && isChannelName(fromChannel)) {
        const s = get();
        set({ pmContext: { ...s.pmContext, [canon(nick)]: fromChannel } });
      }
      // Watch presence so QUIT/CONNEXION can land in this PM even without a shared channel.
      get().client?.ircv3.monitor('+', nick);
      get().setActive(nick);
    },

    openUser(nick) {
      if (!nick || isPseudoBuffer(nick) || isBouncerServiceNick(nick)) return;
      const s = get();
      const key = findWhoisKey(s.whois, nick) || nick;
      const cur = s.whois[key];
      let seed: WhoisInfo = { nick: key, loading: true };
      if (cur && !cur.notFound && (cur.user || cur.realname || cur.account)) {
        seed = { ...cur, nick: key, loading: true, special: [] };
      } else {
        const buf = s.buffers[s.active];
        const activeKey = buf?.members ? findMemberKey(buf.members, nick) : undefined;
        let m = activeKey ? buf.members[activeKey] : undefined;
        if (!m) {
          for (const name of s.order) {
            const members = s.buffers[name]?.members;
            if (!members) continue;
            const mk = findMemberKey(members, nick);
            if (mk) { m = members[mk]; break; }
          }
        }
        if (m) {
          seed = {
            ...seed,
            ...(m.user ? { user: m.user } : {}),
            ...(m.host ? { host: m.host } : {}),
            ...(m.account ? { account: m.account } : {}),
            ...(m.realname ? { realname: m.realname } : {}),
            ...(m.oper ? { oper: true } : {}),
            ...(m.bot ? { bot: true } : {}),
          };
        }
      }
      set({ profileUser: key, whois: { ...s.whois, [key]: seed } });
      s.client?.whois(nick);
      s.client?.ircv3.fetchMetadata(nick);
    },

    // Classic-mIRC WHOIS: collect the reply but print it to the window it was run
    // from (printTo) as text lines instead of opening the panel. No profileUser set.
    whoisText(nick) {
      if (!nick || isPseudoBuffer(nick) || isBouncerServiceNick(nick)) return;
      const s = get();
      const key = findWhoisKey(s.whois, nick) || nick;
      const whois = { ...s.whois };
      const folded = canon(nick);
      for (const k of Object.keys(whois)) {
        if (k !== key && canon(k) === folded) delete whois[k];
      }
      whois[key] = { nick: key, loading: true, printTo: s.active };
      requestTextWhois(nick, s.active);
      set({ whois });
      s.client?.whois(nick);
    },

    // Re-query WITHOUT clearing the displayed data (no flash) — channels dedup via Set.
    refreshUser(nick) {
      if (!nick || isPseudoBuffer(nick) || isBouncerServiceNick(nick)) return;
      const s = get();
      const key = findWhoisKey(s.whois, nick);
      const cur = key ? s.whois[key] : undefined;
      if (!cur || !key) { s.openUser(nick); return; }
      // Reset the fields that a WHOIS response REBUILDS by appending across its
      // lines (319 channels, 320 special) so repeated refreshes don't accumulate
      // / duplicate them; keep the rest visible so there's no flash.
      set({ whois: { ...s.whois, [key]: { ...cur, loading: true, channels: '', special: [] } } });
      s.client?.whois(nick);
      s.client?.ircv3.fetchMetadata(nick);
    },

    closeBuffer(name) {
      const key = canon(name);
      if (key === SERVER) return; // the console can't be closed
      const buf = get().buffers[key];
      if (!buf) return;
      if (get().status === 'registered' && get().account && mphistoryModuleLoaded(get().client) && !buf.isChannel && buf.mphistoryReplay && !isPseudoBuffer(key) && !isBouncerServiceNick(key)) {
        set({ pmHistoryClose: { nick: buf.name || name } });
        return;
      }
      if (buf.isChannel) { closedChannels.add(key); if (buf.joined) get().client?.part(buf.name); } // leave + don't resurrect
      else if (!isPseudoBuffer(key) && !isBouncerServiceNick(key)) {
        clearPmPeerOffline(buf.name || name);
        // Drop MONITOR only when they aren't also on the friends list.
        const kept = get().friends.some((f) => canon(f) === key);
        if (!kept) get().client?.ircv3.monitor('-', buf.name || name);
      }
      dropBuffer(key);
      set({ profileUser: '' });
    },

    finishPmHistoryClose(clear) {
      const offer = get().pmHistoryClose;
      if (!offer) return;
      const nick = offer.nick;
      set({ pmHistoryClose: null });
      if (clear && get().account && mphistoryModuleLoaded(get().client) && nick && !/[\s,]/.test(nick) && nick[0] !== '#' && nick[0] !== '&') {
        const key = canon(nick);
        if (!get().pmHistoryClearing[key]) {
          set({ pmHistoryClearing: { ...get().pmHistoryClearing, [key]: true } });
          get().client?.send(`MPHISTORY CLEAR ${nick}`);
        }
      }
      patchBuffer(nick, (b) => (b.mphistoryReplay ? { ...b, mphistoryReplay: false } : b));
      get().closeBuffer(nick);
    },

    dismissPmHistoryClose() {
      if (get().pmHistoryClose) set({ pmHistoryClose: null });
    },

    askClearAllPmHistory() {
      const phase = get().pmHistoryClearAll?.phase;
      if (phase === 'confirm' || phase === 'pending') return;
      if (get().status !== 'registered' || !get().account || !mphistoryModuleLoaded(get().client)) return;
      set({ pmHistoryClearAll: { phase: 'confirm' }, pmHistoryClearError: '' });
    },

    confirmClearAllPmHistory() {
      const client = get().client;
      if (!client || get().status !== 'registered' || !get().account || !mphistoryModuleLoaded(client)) return;
      if (get().pmHistoryClearAll?.phase !== 'confirm') return;
      client.send('MPHISTORY CLEAR *');
      set({ pmHistoryClearAll: { phase: 'pending' } });
    },

    dismissClearAllPmHistory() {
      if (get().pmHistoryClearAll) set({ pmHistoryClearAll: null });
    },

    clearPmHistory(nick) {
      const client = get().client;
      if (!client || get().status !== 'registered' || !get().account || !mphistoryModuleLoaded(client)) return;
      const name = (nick || '').trim();
      if (!name || /[\s,]/.test(name) || name[0] === '#' || name[0] === '&') return;
      const key = canon(name);
      if (get().pmHistoryClearing[key]) return;
      set({ pmHistoryClearing: { ...get().pmHistoryClearing, [key]: true } });
      client.send(`MPHISTORY CLEAR ${name}`);
    },

    reorderSidebar(section, from, to) {
      const s = get();
      const live = section === 'channels' ? liveChannels(s.order) : liveQueries(s.order);
      const arranged = arrangeNames(live, s.sidebarOrder[section]);
      const next = moveName(arranged, from, to);
      if (next === arranged) return;
      const sidebarOrder = { ...s.sidebarOrder, [section]: next };
      saveSidebarOrder(sidebarOrder, ns);
      set({ sidebarOrder });
    },

    closeProfile() { set({ profileUser: '' }); },
    setModal(m) {
      set(m === 'settings'
        ? { modal: m, settingsSection: 'profil' }
        : { modal: m });
    },
    openSettings(section) {
      set({ modal: 'settings', settingsSection: section || 'profil' });
    },

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
      if (isPseudoBuffer(key) || isBouncerServiceNick(key) || (isChannelName(buf.name) && !buf.joined)) return;
      // anchor on the oldest real message currently shown
      const oldest = buf.messages.find((m) => m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice');
      if (!oldest) return;
      set({ historyLoading: { ...s.historyLoading, [key]: true } });
      client.ircv3.chathistoryBefore(buf.name, new Date(oldest.ts).toISOString(), 50);
      // safety: clear the spinner if the server never answers.
      setTimeout(() => set({ historyLoading: { ...get().historyLoading, [key]: false } }), 8000);
    },

    setParentalControls(on) {
      set({ parentalControls: !!on });
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
      // EntreNous callerid: mirror into ACCEPT allow-list (+g / parental).
      bus.emit('friends:add', n);
    },

    removeFriend(nick) {
      const next = get().friends.filter((f) => f.toLowerCase() !== nick.toLowerCase());
      saveFriends(next); syncGlobal();
      const online = { ...get().friendsOnline }; delete online[nick.toLowerCase()];
      set({ friends: next, friendsOnline: online });
      get().client?.ircv3.monitor('-', nick);
      bus.emit('friends:remove', nick);
    },

    loadBanList(channel) {
      const key = canon(channel);
      const c = get().client;
      // Reset list state; numerics refill them.
      set({
        banlists: { ...get().banlists, [key]: [] },
        exceptlists: { ...get().exceptlists, [key]: [] },
        invexlists: { ...get().invexlists, [key]: [] },
        filterlists: { ...get().filterlists, [key]: [] },
        exemptlists: { ...get().exemptlists, [key]: [] },
        autooplists: { ...get().autooplists, [key]: [] },
      });
      const typeA = (c?.server.isupport.CHANMODES || '').split(',')[0] || 'b';
      c?.modeList(channel, 'b');
      if (typeA.includes('e')) c?.modeList(channel, 'e');
      if (typeA.includes('I')) c?.modeList(channel, 'I');
      if (typeA.includes('g')) c?.modeList(channel, 'g');
      if (typeA.includes('w')) c?.modeList(channel, 'w');
      if (typeA.includes('X')) c?.modeList(channel, 'X');
    },
    loadChannelMlock(channel) {
      if (!isChannelName(channel)) return;
      const account = get().account;
      if (!account) return;
      const nick = get().nick || '';
      void fetchChannelMlock(account, nick, channel).then((mlock) => {
        if (!mlock || get().client == null) return;
        helpers.ensureBuffer(channel);
        helpers.patchBuffer(channel, (b) => ({ ...b, mlock: mergeMlock(b.mlock, mlock) }));
      });
    },
    loadChanServPublic(channel) {
      if (!isChannelName(channel)) return;
      const account = get().account;
      if (!account) return;
      const nick = get().nick || '';
      void fetchChanServPublic(account, nick, channel).then((info) => {
        if (get().client == null) return;
        if (!info.founder && !info.description && info.official === undefined
          && info.topicLock === undefined) return;
        helpers.ensureBuffer(channel);
        helpers.patchBuffer(channel, (b) => ({
          ...b,
          ...(info.founder ? { csFounder: info.founder } : {}),
          ...(info.description ? { csDescription: info.description } : {}),
          ...(info.official !== undefined ? { csOfficial: info.official } : {}),
          ...(info.topicLock !== undefined ? { csTopicLock: info.topicLock } : {}),
        }));
      });
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
      // Sync mute to the server so Web Push respects the same preference.
      // Guests cannot SET buffer metadata (ircv3_metadata requireaccount) — keep local only.
      const muted = level === 'mute';
      const buf = get().buffers[key];
      const target = buf?.name ?? name;
      if (!get().account) {
        if (muted) serverLine(i18n.t('metadata.muteSyncNeedAccount', { target }), 'info');
        return;
      }
      if (buf?.isChannel && !buf.joined) {
        if (muted) serverLine(i18n.t('metadata.muteSyncNotJoined', { target }), 'warning');
        return;
      }
      const sync = get().client?.ircv3.setBufferMuted(target, muted);
      if (sync === 'no-cap') {
        if (muted) serverLine(i18n.t('metadata.muteSyncNoCap'), 'warning');
      } else if (sync === 'sent') {
        trackBufferMuteSync(target, muted ? 'set-on' : 'set-off');
        serverLine(i18n.t('metadata.muteSyncPending', { target }), 'info');
      }
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
    confirmNickRecover() {
      const s = get();
      const offer = s.nickRecoverOffer;
      const target = (offer?.target || s.wantedNick || '').trim();
      const account = (s.account || '').trim();
      if (!target || !s.client || !account || offer?.pending || offer?.done) return;
      // Identified session: Anope accepts RECOVER without the password.
      // Never auto-run — only this explicit click. Prefer JSON-RPC (faster).
      set({ nickRecoverOffer: { target, pending: true, dismissed: false, done: false } });
      const clientAtStart = s.client;
      void (async () => {
        const { nickServRecover } = await import('./store/nickserv-info');
        const via = await nickServRecover(account, s.nick, target);
        const cur = get();
        if (cur.client !== clientAtStart) return;
        if (via === 'fail') {
          set({ nickRecoverOffer: { target, pending: false, dismissed: false, done: false } });
          return;
        }
        if (canon(cur.nick) === canon(target)) {
          set({ nickRecoverOffer: { target, pending: false, dismissed: false, done: true } });
          return;
        }
        // RPC already finished services-side; IRC path needs a short settle.
        const delay = via === 'rpc' ? 120 : 900;
        window.setTimeout(() => {
          const now = get();
          if (now.client !== clientAtStart) return;
          if (canon(now.nick) === canon(target)) {
            set({ nickRecoverOffer: { target, pending: false, dismissed: false, done: true } });
            return;
          }
          now.client?.setNick(target);
        }, delay);
      })();
    },
    dismissNickRecover() {
      const offer = get().nickRecoverOffer;
      if (!offer) return;
      set({ nickRecoverOffer: { ...offer, pending: false, dismissed: true } });
    },
    refreshNickRecoverOffer,
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
      // Never MARKREAD the fake $server console — the ircd treats it as a nick
      // and replies 401, which used to land in the channel you just joined.
      if (prev && prev !== key && !isPseudoBuffer(prev) && !isBouncerServiceNick(prev)) {
        const pb = get().buffers[prev];
        if (pb && pb.messages.length) {
          const latest = pb.messages[pb.messages.length - 1].ts;
          if (latest > pb.readTs) {
            pushMarkRead(pb.name, latest);
            patchBuffer(prev, (b) => ({ ...b, readTs: latest }));
          }
          pushDisplayed(pb.name);
        }
      }
      patchBuffer(key, (b) => ({ ...b, unread: 0, highlight: false }));
      // Query windows have no nicklist — copy the peer's account from a shared
      // channel / WHOIS / GECOS cache so PM avatars resolve without a fresh WHOIS.
      if (!isChannelName(key) && !isPseudoBuffer(key) && !isBouncerServiceNick(key)) {
        const s = get();
        const buf = s.buffers[key];
        const peerNick = buf?.name || name;
        const already = buf?.members[peerNick]?.account
          || Object.values(buf?.members || {}).find((m) => canon(m.nick) === key)?.account;
        if (!already) {
          let account = s.whois[peerNick]?.account || profileCache.get(key)?.account;
          if (!account) {
            for (const w of Object.values(s.whois)) {
              if (canon(w.nick) === key && w.account) { account = w.account; break; }
            }
          }
          if (!account) {
            for (const n of s.order) {
              const b = s.buffers[n];
              if (!b?.isChannel) continue;
              const m = b.members[peerNick] || Object.values(b.members).find((x) => canon(x.nick) === key);
              if (m?.account) { account = m.account; break; }
            }
          }
          if (account) rememberQueryAccount(patchBuffer, peerNick, peerNick, account);
        }
        if (s.account && s.nick) rememberQueryAccount(patchBuffer, peerNick, s.nick, s.account);
      }
      set({ active: key });
      // Phone: hide the left drawer so the conversation is on screen (Explore /
      // gallery join never went through a sidebar row, so they used to leave it open).
      closeMobileNav();
    },
    markAllRead() {
      const s = get();
      // Advance the server-side read marker for every buffer with new messages…
      for (const name of s.order) {
        if (isPseudoBuffer(name) || isBouncerServiceNick(name)) continue;
        const b = s.buffers[name];
        if (b?.messages.length) {
          const latest = b.messages[b.messages.length - 1].ts;
          if (latest > b.readTs) pushMarkRead(b.name, latest);
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
      if (s.chatCovered) return;
      const key = s.active;
      if (isPseudoBuffer(key) || isBouncerServiceNick(key)) return;
      const b = s.buffers[key];
      if (!b || !b.messages.length) return;
      const latest = b.messages[b.messages.length - 1].ts;
      if (latest > b.readTs) {
        patchBuffer(key, (bf) => ({ ...bf, readTs: latest, unread: 0, highlight: false }));
        const now = Date.now();
        if (now - (readMarkSent[key] || 0) > 2000) {
          readMarkSent[key] = now;
          pushMarkRead(b.name, latest);
        }
      }
      pushDisplayed(b.name);
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
      const n = nick.trim();
      if (!n) return;
      const lc = n.toLowerCase();
      const cur = get().ignored;
      const was = cur.some((x) => x.toLowerCase() === lc);
      const next = was ? cur.filter((x) => x.toLowerCase() !== lc) : [...cur, n];
      saveIgnored(next); syncGlobal();
      set({ ignored: next });
      // EntreNous callerid: mirror into deny / SILENCE blacklist.
      bus.emit(was ? 'ignore:remove' : 'ignore:add', n);
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
      // One LIST in flight is enough — a second would race 321/322/323.
      // Retry is allowed when still empty (the first LIST likely never came back).
      if (get().listLoading && get().channels.length) return;
      set({ listLoading: true });
      get().client?.list();
    },

    toggleReaction(msgid, emoji) {
      const { client, active } = get();
      client?.ircv3.react(active, msgid, emoji);
    },

    redact(msgid) {
      const { client, active } = get();
      // Optimistic tombstone — don't wait for the REDACT echo, and clear the body
      // so a racing CHATHISTORY/+H replay can't flash the image back.
      if (active && msgid) {
        patchBuffer(active, (b) => ({
          ...b,
          messages: b.messages.map((m) => (
            m.id === msgid || m.msgid === msgid
              ? { ...m, redacted: true, text: '' }
              : m
          )),
        }));
      }
      client?.ircv3.redact(active, msgid);
    },

    uploadImage,
    uploadAudio,
    deleteHostedFile,

    // Surface a one-off system line in a buffer (used by UI for local hints).
    pushSystem(buffer, text) { sysLine(buffer || get().active, text, 'system'); },
    // Local-only chat line (e.g. HelpServ welcome plugin) — never hits the wire.
    // asSelf: render as our own bubble (callerid pending DM when echo never arrives).
    pushLocal(buffer, text, from = '', kind: MessageKind = 'privmsg', asSelf = false) {
      const target = (buffer || get().active || '').trim();
      const body = (text || '').trim();
      if (!target || !body) return;
      ensureBuffer(target);
      const self = !!asSelf;
      addMessage(target, {
        id: newId(),
        bufferName: target,
        from: self ? (from.trim() || get().nick) : (from || '').trim(),
        text: body,
        ts: Date.now(),
        kind,
        self,
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
      // Top-bar channel modes: extended parameters require the base modes line.
      if (key === 'showChannelModes' && value === false) prefs.showExtendedModes = false;
      if (key === 'showExtendedModes' && value === true && !prefs.showChannelModes) return;
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
  // Keep identity-scoped state (prefs / friends / ignored / highlights) consistent
  // across networks: any store that changes it dispatches, every store re-reads.
  if (typeof window !== 'undefined') {
    window.addEventListener('orbit:globalsync', () => store.setState({
      prefs: getPrefs(), friends: loadFriends(), ignored: loadIgnored(), highlightWords: loadStr(HIGHLIGHT_KEY),
    }));
  }
  // Warm FILEHOST once the NickServ account is known — first 📷 must not wait.
  let lastFilehostPrefetch = '';
  store.subscribe((s) => {
    if (s.status !== 'registered' || !s.account || !s.client) {
      if (!s.account) lastFilehostPrefetch = '';
      return;
    }
    const key = s.account;
    if (key === lastFilehostPrefetch) return;
    lastFilehostPrefetch = key;
    void prefetchFilehostToken();
  });
  // When NickServ account / nick changes, reload this identity's persisted data.
  onOwnerChange(() => {
    const prefs = getPrefs();
    applyPrefs(prefs);
    store.setState({
      prefs,
      friends: loadFriends(),
      ignored: loadIgnored(),
      highlightWords: loadStr(HIGHLIGHT_KEY),
      notifyLevel: loadNotify(ns),
      pins: loadPins(ns),
      sidebarOrder: loadSidebarOrder(ns),
    });
  });
  return store;
}
function syncGlobal() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('orbit:globalsync')); }

// The primary network. Existing single-network usage is unchanged.
export const useChat = createChatStore();
