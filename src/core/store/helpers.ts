// Buffer/message state helpers for the chat store. Created per store instance
// (they close over set/get + the network's closedChannels); the store destructures
// the returned object so its call sites are unchanged.
import type { StoreApi } from 'zustand';
import { canon, isChannelName, newId, SERVER, isPseudoBuffer } from './context';
import { isStatusService } from '../services';
import { stripFormatting } from './text';
import type { Buffer, ChatMessage, Member, MessageKind, WhoisInfo, IrcMessage } from '../irc/types';
import type { ChatState } from '../store';

type S = StoreApi<ChatState>['setState'];
type G = StoreApi<ChatState>['getState'];

const WHOIS_CAP = 64; // most WHOIS entries anyone actually views at once; bounds server spam
const QUERY_CAP = 100; // open query (PM) windows; far above real use, caps a server PM flood

/** Map key for an in-flight WHOIS, ignoring CASEMAPPING so `/whois bob` matches `311 Bob`. */
export function findWhoisKey(table: Record<string, WhoisInfo>, nick: string): string | undefined {
  if (!nick) return undefined;
  if (table[nick]) return nick;
  const folded = canon(nick);
  for (const k of Object.keys(table)) {
    if (canon(k) === folded) return k;
  }
  return undefined;
}

/** Member-map key for a nick, ignoring CASEMAPPING (`Quen` vs `quen`). */
export function findMemberKey(members: Record<string, Member>, nick: string): string | undefined {
  if (!nick) return undefined;
  if (members[nick]) return nick;
  const folded = canon(nick);
  for (const k of Object.keys(members)) {
    if (canon(k) === folded) return k;
  }
  return undefined;
}

/** Remember a services account on a query buffer so PM rows can resolve avatars. */
export function rememberQueryAccount(
  patchBuffer: (name: string, fn: (b: Buffer) => Buffer) => void,
  dest: string,
  nick: string,
  account?: string,
): void {
  if (!account || !nick) return;
  if (isChannelName(dest) || isPseudoBuffer(dest)) return;
  patchBuffer(dest, (b) => {
    if (b.isChannel) return b;
    const cur = b.members[nick];
    if (cur?.account === account) return b;
    return { ...b, members: { ...b.members, [nick]: { ...(cur ?? { nick, prefix: '' }), account } } };
  });
}


/** Join LineWrapper fragments; keep every other frame on its own line. */
function joinCoalescedText(prev: string, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  const b = next.replace(/^\s+/, '');
  const plain = stripFormatting(b).replace(/^\s+/, '');
  // One frame, one line — the way a classic client shows a bot's output. The sole
  // exception is what this function exists for: Anope's LineWrapper cutting ONE
  // long sentence across frames. Such a fragment reads as mid-sentence, so it
  // starts lowercase and the frame before it stopped without closing anything.
  //
  // Listing the structures worth breaking on instead (bullets, `#15 …`, section
  // headers, `Nick: …`) is the wrong way round: every bot invents its own layout,
  // and the ones we failed to guess — HelpServ's `LIST — lister les tickets` rows
  // among them — came out as one run-on paragraph.
  const wrapped = /^\p{Ll}/u.test(plain) && !/[.!?:;…]$/.test(prev.trim());
  if (!wrapped) return `${prev.replace(/[^\S\n]+$/, '')}\n${b}`;
  return /\s$/.test(prev) ? prev + b : `${prev} ${b}`;
}

/** JOIN/TOPIC/… replayed by event-playback after the live line already landed. */
const REPLAY_EVENT_KINDS = new Set(['join', 'part', 'quit', 'topic', 'nick', 'host', 'mode', 'kick', 'ban']);
const PRESENCE_REPLAY_KINDS = new Set(['join', 'part', 'quit']);
const REPLAY_DUP_MS = 90_000;

function isReplayEvent(m: ChatMessage): boolean {
  return REPLAY_EVENT_KINDS.has(m.kind);
}

export function sameReplayEvent(a: ChatMessage, b: ChatMessage): boolean {
  return isReplayEvent(a) && a.kind === b.kind
    && canon(a.from) === canon(b.from)
    && a.text === b.text
    && Math.abs(a.ts - b.ts) <= REPLAY_DUP_MS;
}

