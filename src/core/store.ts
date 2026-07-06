import { create } from 'zustand';
import i18n from './i18n';
import { IrcClient } from './irc/client';
import { initNotify } from '../platform/notify';
import { getPrefs, savePrefs, applyPrefs, type Prefs } from '../ui/prefs';
import type { Buffer, ConnectOptions, WhoisInfo } from './irc/types';
import { usePluginRegistry } from '../modules/registry';
import { getConfig } from './config';
import { stripFormatting, tidyOutgoing } from './store/text';
import { isService, maskSecret, detectServiceLeak } from './services';
import { HIGHLIGHT_KEY, loadStr, saveStr, loadIgnored, saveIgnored, loadFriends, saveFriends, loadNotify, saveNotify, loadPins, savePins, togglePinIn, unpinIn, type NotifyLevel, type Pin } from './store/persistence';
import { SERVER, newId, canon, isChannelName, resetBatches } from './store/context';
import { fetchTimeout } from '../lib/net';
import { getTheme } from '../themes';
export { SERVER } from './store/context';
import { makeHelpers } from './store/helpers';
import { makeHandler } from './store/handler';



// Pending /FILEHOST token request (resolved when the server NOTICEs the upload URL).
const filehost: { resolve: ((token: string) => void) | null; reject: ((err: Error) => void) | null; timer: ReturnType<typeof setTimeout> | null } = { resolve: null, reject: null, timer: null };




export type Modal = '' | 'join' | 'settings' | 'explore' | 'friends' | 'chanadmin' | 'report' | 'switcher' | 'shortcuts';
export interface ChannelInfo { name: string; users: number; topic: string }
export interface KickInfo { channel: string; by: string; reason: string; kind: 'kick' | 'ban' | 'mute' }

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
  kicked: KickInfo | null; // last time we got kicked — drives the dismissible toast
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

