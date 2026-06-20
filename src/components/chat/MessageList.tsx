import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat, SERVER } from '../../store';
import type { ChatMessage } from '../../irc/types';
import { fmtTime, nickColor, IRCOP_COLOR, formatIrc } from '../../lib/format';
import { useTheme } from '../../ui/theme';
import { Avatar } from '../Avatar';

const QUICK = ['👍', '😂', '❤️', '🔥'];
function MsgRow({ m, cont }: { m: ChatMessage; cont: boolean }) {
  const { t } = useTranslation();
  const react = useChat((s) => s.toggleReaction);
  const redact = useChat((s) => s.redact);
  const openUser = useChat((s) => s.openUser);
  const setActive = useChat((s) => s.setActive);
  const setReply = useChat((s) => s.setReplyTarget);
  const isOper = useChat((s) => !!s.buffers[s.active]?.members[m.from]?.oper);
  // Avatars resolve by ACCOUNT. Live messages carry the account tag, but
  // chathistory-replayed ones (e.g. on a fresh mobile join) often don't — so
  // fall back to the author's account from the channel member list.
  const memberAccount = useChat((s) => s.buffers[s.active]?.members[m.from]?.account);
  const avatarAccount = m.account || memberAccount;
  const mirc = useTheme().startsWith('yomirc');
  const msgs = useChat((s) => s.buffers[s.active]?.messages);
  const quoted = m.replyTo ? msgs?.find((x) => x.id === m.replyTo) : undefined;
  // +draft/channel-context: badge it only when the context first appears or CHANGES.
  // Compare against the last message that ACTUALLY carried a context (skip untagged
  // ones) — otherwise the other person's untagged replies re-trigger the chip on our
  // next message.
  let showCtx = false;
  if (m.channelContext && msgs) {
    const idx = msgs.indexOf(m);
    let prevCtx: string | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].channelContext) { prevCtx = msgs[i].channelContext; break; }
    }
    showCtx = prevCtx !== m.channelContext;
  }

  // yomIRC: classic single log line — [HH:MM] <nick> text (nick on every line, no grouping/avatars).
  if (mirc) {
    const nickStyle = { color: isOper ? IRCOP_COLOR : nickColor(m.from) };
    return (
      <div className={`mircline ${m.kind === 'action' ? 'mircline--action' : ''} ${m.redacted ? 'is-redacted' : ''}`}>
        <span className="mircline__time">[{fmtTime(m.ts)}]</span>{' '}
        <button className="mircline__nick" style={nickStyle} onClick={() => openUser(m.from)}>
          {m.kind === 'action' ? `* ${m.from}` : `<${m.from}>`}
        </button>{' '}
        <span className="mircline__txt">
          {m.redacted ? `⊘ ${t('messages.deleted')}` : formatIrc(m.text, m.self)}
        </span>
        {m.reactions && m.reactions.length > 0 && (
          <span className="reactions reactions--inline">
            {m.reactions.map((r) => (
              <button key={r.emoji} className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => react(m.id, r.emoji)}>
                {r.emoji} <b>{r.count}</b>
              </button>
            ))}
          </span>
        )}
        {!m.redacted && (
          <span className="msg-actions">
            {QUICK.map((e) => <button key={e} title={t('messages.react')} onClick={() => react(m.id, e)}>{e}</button>)}
            <button title={t('messages.respond')} onClick={() => setReply(m.id)}>↩</button>
            {m.self && <button title={t('messages.delete')} onClick={() => redact(m.id)}>🗑</button>}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`group ${cont ? 'group--cont' : ''}`}>
      {cont
        ? <span className="group__avatar group__time-rail">{fmtTime(m.ts)}</span>
        : <button className="group__avbtn" title={t('messages.profileOf', { nick: m.from })} onClick={() => openUser(m.from)}><Avatar nick={m.from} account={avatarAccount} /></button>}
      <div className="group__body">
        {!cont && (
          <div className="group__head">
            <button className="group__nick" style={{ color: isOper ? IRCOP_COLOR : nickColor(m.from) }} onClick={() => openUser(m.from)}>{m.from}</button>
            <span className="group__time">{fmtTime(m.ts)}</span>
          </div>
        )}
        {quoted && (
          <div className="reply-quote" title={t('messages.reply')}>
            <span className="reply-quote__arrow">↪</span>
            <span className="reply-quote__from" style={{ color: nickColor(quoted.from) }}>{quoted.from}</span>
            <span className="reply-quote__txt">{quoted.redacted ? t('messages.deleted') : quoted.text.slice(0, 90)}</span>
          </div>
        )}
        <div className={`line ${m.kind === 'action' ? 'line--action' : ''} ${m.kind === 'notice' ? 'line--notice' : ''} ${m.redacted ? 'line--redacted' : ''}`}>
          {m.redacted ? `⊘ ${t('messages.deleted')}` : (m.kind === 'action' ? <em>{formatIrc(m.text, m.self)}</em> : formatIrc(m.text, m.self))}
        </div>
        {showCtx && (
          <button
            className="ctx-chip"
            title={t('messages.dmStarted', { chan: m.channelContext })}
            onClick={() => setActive(m.channelContext!)}
          >
            <span className="ctx-chip__ic">↪</span>{t('messages.fromChannel')}&nbsp;<b>{m.channelContext}</b>
          </button>
        )}
        {m.reactions && m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => react(m.id, r.emoji)}>
                {r.emoji} <b>{r.count}</b>
              </button>
            ))}
          </div>
        )}
      </div>
      {!m.redacted && (
        <div className="msg-actions">
          {QUICK.map((e) => <button key={e} title={t('messages.react')} onClick={() => react(m.id, e)}>{e}</button>)}
          <button title={t('messages.respond')} onClick={() => setReply(m.id)}>↩</button>
          {m.self && <button title={t('messages.delete')} onClick={() => redact(m.id)}>🗑</button>}
        </div>
      )}
    </div>
  );
}