function kickTargetNick(m: ChatMessage): string {
  // Live/history kick text: "target" or "target\nreason".
  return String(m.text || '').split('\n')[0]?.trim() || '';
}

/**
 * True when a later leave/join means `prior` and `incoming` are different visits
 * (rapid reconnect), not the same event replayed by CHATHISTORY / +H.
 */
export function presenceInterrupted(
  messages: ChatMessage[],
  priorIdx: number,
  incoming: ChatMessage,
): boolean {
  if (!PRESENCE_REPLAY_KINDS.has(incoming.kind)) return false;
  const nick = canon(incoming.from);
  if (!nick || priorIdx < 0) return false;
  for (let j = priorIdx + 1; j < messages.length; j++) {
    const x = messages[j];
    if (incoming.kind === 'join') {
      if ((x.kind === 'part' || x.kind === 'quit') && canon(x.from) === nick) return true;
      if (x.kind === 'kick' && canon(kickTargetNick(x)) === nick) return true;
    } else if (x.kind === 'join' && canon(x.from) === nick) {
      // part/quit after a re-join = a new leave, not a replay of the old one.
      return true;
    }
  }
  return false;
}

/** Latest PRIVMSG/ACTION from someone else — drives the double-tick on our own
 *  lines (`peerReadTs`). Used live and after CHATHISTORY merge (replay skips
 *  the live "seen" path, so without this receipts vanish on join/reload). */
export function latestPeerMessageTs(messages: ChatMessage[]): number {
  let max = 0;
  for (const m of messages) {
    if (m.self || (m.kind !== 'privmsg' && m.kind !== 'action')) continue;
    if (m.ts > max) max = m.ts;
  }
  return max;
}