// A chat store is created PER NETWORK (multi-network) — each owns its own
// connection, buffers, nick and per-instance throttles. `useChat` below is the
// primary (default) network; additional ones come from the networks registry.
export function createChatStore(ns = '') {
  let lastTypingSent = 0;
  const closedChannels = new Set<string>(); // channels the user explicitly closed — not auto-resurrected
  const knownServices = new Set<string>(); // canon nicks the server tagged as services (example.org/service)
  const lastCantSend: Record<string, number> = {}; // throttle the "you can't write here" notice per channel
  const lastAwayNotice: Record<string, number> = {}; // throttle the "X is away" notice per query
  const store = create<ChatState>((set, get) => {
  // Buffer/message helpers live in store/helpers.ts.
  const helpers = makeHelpers(set, get, closedChannels);
  const { ensureBuffer, patchBuffer, dropBuffer, addMessage, sysLine } = helpers;

  const handle = makeHandler({ set, get, helpers, closedChannels, knownServices, lastCantSend, lastAwayNotice, filehost });

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
    kicked: null,

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
        opts.username = opts.password ? ident(opts.nick, guest) : guest;
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
        resetBatches(); // drop any batch left half-open when the socket dropped
        knownServices.clear(); // re-learn services after reconnect rather than accrete forever
        set({ reconnectIn: secs as number });
        sysLine(SERVER, i18n.t('system.reconnecting', { secs }), 'system');
      });
      client.on('message', (m) => handle(m));
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

    notifyTyping() {
      const { client, active } = get();
      if (!client || !active || !isChannelName(active)) return;
      const now = Date.now();
      if (now - lastTypingSent > 3000) { lastTypingSent = now; client.ircv3.sendTyping(active, 'active'); }
    },

    sendInput(text) {
      const { client, active } = get();
      if (!client || !active || !text.trim()) return;

      // Detect /commands from the FORMATTING-STRIPPED text: "sticky" bold/italic
      // etc. can prefix the line with a control byte, which would otherwise hide
      // the leading '/' and send the command as a plain (formatted) message.
      const cmdline = stripFormatting(text).trimStart();

      // The Console: a bare line (no leading slash) is a raw IRC command line — the
      // classic mIRC status-window convenience. Slash-commands fall through to the
      // normal dispatch below so /whois, /msg, /join … actually behave (raw-sending
      // them would swallow /whois's reply and mangle /msg into an invalid command);
      // channel commands run from here have no active channel so they go raw too.
      if (active === SERVER && !cmdline.startsWith('/')) {
        const raw = cmdline.trim();
        if (!raw) return;
        sysLine(SERVER, `» ${raw}`, 'system');
        client.send(raw);
        return;
      }

      if (cmdline.startsWith('/')) {
        const [cmd, ...rest] = cmdline.slice(1).split(' ');
        const arg = rest.join(' ');
        // From the Console there's no active channel to act on: a channel command
        // (the user supplies #chan in the args, e.g. /kick #c nick) is sent raw and
        // its reply returns here. Returns true when it handled the line.
        const rawFromConsole = (): boolean => {
          if (active !== SERVER) return false;
          const raw = cmdline.slice(1);
          sysLine(SERVER, `» ${raw}`, 'system');
          client.send(raw);
          return true;
        };
        switch (cmd.toLowerCase()) {
          case 'me': if (active !== SERVER) client.action(active, arg); break;
          case 'join': client.join(arg); get().setActive(arg.split(' ')[0]); break;
          case 'part': if (!rawFromConsole()) client.part(active); break;
          case 'nick': client.setNick(arg); break;
          case 'whois': {
            const who = arg.trim().split(' ')[0] || (active === SERVER ? get().nick : active);
            if (!who) break;
            // yomirc mimics classic mIRC: print WHOIS to the active window as text.
            if (getTheme().startsWith('yomirc')) get().whoisText(who); else get().openUser(who);
            break;
          }
          case 'msg': {
            const [t, ...m] = rest; const body = m.join(' ');
            if (!t || !body) break;
            client.privmsg(t, body);
            // Optimistic echo (masked for services) so the user sees feedback.
            if (!client.ircv3.hasCap('echo-message')) {
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
            if (!client.ircv3.hasCap('echo-message')) {
              const dest = isChannelName(t) ? t : (active || SERVER);
              addMessage(dest, {
                id: newId(), bufferName: dest, from: get().nick,
                text: isChannelName(t) ? body : `→ ${t} : ${body}`,
                ts: Date.now(), kind: 'notice', self: true,
              });
            }
            break;
          }
          case 'topic': if (!rawFromConsole() && isChannelName(active)) client.setTopic(active, arg); break;
          case 'kick': { if (rawFromConsole()) break; const [t, ...r] = rest; if (isChannelName(active) && t) client.kick(active, t, r.join(' ')); break; }
          case 'op': if (isChannelName(active) && arg) client.setUserMode(active, 'o', true, arg.trim()); break;
          case 'deop': if (isChannelName(active) && arg) client.setUserMode(active, 'o', false, arg.trim()); break;
          case 'voice': if (isChannelName(active) && arg) client.setUserMode(active, 'v', true, arg.trim()); break;
          case 'ignore': if (arg.trim()) get().toggleIgnore(arg.trim()); break;
          case 'unignore': if (arg.trim()) get().toggleIgnore(arg.trim()); break;
          case 'list': get().refreshChannels(); get().setModal('explore'); break; // open the Explore window
          default: {
            const pc = usePluginRegistry.getState().commands.find((c) => c.name === cmd.toLowerCase());
            if (pc) { try { pc.run(rest, arg); } catch (e) { console.error(`[plugins] /${cmd} threw`, e); } }
            else { if (active === SERVER) sysLine(SERVER, `» ${cmdline.slice(1)}`, 'system'); client.send(cmdline.slice(1)); } // raw passthrough (formatting stripped)
          }
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
        if (!client.ircv3.hasCap('echo-message')) {
          addMessage(leak.service, {
            id: newId(), bufferName: leak.service, from: get().nick,
            text: maskSecret(leak.command), ts: Date.now(), kind: 'privmsg', self: true,
          });
        }
        return;
      }

      const reply = get().replyTarget;
      // Tidy channel/DM messages so they can't be padded/spammed with runs of
      // blank space; leave service messages byte-for-byte (never touch creds).
      const body = isService(active) ? text : tidyOutgoing(text);
      if (!body) return;
      // +draft/channel-context: on a DM that was started from a channel, tag it.
      const ctx = !isChannelName(active) ? get().pmContext[canon(active)] : undefined;
      if (reply) { client.privmsgReply(active, body, reply.id, ctx); set({ replyTarget: null }); }
      else client.privmsg(active, body, ctx);
      if (isChannelName(active)) { client.ircv3.sendTyping(active, 'done'); lastTypingSent = 0; }
      // Optimistic echo only if the server won't echo it back to us.
      if (!client.ircv3.hasCap('echo-message')) {
        addMessage(active, {
          id: newId(), bufferName: active, from: get().nick,
          text: isService(active) ? maskSecret(text) : body,
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
      saveIgnored(next); syncGlobal();
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
      client?.ircv3.react(active, msgid, emoji);
    },

    redact(msgid) {
      const { client, active } = get();
      client?.ircv3.redact(active, msgid);
    },

    async uploadImage(file) {
      const { client, active } = get();
      if (!client || !active || active === SERVER) return;
      if (!file.type.startsWith('image/')) { sysLine(active, `⚠️ ${i18n.t('system.onlyImages')}`, 'system'); return; }
      if (file.size > 16 * 1024 * 1024) { sysLine(active, `⚠️ ${i18n.t('system.imageTooLarge')}`, 'system'); return; }

      sysLine(active, `📤 ${i18n.t('system.sendingImage', { name: file.name })}`, 'system');
      try {
        // 1) Ask the server for a one-time upload token via /FILEHOST.
        const token = await new Promise<string>((resolve, reject) => {
          filehost.resolve = resolve; filehost.reject = reject;
          filehost.timer = setTimeout(() => { filehost.resolve = null; filehost.reject = null; reject(new Error('timeout')); }, 10000);
          client.send('FILEHOST');
        });
        // 2) Upload the file to the Tchatou filehost (same origin as the app).
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetchTimeout(`/upload?token=${encodeURIComponent(token)}`, { method: 'POST', body: fd }, 30000);
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
        if (!client.ircv3.hasCap('echo-message')) {
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
          sysLine(active, `⚠️ ${human}`, 'system');
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
      if (blob.size > 16 * 1024 * 1024) { sysLine(active, `⚠️ ${i18n.t('system.imageTooLarge')}`, 'system'); return; }

      sysLine(active, `📤 ${i18n.t('system.sendingVoice')}`, 'system');
      try {
        const token = await new Promise<string>((resolve, reject) => {
          filehost.resolve = resolve; filehost.reject = reject;
          filehost.timer = setTimeout(() => { filehost.resolve = null; filehost.reject = null; reject(new Error('timeout')); }, 10000);
          client.send('FILEHOST');
        });
        const fd = new FormData();
        fd.append('file', new File([blob], `voice.${ext}`, { type: blob.type || 'audio/webm' }));
        const res = await fetchTimeout(`/upload?token=${encodeURIComponent(token)}`, { method: 'POST', body: fd }, 30000);
        if (!res.ok) {
          let detail = `http_${res.status}`;
          try { const j = await res.json(); if (j?.detail) detail = `${res.status}:${j.detail}`; } catch { /* ignore */ }
          throw new Error(detail);
        }
        const data = await res.json() as { url: string };
        const caption = `🎤 ${i18n.t('system.shareVoice', { url: data.url })}`;
        client.action(active, caption);
        if (!client.ircv3.hasCap('echo-message')) {
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
          sysLine(active, `⚠️ ${human}`, 'system');
        }
      }
    },

    // ---- account management (draft/account-registration) ----
    accountRegister(account, email, password) {
      const { client } = get();
      if (!client) return;
      set({ reg: { step: 'idle', account, busy: true, error: '', info: '', challengeUrl: '' } });
      client.ircv3.register(account, email, password);
    },
    accountVerify(code) {
      const { client, reg } = get();
      if (!client || !reg.account) return;
      set({ reg: { ...reg, busy: true, error: '' } });
      client.ircv3.verify(reg.account, code);
    },
    accountResend() {
      const { client, reg } = get();
      if (!client || !reg.account) return;
      set({ reg: { ...reg, error: '', info: i18n.t('reg.codeResent') } });
      client.ircv3.resend(reg.account);
    },
    // Change the account password via Django (same-origin proxy → swaygo). The
    // server updates BOTH Anope (IRC login) AND Django (website) so they never
    // drift — NOT a raw NickServ SET PASSWORD, which would only touch Anope.
    async accountChangePassword(currentPassword, newPassword) {
      const account = get().account;
      if (!account) return { ok: false, message: i18n.t('reg.needAccount') };
      try {
        const res = await fetchTimeout('/accounts/api/change_password/', {
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
        const res = await fetchTimeout('/cloudflare/verify_complete/', {
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