function SearchResults({ messages, query }: { messages: ChatMessage[]; query: string }) {
  const { t } = useTranslation();
  const openUser = useChat((s) => s.openUser);
  const q = query.trim().toLowerCase();
  const hits = messages.filter((m) => (m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice')
    && !m.redacted && m.text.toLowerCase().includes(q));
  return (
    <div className="messages messages--search">
      <div className="search-count">{t('messages.searchResults', { count: hits.length, q: query })}</div>
      {hits.slice().reverse().map((m) => {
        const i = m.text.toLowerCase().indexOf(q);
        return (
          <div key={m.id} className="search-hit">
            <button className="search-hit__from" style={{ color: nickColor(m.from) }} onClick={() => openUser(m.from)}>{m.from}</button>
            <span className="search-hit__time">{fmtTime(m.ts)}</span>
            <div className="search-hit__txt">
              {m.text.slice(Math.max(0, i - 30), i)}<mark>{m.text.slice(i, i + query.length)}</mark>{m.text.slice(i + query.length, i + query.length + 60)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MessageList() {
  const { t, i18n } = useTranslation();
  const active = useChat((s) => s.active);
  const buffer = useChat((s) => s.buffers[s.active]);
  const search = useChat((s) => s.search);
  const hideJoinQuit = useChat((s) => s.prefs.hideJoinQuit);
  const mirc = useTheme().startsWith('yomirc');
  const loadMore = useChat((s) => s.loadMoreHistory);
  const histLoading = useChat((s) => !!s.historyLoading[s.active]);
  const histDone = useChat((s) => !!s.historyDone[s.active]);
  useChat((s) => s.prefs.clock24); // re-render timestamps when the clock format changes
  const ref = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const prevHeight = useRef(0);
  const prevActive = useRef(active);
  const atBottom = useRef(true); // were we pinned to the bottom before the last scroll/resize?
  const [showJump, setShowJump] = useState(false);
  const count = buffer?.messages.length ?? 0;

  // Keep the viewport anchored: stick to the bottom for live messages, but when
  // older history is PREPENDED (we're at the top) preserve the reading position.
  useEffect(() => {
    const el = ref.current;
    if (!el || search) return;
    const switched = prevActive.current !== active;
    prevActive.current = active;
    const grew = el.scrollHeight - prevHeight.current;
    if (switched) {
      el.scrollTop = el.scrollHeight;
    } else if (el.scrollTop < 80 && grew > 0) {
      el.scrollTop = el.scrollHeight - prevHeight.current; // prepend → keep position
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevHeight.current = el.scrollHeight;
  }, [count, active, search]);

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
    // 'tchatou:vh' fires the instant the layout height changes (incl. the
    // pre-resize on focus); visualViewport 'resize' is the late authoritative one.
    window.addEventListener('tchatou:vh', repin);
    window.visualViewport?.addEventListener('resize', repin);
    return () => {
      window.removeEventListener('tchatou:vh', repin);
      window.visualViewport?.removeEventListener('resize', repin);
    };
  }, []);

  // Scroll near the top of a channel → load older messages (chathistory).
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    // channels and private messages both have server-side history (not the console)
    if (el.scrollTop < 60 && buffer && buffer.name !== SERVER && !histLoading && !histDone) loadMore(active);
    // show the "jump to new" button while the unread divider is scrolled out of view above
    const d = dividerRef.current;
    setShowJump(!!d && d.offsetTop < el.scrollTop - 20);
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
      rows.push(<div key={`unread-${m.id}`} ref={dividerRef} className="unread-divider"><span>Nouveaux messages</span></div>);
      dividerShown = true; lastFrom = '';
    }
    if (m.ts <= buffer.readTs) hadRead = true;
    // yomIRC: render every server event as a classic mIRC status line — [HH:MM] * …
    if (mirc && m.kind !== 'privmsg' && m.kind !== 'action' && m.kind !== 'notice') {
      let body: ReactNode;
      if (m.kind === 'mode') {
        const [modes, ...margs] = m.text.split(' ');
        body = <>{m.from} applique {modes}{margs.length ? ' ' + margs.join(' ') : ''}</>;
      } else if (m.kind === 'topic') {
        body = m.text ? <>{m.from} change le sujet : {formatIrc(m.text, false)}</> : <>{m.from} retire le sujet</>;
      } else if (m.kind === 'info' || m.kind === 'ban') {
        body = m.text.replace(/^[*•»]+\s*/, '');
      } else { // join / part / quit / nick / kick / system
        const rest = m.text.replace(m.from, '').trim();
        body = m.from
          ? <>{m.from}{m.mask ? <span className="mircline__host"> ({m.mask})</span> : null} {rest}</>
          : m.text.replace(/^[*•»]+\s*/, '');
      }
      rows.push(
        <div key={m.id} className={`mircline mircline--sys mircline--sys-${m.kind}`}>
          <span className="mircline__time">[{fmtTime(m.ts)}]</span>{' '}
          <span className="mircline__star">*</span>{' '}
          <span className="mircline__sys">{body}</span>
        </div>,
      );
      lastFrom = ''; continue;
    }
    if (m.kind === 'info') {
      rows.push(
        <div key={m.id} className="infoline">
          <span className="infoline__tag">Info</span>
          <span className="infoline__txt">{m.text.replace(/^[*•]+\s*/, '')}</span>
        </div>,
      );
      lastFrom = ''; continue;
    }
    if (m.kind === 'warning') {
      rows.push(
        <div key={m.id} className="warnline">
          <span className="warnline__ic" aria-hidden>🛡️</span>
          <div className="warnline__body">
            <span className="warnline__tag">{t('security.tag')}</span>
            <span className="warnline__txt">{m.text}</span>
          </div>
        </div>,
      );
      lastFrom = ''; continue;
    }
    if (m.kind === 'mode') {
      const [modes, ...margs] = m.text.split(' ');
      const segs = modes.split(/(?=[+-])/).filter(Boolean);
      rows.push(
        <div key={m.id} className="sysline sysline--mode">
          <span className="modeline__tag">{t('modeline.modeTag')}</span>
          <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>
          <span className="modeline__verb">{t('modeline.modeVerb')}</span>
          <span className="modeline__chg">[{segs.map((p, i) => (
            <span key={i} className={p[0] === '+' ? 'mode-add' : 'mode-rm'}>{p}</span>
          ))}{margs.length ? ' ' + margs.join(' ') : ''}]</span>
        </div>,
      );
      lastFrom = ''; continue;
    }
    if (m.kind === 'ban') {
      rows.push(<div key={m.id} className="banline">{m.text}</div>);
      lastFrom = ''; continue;
    }
    if (m.kind === 'topic') {
      rows.push(
        <div key={m.id} className="sysline sysline--mode">
          <span className="modeline__tag modeline__tag--topic">{t('modeline.topicTag')}</span>
          <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>
          <span className="modeline__verb">{m.text ? t('modeline.topicChanged') : t('modeline.topicRemoved')}</span>
          {m.text && <span className="topicline__txt">{formatIrc(m.text, false)}</span>}
        </div>,
      );
      lastFrom = ''; continue;
    }
    if (['join', 'part', 'quit', 'nick', 'system'].includes(m.kind)) {
      const isCmd = m.text.startsWith('»');
      rows.push(<div key={m.id} className={`sysline ${isCmd ? 'sysline--cmd' : ''}`}><span className="who">{m.from}</span> {m.text.replace(m.from, '').trim()}</div>);
      lastFrom = ''; continue;
    }
    if (m.kind === 'notice') {
      rows.push(
        <div key={m.id} className="sysline sysline--mode noticeline">
          <span className="modeline__tag noticeline__tag">NOTICE</span>
          {m.from && <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>}
          <span className="noticeline__txt">{formatIrc(m.text, m.self)}</span>
        </div>,
      );
      lastFrom = ''; continue;
    }
    const cont = m.from === lastFrom && m.ts - lastTs < 5 * 60000 && !!lastKind;
    rows.push(<MsgRow key={m.id} m={m} cont={cont} />);
    lastFrom = m.from; lastTs = m.ts; lastKind = m.kind;
  }
  return (
    <div className={`messages ${isConsole ? 'messages--console' : ''}`} ref={ref} onScroll={onScroll}>
      {histLoading && <div className="histload"><span className="histload__spin" /> Chargement de l'historique…</div>}
      {showJump && <button className="jump-unread" onClick={jumpToUnread}>↑ Nouveaux messages</button>}
      {rows}
    </div>
  );
}