export function makeHelpers(set: S, get: G, closedChannels: Set<string>) {
  // Buffers are keyed by the CASEMAPPING-folded name (canon); Buffer.name keeps
  // the original display case so the UI shows "#Taverne" while "#taverne" maps
  // to the same buffer.
  function ensureBuffer(name: string): void {
    const key = canon(name);
    const s = get();
    if (s.buffers[key]) return;
    if (isStatusService(name)) return;
    if (isChannelName(name) && closedChannels.has(key)) return; // don't resurrect a closed channel
    let buffers = s.buffers, order = s.order, pmContext = s.pmContext;
    // Bound auto-opened query windows: a hostile server can PRIVMSG from endless
    // distinct nicks, each spawning a persistent window. Over the cap, evict the
    // oldest inactive query (channels and the active buffer are never touched).
    if (!isChannelName(name) && !isPseudoBuffer(name)) {
      const queries = order.filter((k) => buffers[k] && !buffers[k].isChannel && !isPseudoBuffer(k));
      if (queries.length >= QUERY_CAP) {
        const victim = queries.find((k) => k !== s.active);
        if (victim) {
          buffers = { ...buffers }; delete buffers[victim];
          order = order.filter((k) => k !== victim);
          if (victim in pmContext) { pmContext = { ...pmContext }; delete pmContext[victim]; }
        }
      }
    }
    const buf: Buffer = {
      name, isChannel: isChannelName(name), messages: [], members: {},
      topic: '', unread: 0, joined: false, readTs: 0, peerReadTs: 0, typing: {},
    };
    set({ buffers: { ...buffers, [key]: buf }, order: [...order, key], pmContext });
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
    // Drop the DM's channel-context too so it can't outlive the buffer forever.
    const pmContext = { ...s.pmContext }; delete pmContext[key];
    set({ buffers, order, active, pmContext });
  }

  function patchMemberEverywhere(nick: string, patch: Partial<Member>): void {
    const s = get();
    for (const name of s.order) {
      const b = s.buffers[name];
      const mk = findMemberKey(b.members, nick);
      if (!mk) continue;
      const m = b.members[mk];
      patchBuffer(name, (bb) => ({ ...bb, members: { ...bb.members, [mk]: { ...m, ...patch } } }));
    }
  }

  function promoteLocalOutgoing(name: string, text?: string): void {
    ensureBuffer(name);
    patchBuffer(name, (b) => {
      let i = -1;
      for (let j = b.messages.length - 1; j >= 0; j--) {
        const x = b.messages[j];
        if (!x.self || !x.id.startsWith('local-')) continue;
        if (x.kind !== 'privmsg' && x.kind !== 'action') continue;
        if (text !== undefined && x.text !== text) continue;
        i = j;
        break;
      }
      if (i < 0) return b;
      const msgs = b.messages.slice();
      const cur = msgs[i];
      // Drop the local- prefix so the receipt clock becomes a single "sent" tick
      // (no server echo for offline / mphistory-queued PMs).
      const id = cur.id.startsWith('local-') ? `queued-${cur.id.slice(6)}` : cur.id;
      msgs[i] = { ...cur, rowId: cur.rowId ?? cur.id, id, msgid: cur.msgid || id };
      return { ...b, messages: msgs };
    });
  }

  function addMessage(name: string, m: ChatMessage): void {
    if (isStatusService(name)) {
      name = SERVER;
      m = { ...m, bufferName: SERVER };
    }
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
          msgs[i] = {
            ...msgs[i],
            rowId: msgs[i].rowId ?? msgs[i].id,
            id: m.id, msgid: m.msgid ?? m.id,
            ts: m.ts, reactions: m.reactions ?? msgs[i].reactions,
          };
          return { ...b, messages: msgs };
        }
      }
      // History JOIN/PART/QUIT (old server-time) must not land on the salon timeline.
      if (b.isChannel && (m.kind === 'join' || m.kind === 'part' || m.kind === 'quit') && b.sessionJoinedAt
        && m.ts < b.sessionJoinedAt - 2500) return b;
      // Idempotent: the exact same message id already present → ignore.
      if (m.id && b.messages.some((x) => x.id === m.id)) return b;
      // Same server msgid under another row id (e.g. local-* then history) → ignore,
      // and never revive a tombstone from +H / CHATHISTORY.
      if (m.msgid) {
        const byMsgid = b.messages.find((x) => x.msgid === m.msgid || x.id === m.msgid);
        if (byMsgid) return b;
      }
      // +H often lacks msgid and uses a random id — fold onto an existing row with
      // the same content signature so a redacted image isn't duplicated below.
      if (m.kind === 'privmsg' || m.kind === 'action') {
        const sig = `${m.kind} ${m.from} ${Math.floor(m.ts / 1000)} ${m.text}`;
        const dup = b.messages.find((x) => (
          (x.kind === 'privmsg' || x.kind === 'action')
          && `${x.kind} ${x.from} ${Math.floor(x.ts / 1000)} ${x.text}` === sig
        ));
        if (dup) return b;
        // Redacted rows keep text:'' — still match by nick+second when history
        // tries to re-inject the original body.
        const tomb = b.messages.find((x) => x.redacted
          && (x.kind === 'privmsg' || x.kind === 'action')
          && canon(x.from) === canon(m.from)
          && Math.abs(x.ts - m.ts) <= 2000);
        if (tomb) return b;
      }
      // Live JOIN/TOPIC vs CHATHISTORY event-playback: same event, different id
      // and often a few seconds of clock skew (sysLine used to stamp Date.now()).
      // Presence: a QUIT then quick re-JOIN must NOT collapse onto the first JOIN
      // (same nick + same i18n text within 90s looked like a replay).
      if (isReplayEvent(m)) {
        const i = b.messages.findIndex((x) => sameReplayEvent(x, m));
        if (i !== -1 && !presenceInterrupted(b.messages, i, m)) {
          const cur = b.messages[i];
          if ((m.msgid && !cur.msgid) || m.ts < cur.ts || (m.mask && !cur.mask)) {
            const msgs = b.messages.slice();
            msgs[i] = {
              ...cur,
              rowId: cur.rowId ?? cur.id,
              id: m.msgid ? m.id : cur.id,
              msgid: m.msgid ?? cur.msgid,
              ts: Math.min(cur.ts, m.ts),
              mask: cur.mask || m.mask,
            };
            return { ...b, messages: msgs };
          }
          return b;
        }
      }
      // Anope/services LineWrapper splits long NOTICE/PRIVMSG text across multiple
      // IRC frames. Merge rapid consecutive lines from the same nick into one bubble.
      if ((m.kind === 'notice' || m.kind === 'privmsg') && !m.self && m.from && !m.replyTo) {
        const last = b.messages[b.messages.length - 1];
        if (
          last
          && last.kind === m.kind
          && !last.self
          && !last.replyTo
          && canon(last.from) === canon(m.from)
          && Math.abs(m.ts - last.ts) <= 2500
        ) {
          const msgs = b.messages.slice();
          const joined = joinCoalescedText(last.text, m.text);
          msgs[msgs.length - 1] = { ...last, text: joined, ts: m.ts };
          return { ...b, messages: msgs };
        }
      }
      // Status console only bumps unread when the Status page is visible in the list.
      const bumps = (name === SERVER && s.prefs.showStatus)
        || m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice';
      // A visual game can hide the active salon: still count a NOTICE there so
      // the hamburger badge moves. Channel PRIVMSG from the bot must not, or
      // every game line would ring the icon.
      const noticeWhileHidden = !!s.chatCovered && key === s.active && m.kind === 'notice' && !m.self;
      const bumpUnread = bumps && (key !== s.active || noticeWhileHidden);
      return {
        ...b,
        messages: [...b.messages, m].slice(-500),
        unread: b.unread + (bumpUnread ? 1 : 0),
        ...(noticeWhileHidden ? { highlight: true } : {}),
      };
    });
  }

  const tsOf = (msg: IrcMessage): number => {
    // A crafted `@time=garbage` parses to NaN; that would poison the dedup
    // signature (msgSig) and render "Invalid Date". Fall back to now.
    const t = msg.tags['time'] ? Date.parse(msg.tags['time']) : NaN;
    return Number.isFinite(t) ? t : Date.now();
  };

  // Content signature for dedup across history sources (+H replay vs CHATHISTORY).
  // Second-precision ts tolerates ms differences between the two replays.
  const msgSig = (m: ChatMessage): string =>
    `${m.kind}\0${m.from}\0${Math.floor(m.ts / 1000)}\0${m.text}`;

  function sysLine(name: string, text: string, kind: MessageKind, from = '', mask = '', ts?: number): void {
    addMessage(name, { id: newId(), bufferName: name, from, text, ts: ts ?? Date.now(), kind, self: false, mask: mask || undefined });
  }

  function serverLine(text: string, kind: MessageKind = 'system'): void {
    if (!text) return;
    // IRCOP / plugin divert: show the reply where the user is looking.
    const echo = get().echoServerTo;
    if (echo) {
      ensureBuffer(echo);
      addMessage(echo, { id: newId(), bufferName: echo, from: '', text, ts: Date.now(), kind, self: false });
      return;
    }
    ensureBuffer(SERVER);
    if (!get().active) set({ active: SERVER });
    addMessage(SERVER, { id: newId(), bufferName: SERVER, from: '', text, ts: Date.now(), kind, self: false });
  }

  /** Network-wide announce ($* / $$host / WALLOPS / GLOBOPS) into the active buffer. */
  function announceLine(text: string, kind: MessageKind = 'info'): void {
    if (!text) return;
    const dest = get().active || SERVER;
    ensureBuffer(dest);
    addMessage(dest, { id: newId(), bufferName: dest, from: '', text, ts: Date.now(), kind, self: false });
  }

  function patchWhois(nick: string, fn: (w: WhoisInfo) => WhoisInfo): void {
    const s = get();
    const key = findWhoisKey(s.whois, nick) ?? nick;
    const cur = s.whois[key] ?? { nick, loading: true };
    const whois: Record<string, WhoisInfo> = { ...s.whois, [key]: fn(cur) };
    // A hostile server can stream WHOIS-reply numerics for endless fake nicks
    // (and may never send the 318 that would prune them). Bound the map, keeping
    // the actively-viewed profile and the entry just touched.
    const keys = Object.keys(whois);
    if (keys.length > WHOIS_CAP) {
      const keepUser = get().profileUser;
      for (const k of keys.filter((x) => x !== keepUser && x !== key).slice(0, keys.length - WHOIS_CAP))
        delete whois[k];
    }
    set({ whois });
  }
  return { ensureBuffer, patchBuffer, dropBuffer, patchMemberEverywhere, addMessage, promoteLocalOutgoing, tsOf, msgSig, sameReplayEvent, sysLine, serverLine, announceLine, patchWhois };
}

export type StoreHelpers = ReturnType<typeof makeHelpers>;
