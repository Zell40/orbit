// Buffer/message state helpers for the chat store. Created per store instance
// (they close over set/get + the network's closedChannels); the store destructures
// the returned object so its call sites are unchanged.
import type { StoreApi } from 'zustand';
import { canon, isChannelName, newId, SERVER, isPseudoBuffer } from './context';
import type { Buffer, ChatMessage, Member, MessageKind, WhoisInfo, IrcMessage } from '../irc/types';
import type { ChatState } from '../store';

type S = StoreApi<ChatState>['setState'];
type G = StoreApi<ChatState>['getState'];

const WHOIS_CAP = 64; // most WHOIS entries anyone actually views at once; bounds server spam
const QUERY_CAP = 100; // open query (PM) windows; far above real use, caps a server PM flood

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


/** Join LineWrapper fragments; keep list/notice items on their own line. */
function joinCoalescedText(prev: string, next: string, kind?: MessageKind): string {
  if (!prev) return next;
  if (!next) return prev;
  const b = next.replace(/^\s+/, '');
  // Each coalesced NOTICE frame → its own line (Bac, Operateur, …)
  if (kind === 'notice') {
    return `${prev.replace(/\s+$/, '')}\n${b}`;
  }
  // Bullet / section lines from bots (Petit Bac !jeu liste, …)
  if (/^[•·▪▸►*]\s/.test(b) || /^[\u{1F300}-\u{1FAFF}]/u.test(b)) {
    return `${prev.replace(/\s+$/, '')}\n${b}`;
  }
  // Bac-style player feedback "Nick: …"
  if (/^[^\s:]{1,32}:\s/.test(b) && !/^(https?|ftp):/i.test(b)) {
    return `${prev.replace(/\s+$/, '')}\n${b}`;
  }
  if (/^━{3,}/.test(b)) {
    return `${prev.replace(/\s+$/, '')}\n${b}`;
  }
  if (/[:：]\s*$/.test(prev) && b.length > 0) {
    return `${prev.replace(/\s+$/, '')}\n${b}`;
  }
  if (/[.!?…]$/.test(prev.trim()) && /^[A-ZÀÂÄÆÇÉÈÊËÏÎÔŒÙÛÜŸ0-9(\[]/.test(b)) {
    return `${prev.replace(/\s+$/, '')}\n${b}`;
  }
  if (/\s$/.test(prev) || /^\s/.test(next)) return prev + next;
  return `${prev} ${next}`;
}

/** JOIN/TOPIC/… replayed by event-playback after the live line already landed. */
const REPLAY_EVENT_KINDS = new Set(['join', 'part', 'quit', 'topic', 'nick', 'mode', 'kick', 'ban']);
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
      // Live JOIN/TOPIC vs CHATHISTORY event-playback: same event, different id
      // and often a few seconds of clock skew (sysLine used to stamp Date.now()).
      if (isReplayEvent(m)) {
        const i = b.messages.findIndex((x) => sameReplayEvent(x, m));
        if (i !== -1) {
          const cur = b.messages[i];
          if ((m.msgid && !cur.msgid) || m.ts < cur.ts || (m.mask && !cur.mask)) {
            const msgs = b.messages.slice();
            msgs[i] = {
              ...cur,
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
          const joined = joinCoalescedText(last.text, m.text, m.kind);
          msgs[msgs.length - 1] = { ...last, text: joined, ts: m.ts };
          return { ...b, messages: msgs };
        }
      }
      // Status console only bumps unread when the Status page is visible in the list.
      const bumps = (name === SERVER && s.prefs.showStatus)
        || m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice';
      return {
        ...b,
        messages: [...b.messages, m].slice(-500),
        unread: key === s.active ? 0 : b.unread + (bumps ? 1 : 0),
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
    ensureBuffer(SERVER);
    if (!get().active) set({ active: SERVER });
    addMessage(SERVER, { id: newId(), bufferName: SERVER, from: '', text, ts: Date.now(), kind, self: false });
  }

  function patchWhois(nick: string, fn: (w: WhoisInfo) => WhoisInfo): void {
    const s = get();
    const cur = s.whois[nick] ?? { nick, loading: true };
    const whois: Record<string, WhoisInfo> = { ...s.whois, [nick]: fn(cur) };
    // A hostile server can stream WHOIS-reply numerics for endless fake nicks
    // (and may never send the 318 that would prune them). Bound the map, keeping
    // the actively-viewed profile and the entry just touched.
    const keys = Object.keys(whois);
    if (keys.length > WHOIS_CAP) {
      const keepUser = get().profileUser;
      for (const k of keys.filter((x) => x !== keepUser && x !== nick).slice(0, keys.length - WHOIS_CAP))
        delete whois[k];
    }
    set({ whois });
  }
  return { ensureBuffer, patchBuffer, dropBuffer, patchMemberEverywhere, addMessage, tsOf, msgSig, sameReplayEvent, sysLine, serverLine, patchWhois };
}

export type StoreHelpers = ReturnType<typeof makeHelpers>;
