import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVER } from '@/core/store';
import { useActiveChat } from '@/core/networks';
import { MsgRow } from './MsgRow';
import { SystemLine } from './SystemLine';
import { EventGroup } from './EventGroup';
import { SearchResults } from './SearchResults';
import { useTheme } from '@/themes';

// Message kinds rendered as a status line (SystemLine); everything else
// (privmsg/action, plus any unknown kind) is a grouped message row (MsgRow).
const SYSTEM_KINDS = new Set(['notice', 'info', 'warning', 'mode', 'ban', 'topic', 'join', 'part', 'quit', 'nick', 'system']);
// Presence noise that gets folded into a single EventGroup line.
const GROUP_KINDS = new Set(['join', 'part', 'quit']);

// Cheap local-day key (YYYYMMDD) for detecting day boundaries without formatting
// every row. Unique per calendar day, so no cross-year collisions.
const dayIndex = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

export function MessageList() {
  const { t, i18n } = useTranslation();
  // One reusable Intl formatter; formatting is done only at day boundaries (rare),
  // never once per message per render.
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }), [i18n.language]);
  const active = useActiveChat((s) => s.active);
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  const search = useActiveChat((s) => s.search);
  const hideJoinQuit = useActiveChat((s) => s.prefs.hideJoinQuit);
  const mirc = useTheme().startsWith('yomirc');
  const loadMore = useActiveChat((s) => s.loadMoreHistory);
  const histLoading = useActiveChat((s) => !!s.historyLoading[s.active]);
  const histDone = useActiveChat((s) => !!s.historyDone[s.active]);
  const markReadHere = useActiveChat((s) => s.markReadHere);
  useActiveChat((s) => s.prefs.clock24); // re-render timestamps when the clock format changes
  const ref = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const prevHeight = useRef(0);
  const prevActive = useRef(active);
  const atBottom = useRef(true); // pinned to the very bottom → auto-follow new messages
  const [showJump, setShowJump] = useState(false);
  const count = buffer?.messages.length ?? 0;
  // The buffer is capped (slice(-500)), so once it's full its LENGTH stops changing
  // as new lines arrive. Keying the follow effect on the newest message's id (which
  // still changes) is what keeps auto-scroll alive in busy channels.
  const lastId = count ? buffer!.messages[count - 1].id : '';

  // Keep the viewport anchored: stick to the bottom for live messages, but when
  // older history is PREPENDED (we're at the top) preserve the reading position.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || search) return;
    const switched = prevActive.current !== active;
    prevActive.current = active;
    const grew = el.scrollHeight - prevHeight.current;
    const d = dividerRef.current;
    if (switched && d) {
      // Entering a channel that has unread → land on the "New messages" divider so
      // you read from where you left off, rather than jumping past it to the bottom.
      el.scrollTop = Math.max(0, d.offsetTop - 48);
    } else if (switched || atBottom.current) {
      // Buffer switch, or we were pinned to the bottom → follow the newest line.
      // atBottom is checked BEFORE the prepend heuristic on purpose: in a short
      // buffer the bottom itself sits at scrollTop < 80, so a burst of appended
      // lines (e.g. a /cs HELP reply) must scroll down to them rather than be
      // mistaken for a history prepend and leave them hidden under the composer.
      el.scrollTop = el.scrollHeight;
    } else if (el.scrollTop < 80 && grew > 0) {
      el.scrollTop = el.scrollHeight - prevHeight.current; // prepend while reading up → keep position
    }
    // Ended at the bottom → everything is read: advance the marker here (pre-paint,
    // so an incoming line never flashes a "New messages" divider before it clears).
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = dist < 64;    // follow only while pinned to the very bottom
    if (dist < 140) markReadHere();  // but count everything read across a wider band
    setShowJump(dist > 120);         // keep the jump button in sync as lines arrive
    prevHeight.current = el.scrollHeight;
  }, [count, lastId, active, search, markReadHere]);

  // Returning to a backgrounded tab: the browser freezes rAF and can report stale
  // layout while messages keep arriving, so the follow-pin drifts. Re-pin to the
  // bottom (if we were following) once a fresh frame lands, and resync the button.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        if (atBottom.current) el.scrollTop = el.scrollHeight;
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        setShowJump(dist > 120);
        if (dist < 140) markReadHere();
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markReadHere]);

  // The on-screen keyboard opening/closing resizes the VISUAL viewport, which
  // shrinks the message list WITHOUT moving its scrollTop — so a freshly-sent
  // message would otherwise land below the fold, hidden behind the keyboard.
  // If we were pinned to the bottom, re-pin once the new layout has settled.
  useEffect(() => {
    const pin = () => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; };
    // The newest lines slide out of view two ways: the list box SHRINKS (composer
    // growing, mobile keyboard) or its CONTENT GROWS after paint (a link-preview
    // card loads, an embed expands). Observe both — the box and the row flow.
    // ResizeObserver fires before paint, so re-pinning synchronously there keeps
    // the newest line in place with no visible jump (the shift never renders).
    const onResize = () => { if (atBottom.current) pin(); };
    // The mobile keyboard resizes the visual viewport, not the list, and its
    // scrollTop doesn't move — wait a frame for the new layout, then re-pin.
    const onViewport = () => { if (atBottom.current) requestAnimationFrame(pin); };
    const ro = new ResizeObserver(onResize);
    if (ref.current) ro.observe(ref.current);
    if (flowRef.current) ro.observe(flowRef.current);
    window.addEventListener('tchatou:vh', onViewport);
    window.visualViewport?.addEventListener('resize', onViewport);
    return () => {
      ro.disconnect();
      window.removeEventListener('tchatou:vh', onViewport);
      window.visualViewport?.removeEventListener('resize', onViewport);
    };
  }, []);

  // Coalesce scroll handling to one layout read per frame — a Mac trackpad fires
  // scroll events far faster than paints, and forcing layout on each one is what
  // makes a busy channel feel janky.
  const scrollRaf = useRef(0);
  const onScroll = () => {
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0;
      const el = ref.current;
      if (!el) return;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      // Follow only while pinned to the very bottom, so scrolling up even slightly
      // to read the last line stops the auto-scroll instead of yanking you down.
      atBottom.current = dist < 64;
      if (dist < 140) markReadHere(); // count read across a wider band
      // channels and private messages both have server-side history (not the console)
      if (el.scrollTop < 60 && buffer && buffer.name !== SERVER && !histLoading && !histDone) loadMore(active);
      // Once you're clearly scrolled up, offer a jump straight back to the newest
      // line — so a fast channel can't strand you.
      setShowJump(dist > 120);
    });
  };
  // Snap to the newest line and re-engage follow (used by the floating button).
  const jumpToBottom = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setShowJump(false);
    markReadHere();
  };

  if (!buffer) return <div className="empty">{t('sidebar.noChannel')}</div>;
  if (search.trim()) return <SearchResults messages={buffer.messages} query={search.trim()} />;

  const isConsole = buffer.name === SERVER;
  const rows: ReactNode[] = [];
  let lastFrom = '', lastTs = 0, lastKind = '';
  let lastDay = -1;
  let hadRead = false, dividerShown = false;
  // Consecutive join/part/quit lines are collected here and flushed as one
  // EventGroup when the run ends (a real message, a day break, the divider, …).
  let pending: typeof buffer.messages = [];
  const grouping = !mirc && !isConsole; // classic mIRC + the console keep per-line events
  const flush = () => {
    if (!pending.length) return;
    rows.push(<EventGroup key={`eg-${pending[0].id}`} events={pending} />);
    pending = [];
  };
  for (const m of buffer.messages) {
    // "Masquer les entrées/sorties" — drop join/part/quit noise (not on the console).
    if (hideJoinQuit && !isConsole && GROUP_KINDS.has(m.kind)) continue;
    const day = dayIndex(m.ts);
    if (day !== lastDay) { flush(); rows.push(<div key={`d-${m.id}`} className="daysep"><span>{dayFmt.format(m.ts)}</span></div>); lastDay = day; lastFrom = ''; }
    if (!dividerShown && buffer.readTs > 0 && hadRead && m.ts > buffer.readTs) {
      flush();
      rows.push(<div key={`unread-${m.id}`} ref={dividerRef} className="unread-divider"><span>{t('messages.newMessages')}</span></div>);
      dividerShown = true; lastFrom = '';
    }
    if (m.ts <= buffer.readTs) hadRead = true;
    // Fold a run of presence events into one grouped line.
    if (grouping && GROUP_KINDS.has(m.kind)) { pending.push(m); lastFrom = ''; continue; }
    flush(); // any other line ends the current run
    if (SYSTEM_KINDS.has(m.kind)) {
      rows.push(<SystemLine key={m.id} m={m} />);
      lastFrom = ''; continue;
    }
    const cont = m.from === lastFrom && m.ts - lastTs < 5 * 60000 && !!lastKind;
    rows.push(<MsgRow key={m.id} m={m} cont={cont} />);
    lastFrom = m.from; lastTs = m.ts; lastKind = m.kind;
  }
  flush(); // trailing run
  return (
    <div className={`messages ${isConsole ? 'messages--console' : ''}`} ref={ref} onScroll={onScroll}
      role="log" aria-label={t('a11y.messages')}>
      {histLoading && <div className="histload"><span className="histload__spin" /> {t('messages.loadingHistory')}</div>}
      {showJump && <button className="jump-unread" onClick={jumpToBottom}>{t('messages.jumpNewest')} ↓</button>}
      <div ref={flowRef}>{rows}</div>
    </div>
  );
}
