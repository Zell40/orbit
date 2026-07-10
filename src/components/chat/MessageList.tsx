import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVER } from '../../core/store';
import { useActiveChat } from '../../core/networks';
import { MsgRow } from './MsgRow';
import { SystemLine } from './SystemLine';
import { SearchResults } from './SearchResults';

// Message kinds rendered as a status line (SystemLine); everything else
// (privmsg/action, plus any unknown kind) is a grouped message row (MsgRow).
const SYSTEM_KINDS = new Set(['notice', 'info', 'warning', 'mode', 'ban', 'topic', 'join', 'part', 'quit', 'nick', 'system']);

export function MessageList() {
  const { t, i18n } = useTranslation();
  const active = useActiveChat((s) => s.active);
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  const search = useActiveChat((s) => s.search);
  const hideJoinQuit = useActiveChat((s) => s.prefs.hideJoinQuit);
  const loadMore = useActiveChat((s) => s.loadMoreHistory);
  const histLoading = useActiveChat((s) => !!s.historyLoading[s.active]);
  const histDone = useActiveChat((s) => !!s.historyDone[s.active]);
  const markReadHere = useActiveChat((s) => s.markReadHere);
  useActiveChat((s) => s.prefs.clock24); // re-render timestamps when the clock format changes
  const ref = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const prevHeight = useRef(0);
  const prevActive = useRef(active);
  const atBottom = useRef(true); // were we pinned to the bottom before the last scroll/resize?
  const [showJump, setShowJump] = useState(false);
  const count = buffer?.messages.length ?? 0;

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
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (atBottom.current) markReadHere();
    prevHeight.current = el.scrollHeight;
  }, [count, active, search, markReadHere]);

  // The on-screen keyboard opening/closing resizes the VISUAL viewport, which
  // shrinks the message list WITHOUT moving its scrollTop — so a freshly-sent
  // message would otherwise land below the fold, hidden behind the keyboard.
  // If we were pinned to the bottom, re-pin once the new layout has settled.
  useEffect(() => {
    const repin = () => {
      if (!atBottom.current) return;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    };
    // Any time the list box shrinks — the composer growing (multi-line, reply
    // bar, format toolbar) or the mobile keyboard opening — the newest messages
    // would slide behind the composer. Re-pin on the resize so they stay visible
    // above it. ResizeObserver catches the composer growth (incl. desktop); the
    // events catch the mobile keyboard, which resizes the viewport not the list.
    const ro = new ResizeObserver(repin);
    if (ref.current)
      ro.observe(ref.current);
    window.addEventListener('tchatou:vh', repin);
    window.visualViewport?.addEventListener('resize', repin);
    return () => {
      ro.disconnect();
      window.removeEventListener('tchatou:vh', repin);
      window.visualViewport?.removeEventListener('resize', repin);
    };
  }, []);

  // Scroll near the top of a channel → load older messages (chathistory).
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    atBottom.current = bottom;
    // Reached the bottom → you've read everything: advance the marker so the
    // "New messages" divider and the jump button clear instead of freezing.
    if (bottom) markReadHere();
    // channels and private messages both have server-side history (not the console)
    if (el.scrollTop < 60 && buffer && buffer.name !== SERVER && !histLoading && !histDone) loadMore(active);
    // show the "jump to new" button while the unread divider is scrolled out of view above
    const d = dividerRef.current;
    setShowJump(!bottom && !!d && d.offsetTop < el.scrollTop - 20);
  };
  const jumpToUnread = () => dividerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (!buffer) return <div className="empty">{t('sidebar.noChannel')}</div>;
  if (search.trim()) return <SearchResults messages={buffer.messages} query={search.trim()} />;

  const isConsole = buffer.name === SERVER;
  const rows: ReactNode[] = [];
  let lastFrom = '', lastTs = 0, lastKind = '';
  let lastDay = '';
  let hadRead = false, dividerShown = false;
  for (const m of buffer.messages) {
    // "Masquer les entrées/sorties" — drop join/part/quit noise (not on the console).
    if (hideJoinQuit && !isConsole && (m.kind === 'join' || m.kind === 'part' || m.kind === 'quit')) continue;
    const day = new Date(m.ts).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
    if (day !== lastDay) { rows.push(<div key={`d-${m.id}`} className="daysep"><span>{day}</span></div>); lastDay = day; lastFrom = ''; }
    if (!dividerShown && buffer.readTs > 0 && hadRead && m.ts > buffer.readTs) {
      rows.push(<div key={`unread-${m.id}`} ref={dividerRef} className="unread-divider"><span>{t('messages.newMessages')}</span></div>);
      dividerShown = true; lastFrom = '';
    }
    if (m.ts <= buffer.readTs) hadRead = true;
    if (SYSTEM_KINDS.has(m.kind)) {
      rows.push(<SystemLine key={m.id} m={m} />);
      lastFrom = ''; continue;
    }
    const cont = m.from === lastFrom && m.ts - lastTs < 5 * 60000 && !!lastKind;
    rows.push(<MsgRow key={m.id} m={m} cont={cont} />);
    lastFrom = m.from; lastTs = m.ts; lastKind = m.kind;
  }
  return (
    <div className={`messages ${isConsole ? 'messages--console' : ''}`} ref={ref} onScroll={onScroll}
      role="log" aria-label={t('a11y.messages')}>
      {histLoading && <div className="histload"><span className="histload__spin" /> {t('messages.loadingHistory')}</div>}
      {showJump && <button className="jump-unread" onClick={jumpToUnread}>↑ {t('messages.newMessages')}</button>}
      {rows}
    </div>
  );
}
