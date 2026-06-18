import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useChat, SERVER } from '../store';
import type { ChatMessage, Member } from '../irc/types';
import { fmtTime, avatarBg, nickColor, IRCOP_COLOR, formatIrc, MIRC_PALETTE } from '../lib/format';
import { serialize, ircToHtml, caretIndex, selectRange, caretAtEdge, caretToEnd } from '../lib/editor';
import { ProfileModal } from './profile/ProfileModal';
import { Modals } from './modals/Modals';
import { Avatar } from './Avatar';
import { useTheme } from '../ui/theme';
import { getConfig } from '../config';

const QUICK = ['👍', '😂', '❤️', '🔥'];

/* Element-style far-left spaces rail */
function Rail() {
  const nick = useChat((s) => s.nick);
  const myAccount = useChat((s) => s.account);
  const setModal = useChat((s) => s.setModal);
  const openUser = useChat((s) => s.openUser);
  const icon = useChat((s) => s.networkIcon);
  return (
    <nav className="rail">
      <div className="rail__brand" title="Tchatou"><img src={icon} alt="Tchatou" /></div>
      <div className="rail__sep" />
      <button className="rail__item is-active" title="Accueil" aria-label="Accueil">🏠</button>
      <button className="rail__item" title="Explorer les salons" aria-label="Explorer les salons" onClick={() => setModal('explore')}>🧭</button>
      <RailFriends onOpen={() => setModal('friends')} />
      <div className="rail__spacer" />
      <button className="rail__me" title={`${nick} — voir mon profil`} aria-label="Mon profil" onClick={() => openUser(nick)}><Avatar nick={nick} size={34} account={myAccount} /></button>
    </nav>
  );
}

type Filter = 'all' | 'rooms' | 'people';

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const order = useChat((s) => s.order);
  const active = useChat((s) => s.active);
  const buffers = useChat((s) => s.buffers);
  const nick = useChat((s) => s.nick);
  const myAccount = useChat((s) => s.account);
  const setActive = useChat((s) => s.setActive);
  const setModal = useChat((s) => s.setModal);
  const openUser = useChat((s) => s.openUser);
  const closeBuffer = useChat((s) => s.closeBuffer);
  const away = useChat((s) => s.away);
  const setAway = useChat((s) => s.setAway);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const mirc = useTheme().startsWith('yomirc');

  const match = (n: string) => n.toLowerCase().includes(q.trim().toLowerCase());
  const channels = order.filter((n) => buffers[n]?.isChannel && match(n));
  const queries = order.filter((n) => n !== SERVER && !buffers[n]?.isChannel && match(n));
  // mIRC always shows the Status window; otherwise it appears under "Tous" and matches search.
  const hasServer = order.includes(SERVER) && (mirc || (filter === 'all' && match('console')));
  const showChannels = filter !== 'people';
  const showQueries = filter !== 'rooms';

  const item = (name: string) => {
    const b = buffers[name];
    const isServer = name === SERVER;
    const label = isServer ? (mirc ? 'Status' : 'Console') : b.name.replace(/^#/, '');
    const glyph = isServer ? (mirc ? '●' : '✦') : label[0]?.toUpperCase() ?? '?';
    return (
      <button key={name} className={`room ${name === active ? 'is-active' : ''} ${isServer ? 'room--status' : ''}`} onClick={() => { setActive(name); onNavigate(); }}>
        <span className="room__av" data-server={isServer || undefined}
          style={isServer ? undefined : { background: avatarBg(name) }}>
          {b.isChannel ? <span className="room__hash">#</span> : glyph}
        </span>
        <span className="room__body">
          <span className="room__name">{label}</span>
          <span className="room__sub">{b.isChannel ? 'Salon public' : isServer ? 'Système' : 'Message privé'}</span>
        </span>
        {b.unread > 0 && <span className="room__badge">{b.unread}</span>}
        {!isServer && (
          <span
            className="room__close"
            role="button"
            tabIndex={-1}
            title={b.isChannel ? 'Quitter le salon' : 'Fermer la conversation'}
            onClick={(e) => { e.stopPropagation(); closeBuffer(name); }}
          >✕</span>
        )}
      </button>
    );
  };

  const totalShown = (showChannels ? channels.length : 0) + (showQueries ? queries.length : 0) + (hasServer ? 1 : 0);

  return (
    <aside className="sidebar">
      <div className="side-top">
        <h2 className="side-title">Accueil</h2>
        <button className="side-compose" title="Nouvelle discussion" aria-label="Nouvelle discussion" onClick={() => setModal('join')}>✎</button>
      </div>

      <div className="side-search">
        <span className="side-search__icon">🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher" />
      </div>

      <div className="pills">
        <button className={`pill ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>Tous</button>
        <button className={`pill ${filter === 'rooms' ? 'is-on' : ''}`} onClick={() => setFilter('rooms')}>Salons</button>
        <button className={`pill ${filter === 'people' ? 'is-on' : ''}`} onClick={() => setFilter('people')}>Privés</button>
      </div>

      <div className="rooms">
        {/* mIRC pins the Status window at the very top of the switchbar */}
        {mirc && hasServer && item(SERVER)}
        {showChannels && channels.map(item)}
        {showQueries && queries.length > 0 && <div className="rooms-h">Messages privés</div>}
        {showQueries && queries.map(item)}
        {!mirc && hasServer && item(SERVER)}
        {totalShown === 0 && <div className="rooms-empty">Aucun résultat</div>}
      </div>

      <div className="side-foot">
        <button className="side-foot__id" title="Voir mon profil" onClick={() => openUser(nick)}>
          <Avatar nick={nick} size={34} account={myAccount} />
          <div className="side-foot__meta">
            <div className="side-foot__name">{nick}</div>
            <div className="side-foot__status"><i className={`presence ${away ? 'presence--away' : ''}`} />{away ? 'Absent' : 'En ligne'}</div>
          </div>
        </button>
        <button className="side-foot__cog" title={away ? 'Marquer présent' : 'Marquer absent'} aria-label="Absence"
          onClick={() => setAway(away ? '' : 'Absent')}>{away ? '🌙' : '☀️'}</button>
        <button className="side-foot__cog" title="Réglages" aria-label="Réglages" onClick={() => setModal('settings')}>⚙️</button>
      </div>
    </aside>
  );
}

function MsgRow({ m, cont }: { m: ChatMessage; cont: boolean }) {
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
          {m.redacted ? '⊘ message supprimé' : formatIrc(m.text, m.self)}
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
            {QUICK.map((e) => <button key={e} title="Réagir" onClick={() => react(m.id, e)}>{e}</button>)}
            <button title="Répondre" onClick={() => setReply(m.id)}>↩</button>
            {m.self && <button title="Supprimer" onClick={() => redact(m.id)}>🗑</button>}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`group ${cont ? 'group--cont' : ''}`}>
      {cont
        ? <span className="group__avatar group__time-rail">{fmtTime(m.ts)}</span>
        : <button className="group__avbtn" title={`Profil de ${m.from}`} onClick={() => openUser(m.from)}><Avatar nick={m.from} account={avatarAccount} /></button>}
      <div className="group__body">
        {!cont && (
          <div className="group__head">
            <button className="group__nick" style={{ color: isOper ? IRCOP_COLOR : nickColor(m.from) }} onClick={() => openUser(m.from)}>{m.from}</button>
            <span className="group__time">{fmtTime(m.ts)}</span>
          </div>
        )}
        {quoted && (
          <div className="reply-quote" title="En réponse à">
            <span className="reply-quote__arrow">↪</span>
            <span className="reply-quote__from" style={{ color: nickColor(quoted.from) }}>{quoted.from}</span>
            <span className="reply-quote__txt">{quoted.redacted ? 'message supprimé' : quoted.text.slice(0, 90)}</span>
          </div>
        )}
        <div className={`line ${m.kind === 'action' ? 'line--action' : ''} ${m.kind === 'notice' ? 'line--notice' : ''} ${m.redacted ? 'line--redacted' : ''}`}>
          {m.redacted ? '⊘ message supprimé' : (m.kind === 'action' ? <em>{formatIrc(m.text, m.self)}</em> : formatIrc(m.text, m.self))}
        </div>
        {showCtx && (
          <button
            className="ctx-chip"
            title={`Cette discussion privée a démarré dans le salon ${m.channelContext} — cliquez pour y aller`}
            onClick={() => setActive(m.channelContext!)}
          >
            <span className="ctx-chip__ic">↪</span>Depuis le salon&nbsp;<b>{m.channelContext}</b>
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
          {QUICK.map((e) => <button key={e} title="Réagir" onClick={() => react(m.id, e)}>{e}</button>)}
          <button title="Répondre" onClick={() => setReply(m.id)}>↩</button>
          {m.self && <button title="Supprimer" onClick={() => redact(m.id)}>🗑</button>}
        </div>
      )}
    </div>
  );
}


function SearchResults({ messages, query }: { messages: ChatMessage[]; query: string }) {
  const openUser = useChat((s) => s.openUser);
  const q = query.trim().toLowerCase();
  const hits = messages.filter((m) => (m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice')
    && !m.redacted && m.text.toLowerCase().includes(q));
  return (
    <div className="messages messages--search">
      <div className="search-count">{hits.length} résultat{hits.length !== 1 ? 's' : ''} pour « {query} »</div>
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

function MessageList() {
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

  if (!buffer) return <div className="empty">Choisis un salon pour commencer à discuter.</div>;
  if (search.trim()) return <SearchResults messages={buffer.messages} query={search.trim()} />;

  const isConsole = buffer.name === SERVER;
  const rows: ReactNode[] = [];
  let lastFrom = '', lastTs = 0, lastKind = '';
  let lastDay = '';
  let hadRead = false, dividerShown = false;
  for (const m of buffer.messages) {
    // "Masquer les entrées/sorties" — drop join/part/quit noise (not on the console).
    if (hideJoinQuit && !isConsole && (m.kind === 'join' || m.kind === 'part' || m.kind === 'quit')) continue;
    const day = new Date(m.ts).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
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
            <span className="warnline__tag">Sécurité</span>
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
          <span className="modeline__tag">mode</span>
          <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>
          <span className="modeline__verb">applique</span>
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
          <span className="modeline__tag modeline__tag--topic">sujet</span>
          <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>
          <span className="modeline__verb">{m.text ? 'a changé le sujet' : 'a retiré le sujet'}</span>
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

function Topbar({ onMenu, onMembers }: { onMenu: () => void; onMembers: () => void }) {
  const buffer = useChat((s) => s.buffers[s.active]);
  const search = useChat((s) => s.search);
  const setSearch = useChat((s) => s.setSearch);
  const setModal = useChat((s) => s.setModal);
  const myPrefix = useChat((s) => { const b = s.buffers[s.active]; const m = b?.members[s.nick]; return m?.prefixes || m?.prefix || ''; });
  const amOp = /[~&@!%]/.test(myPrefix);
  const muted = useChat((s) => s.mutedChannels.includes(s.active));
  const toggleMute = useChat((s) => s.toggleMute);
  const activeName = useChat((s) => s.active);
  const mirc = useTheme().startsWith('yomirc');
  const [searching, setSearching] = useState(false);
  if (!buffer) return <div className="topbar"><button className="nav-toggle" onClick={onMenu} aria-label="Salons">☰</button></div>;
  const n = Object.keys(buffer.members).length;
  const isServer = buffer.name === SERVER;
  const label = isServer ? (mirc ? 'Status' : 'Console') : buffer.name.replace(/^#/, '');
  if (searching || search) {
    return (
      <div className="topbar topbar--search">
        <button className="nav-toggle" onClick={onMenu} aria-label="Salons">☰</button>
        <span className="topbar__searchicon">🔍</span>
        <input className="topbar__searchinput" autoFocus placeholder={`Rechercher dans ${label}…`}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearching(false); } }} />
        <button className="topbar__searchclose" onClick={() => { setSearch(''); setSearching(false); }} aria-label="Fermer la recherche">✕</button>
      </div>
    );
  }
  return (
    <div className={`topbar ${isServer ? 'topbar--console' : ''}`}>
      <button className="nav-toggle" onClick={onMenu} aria-label="Salons">☰</button>
      {isServer
        ? <span className="term-lights"><i /><i /><i /></span>
        : <span className="topbar__av" style={{ background: avatarBg(buffer.name) }}>{buffer.isChannel ? '#' : label[0]?.toUpperCase()}</span>}
      <div className="topbar__meta">
        <span className="topbar__title">
          {isServer ? (mirc ? `Status — ${getConfig().branding.name}` : `${getConfig().branding.name} — console`) : label}
          {!isServer && buffer.isChannel && buffer.modes && buffer.modes !== '+' && (
            <span className="topbar__modes" title="Modes du salon">{buffer.modes}</span>
          )}
        </span>
        {isServer
          ? <span className="topbar__topic topbar__topic--muted">Terminal serveur · tape une commande IRC (/list, /whois, /join…)</span>
          : buffer.topic
            ? <span className="topbar__topic">{buffer.topic}</span>
            : buffer.isChannel && <span className="topbar__topic topbar__topic--muted">Salon public · {n} membres</span>}
      </div>
      {!isServer && <button className="topbar__search" title="Rechercher" aria-label="Rechercher" onClick={() => setSearching(true)}>🔍</button>}
      {buffer.isChannel && <button className="topbar__search" title={muted ? 'Réactiver les notifications' : 'Couper les notifications'} aria-label="Notifications" onClick={() => toggleMute(activeName)}>{muted ? '🔕' : '🔔'}</button>}
      {buffer.isChannel && amOp && <button className="topbar__search" title="Gérer le salon" aria-label="Gérer le salon" onClick={() => setModal('chanadmin')}>🛠️</button>}
      {buffer.isChannel && <button className="topbar__pill" onClick={onMembers} title="Membres" aria-label="Voir les membres"><span className="dot" />{n}</button>}
    </div>
  );
}

const ROLES: Record<string, { label: string; cls: string }> = {
  '~': { label: 'Fondateurs', cls: 'owner' },
  '&': { label: 'Administrateurs', cls: 'admin' },
  '!': { label: 'Propriétaires', cls: 'owner' },
  '@': { label: 'Opérateurs', cls: 'op' },
  '%': { label: 'Modérateurs', cls: 'halfop' },
  '+': { label: 'Voix', cls: 'voice' },
  '': { label: 'Membres', cls: 'member' },
};

function MemberList({ onNavigate }: { onNavigate?: () => void }) {
  const buffer = useChat((s) => s.buffers[s.active]);
  const openUser = useChat((s) => s.openUser);
  const prefixOrder = useChat((s) => s.client?.prefixModes ?? '~&@%+');
  const [q, setQ] = useState('');
  if (!buffer || !buffer.isChannel) return <aside className="members" />;

  const rank = (p: string) => (!p ? 99 : prefixOrder.indexOf(p) === -1 ? 98 : prefixOrder.indexOf(p));
  const all = Object.values(buffer.members);
  const needle = q.trim().toLowerCase();
  const members = needle ? all.filter((m) => m.nick.toLowerCase().includes(needle)) : all;

  // Group by prefix (role), order groups by rank, sort names within each.
  const byPrefix = new Map<string, Member[]>();
  for (const m of members) {
    const p = m.prefix || '';
    (byPrefix.get(p) ?? byPrefix.set(p, []).get(p)!).push(m);
  }
  const groups = [...byPrefix.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([p, list]) => ({
      p,
      role: ROLES[p] ?? { label: 'Privilégiés', cls: 'op' },
      list: list.sort((a, b) => a.nick.localeCompare(b.nick, 'fr', { sensitivity: 'base' })),
    }));

  return (
    <aside className="members">
      <div className="members__h">Membres · {all.length}</div>
      {all.length > 12 && (
        <div className="members__search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les membres" aria-label="Filtrer les membres" />
        </div>
      )}
      <div className="members__list">
        {groups.map((g) => (
          <div className="mgroup" key={g.p || 'none'}>
            <div className={`mgroup__h role-${g.role.cls}`}>{g.role.label}<span className="mgroup__n">{g.list.length}</span></div>
            {g.list.map((m) => (
              <button
                type="button"
                className={`member ${m.oper ? 'member--oper' : ''} ${m.away ? 'is-away' : ''}`}
                key={m.nick}
                title={m.away ? `${m.nick} — absent` : m.oper ? `${m.nick} — Opérateur réseau (IRCop)` : `Voir le profil de ${m.nick}`}
                onClick={() => { openUser(m.nick); onNavigate?.(); }}
              >
                <Avatar nick={m.nick} size={30} account={m.account} />
                <span className="member__name">
                  {m.prefix && <span className={`member__prefix role-${g.role.cls}`}>{m.prefix}</span>}
                  {m.nick}
                </span>
                {m.bot && <span className="member__bot">BOT</span>}
              </button>
            ))}
          </div>
        ))}
        {members.length === 0 && <div className="rooms-empty">Aucun membre</div>}
      </div>
    </aside>
  );
}

// Info fields whose values are long → span the full width of the 2-column grid.
function TypingIndicator() {
  const buffer = useChat((s) => s.buffers[s.active]);
  if (!buffer) return null;
  const now = Date.now();
  const who = Object.entries(buffer.typing).filter(([, exp]) => exp > now).map(([n]) => n);
  if (!who.length) return <div className="typing" />;
  const label = who.length === 1
    ? `${who[0]} est en train d'écrire`
    : who.length === 2
      ? `${who[0]} et ${who[1]} écrivent`
      : `${who.length} personnes écrivent`;
  return (
    <div className="typing">
      <span className="typing__dots"><i /><i /><i /></span>{label}…
    </div>
  );
}

const EMOJIS = ['😀','😂','🤣','😊','😍','😘','😎','🤩','🥳','😏','😢','😭','😡','🤔','😴','🙄','👍','👎','👏','🙌','🙏','💪','👋','✌️','🤝','❤️','🔥','✨','🎉','🌹','☕','🍺','🍷','🎶','💯','😅','😜','🤗','😇','👀'];

// :name: → emoji, for tab-completion in the composer.
const EMOJI_NAMES: Record<string, string> = {
  sourire: '😀', rire: '😂', mdr: '🤣', joie: '😊', amour: '😍', bisou: '😘',
  cool: '😎', etoiles: '🤩', fete: '🥳', malin: '😏', triste: '😢', pleure: '😭',
  colere: '😡', reflechir: '🤔', dodo: '😴', clindoeil: '😜', calin: '🤗', ange: '😇',
  yeux: '👀', pouce: '👍', nul: '👎', bravo: '👏', mains: '🙌', merci: '🙏',
  muscle: '💪', salut: '👋', victoire: '✌️', accord: '🤝', coeur: '❤️', feu: '🔥',
  brille: '✨', tada: '🎉', rose: '🌹', cafe: '☕', biere: '🍺', vin: '🍷',
  musique: '🎶', cent: '💯', heart: '❤️', fire: '🔥', smile: '😀', laugh: '😂',
  ok: '👌', wave: '👋', party: '🥳', think: '🤔', wink: '😉', sun: '☀️', star: '⭐',
};
// Slash commands offered by tab-completion (with a leading '/').
const SLASH_COMMANDS = ['me', 'msg', 'join', 'part', 'nick', 'whois', 'topic', 'kick', 'ban', 'op', 'deop', 'voice', 'ignore', 'unignore', 'list', 'clear', 'help'];

// ── Rich composer plumbing ───────────────────────────────────────────────────
// The composer is a contentEditable so the user sees real bold/italic/colour as
// they type (never the control codes). We only convert to/from IRC formatting
// codes at the edges: serialize() on send, ircToHtml() when restoring a draft.

function Composer() {
  const active = useChat((s) => s.active);
  const send = useChat((s) => s.sendInput);
  const notifyTyping = useChat((s) => s.notifyTyping);
  const uploadImage = useChat((s) => s.uploadImage);
  const setDraft = useChat((s) => s.setDraft);

  const [picker, setPicker] = useState(false);
  const [colors, setColors] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [fmt, setFmt] = useState({ b: false, i: false, u: false });
  const fgRef = useRef('');                 // active text colour, kept sticky across sends
  const ed = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cyc = useRef<{ start: number; len: number; cands: string[]; idx: number } | null>(null);
  const prevActive = useRef(active);
  // mIRC-style sent-message history (global to the session). idx -1 = live draft.
  const history = useRef<string[]>([]);
  const histIdx = useRef(-1);
  const histStash = useRef('');
  const isConsole = active === SERVER;

  // Light up the toolbar to match the formatting at the caret (like Slack/iMessage).
  function syncFmt() {
    if (!ed.current || document.activeElement !== ed.current) return;
    try {
      setFmt({
        b: document.queryCommandState('bold'),
        i: document.queryCommandState('italic'),
        u: document.queryCommandState('underline'),
      });
    } catch { /* queryCommandState unsupported — leave as-is */ }
  }

  // Reflect editor contents into the empty flag (placeholder + send button) and ping typing.
  function changed() {
    const root = ed.current; if (!root) return;
    const has = !!(root.textContent && root.textContent.trim());
    setEmpty(!has);
    if (has && !isConsole) notifyTyping();
    histIdx.current = -1; // typing exits history-recall mode
    syncFmt();
  }

  // Keep the toolbar in sync as the caret/selection moves around the editor.
  useEffect(() => {
    const onSel = () => { if (ed.current && document.activeElement === ed.current) syncFmt(); };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the saved draft for a salon into the editor (rich), once on mount.
  useEffect(() => {
    const root = ed.current; if (!root) return;
    root.innerHTML = ircToHtml(useChat.getState().drafts[active] ?? '');
    setEmpty(!(root.textContent || '').trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching salons: stash the unsent text under the old one, restore the new one's.
  useEffect(() => {
    if (prevActive.current === active) return;
    const root = ed.current; if (!root) return;
    setDraft(prevActive.current, serialize(root));
    root.innerHTML = ircToHtml(useChat.getState().drafts[active] ?? '');
    setEmpty(!(root.textContent || '').trim());
    cyc.current = null;
    prevActive.current = active;
  }, [active, setDraft]);

  // Re-assert the active formatting onto the (empty) editor so it stays "held down"
  // for the next message — wiping innerHTML clears the browser's pending-style state.
  function reapplySticky() {
    const root = ed.current; if (!root) return;
    root.focus();
    if (fmt.b && !document.queryCommandState('bold')) document.execCommand('bold');
    if (fmt.i && !document.queryCommandState('italic')) document.execCommand('italic');
    if (fmt.u && !document.queryCommandState('underline')) document.execCommand('underline');
    if (fgRef.current) { document.execCommand('styleWithCSS', false, 'true'); document.execCommand('foreColor', false, fgRef.current); }
  }

  function submit() {
    const root = ed.current; if (!root) return;
    const out = serialize(root);
    if (!out.trim()) return;
    send(out);
    // Record in the recall history (skip consecutive duplicates), cap at 100.
    if (history.current[history.current.length - 1] !== out) history.current.push(out);
    if (history.current.length > 100) history.current.shift();
    histIdx.current = -1;
    histStash.current = '';
    root.innerHTML = '';
    setEmpty(true);
    setDraft(active, '');
    cyc.current = null;
    reapplySticky();   // keep bold/italic/colour active for the next line
  }

  // Replace the editor contents with an IRC-formatted string + caret to end.
  function setEditorText(irc: string) {
    const root = ed.current; if (!root) return;
    root.innerHTML = ircToHtml(irc);
    setEmpty(!(root.textContent || '').trim());
    caretToEnd(root);
  }

  // ↑ recall older sent messages; ↓ walk back toward the live draft.
  function historyPrev() {
    const root = ed.current; if (!root || !history.current.length) return;
    if (histIdx.current === -1) histStash.current = serialize(root); // stash the in-progress draft
    if (histIdx.current < history.current.length - 1) histIdx.current++;
    setEditorText(history.current[history.current.length - 1 - histIdx.current]);
  }
  function historyNext() {
    const root = ed.current; if (!root || histIdx.current === -1) return;
    histIdx.current--;
    setEditorText(histIdx.current === -1 ? histStash.current : history.current[history.current.length - 1 - histIdx.current]);
  }

  function insert(emoji: string) {
    ed.current?.focus();
    document.execCommand('insertText', false, emoji);
    setPicker(false);
    changed();
  }

  // Apply a style command to the current selection / typing position.
  function exec(cmd: string) {
    ed.current?.focus();
    document.execCommand(cmd);
    syncFmt();
    changed();
  }
  function applyColor(index: number) {
    ed.current?.focus();
    fgRef.current = MIRC_PALETTE[index];
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, fgRef.current);
    setColors(false);
    changed();
  }
  function clearFmt() {
    ed.current?.focus();
    fgRef.current = '';
    setFmt({ b: false, i: false, u: false });
    document.execCommand('removeFormat');
    setColors(false);
    changed();
  }

  // Tab-completion over the editor's plain text: nicks, /commands, :emoji:.
  function tabComplete() {
    const root = ed.current; if (!root) return;
    const text = root.textContent || '';
    const pos = caretIndex(root);

    const c = cyc.current;
    if (c && pos === c.start + c.len) {
      c.idx = (c.idx + 1) % c.cands.length;
      const pick = c.cands[c.idx];
      selectRange(root, c.start, c.start + c.len);
      document.execCommand('insertText', false, pick);
      c.len = pick.length;
      return;
    }

    const before = text.slice(0, pos);
    const token = (before.match(/(\S*)$/)?.[1]) ?? '';
    if (!token) return;
    const start = pos - token.length;
    let cands: string[] = [];

    if (token.startsWith(':') && token.length > 1) {
      const q = token.slice(1).toLowerCase();
      cands = Object.keys(EMOJI_NAMES).filter((n) => n.startsWith(q)).map((n) => EMOJI_NAMES[n]);
    } else if (token.startsWith('/') && start === 0) {
      const q = token.slice(1).toLowerCase();
      cands = SLASH_COMMANDS.filter((c2) => c2.startsWith(q)).map((c2) => '/' + c2 + ' ');
    } else {
      const members = Object.keys(useChat.getState().buffers[active]?.members ?? {});
      const q = token.toLowerCase();
      const tail = start === 0 ? ': ' : ' ';
      cands = members.filter((n) => n.toLowerCase().startsWith(q)).sort((a, b) => a.localeCompare(b))
        .map((n) => n + tail);
    }
    if (!cands.length) return;
    selectRange(root, start, pos);
    document.execCommand('insertText', false, cands[0]);
    cyc.current = { start, len: cands[0].length, cands, idx: 0 };
  }

  const canUpload = getConfig().features.imageUpload;
  function uploadFrom(files: FileList | null | undefined): boolean {
    if (!files || isConsole || !canUpload) return false;
    const img = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (img) { uploadImage(img); return true; }
    return false;
  }

  const placeholder = isConsole
    ? 'Commande IRC — ex : /list, /whois pseudo, /join #salon'
    : `Envoyer un message dans ${active || '…'}`;

  return (
    <div className={`composer ${isConsole ? 'composer--console' : ''}`}>
      <TypingIndicator />
      <ReplyBar />
      {picker && (
        <>
          <div className="emoji-backdrop" onClick={() => setPicker(false)} />
          <div className="emoji-pop">
            {EMOJIS.map((e) => <button key={e} onClick={() => insert(e)}>{e}</button>)}
          </div>
        </>
      )}
      {colors && (
        <>
          <div className="emoji-backdrop" onClick={() => setColors(false)} />
          <div className="color-pop" onMouseDown={(e) => e.preventDefault()}>
            {MIRC_PALETTE.slice(0, 16).map((hex, i) => (
              <button key={i} title={`Couleur ${i}`} style={{ background: hex }}
                onClick={() => applyColor(i)} />
            ))}
            <button className="color-pop__reset" title="Effacer le format"
              onClick={clearFmt}>⌫</button>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }} />
      <div className={`composer__box ${isConsole ? 'composer__box--console' : ''} ${dragOver ? 'is-drop' : ''}`}
        onDragOver={(e) => { if (!isConsole) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); if (uploadFrom(e.dataTransfer.files)) e.preventDefault(); }}>
        {canUpload && !isConsole && (
          <button className="composer__add" title="Envoyer une image" aria-label="Envoyer une image" onClick={() => fileRef.current?.click()}>
            <svg className="composer__icon" viewBox="0 0 24 24" width="20" height="20" fill="none"
              stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="8.5" cy="8.5" r="1.6" />
              <path d="M21 15.5 16 10.5 5.5 21" />
            </svg>
          </button>
        )}
        <div
          ref={ed}
          className={`composer__rich ${isConsole ? 'composer__rich--console' : ''} ${empty ? 'is-empty' : ''}`}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          spellCheck={!isConsole}
          data-ph={dragOver ? 'Dépose ton image ici…' : placeholder}
          onInput={changed}
          onPaste={(e) => {
            if (uploadFrom(e.clipboardData?.files)) { e.preventDefault(); return; }
            const t = e.clipboardData?.getData('text/plain');
            if (t != null) { e.preventDefault(); document.execCommand('insertText', false, t); changed(); }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !isConsole) { e.preventDefault(); tabComplete(); return; }
            if (e.key !== 'Tab') cyc.current = null;
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
            if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); changed(); return; }
            // mIRC-style recall: ↑ at the first line goes back through sent
            // messages, ↓ at the last line walks forward to the live draft.
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              const root = ed.current; if (!root) return;
              const edge = caretAtEdge(root);
              if (e.key === 'ArrowUp' && edge.top) { e.preventDefault(); historyPrev(); }
              else if (e.key === 'ArrowDown' && edge.bottom) { e.preventDefault(); historyNext(); }
            }
          }}
        />
        {!isConsole && (
          <div className="composer__fmt">
            <button className={`composer__fmtbtn ${fmt.b ? 'is-on' : ''}`} title="Gras" aria-label="Gras" aria-pressed={fmt.b}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><b>G</b></button>
            <button className={`composer__fmtbtn ${fmt.i ? 'is-on' : ''}`} title="Italique" aria-label="Italique" aria-pressed={fmt.i}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><i>I</i></button>
            <button className={`composer__fmtbtn ${fmt.u ? 'is-on' : ''}`} title="Souligné" aria-label="Souligné" aria-pressed={fmt.u}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><u>S</u></button>
            <button className={`composer__fmtbtn composer__fmtbtn--color ${colors ? 'is-on' : ''}`} title="Couleur" aria-label="Couleur"
              onMouseDown={(e) => e.preventDefault()} onClick={() => setColors((c) => !c)}>🎨</button>
          </div>
        )}
        {!isConsole && <button className={`composer__emoji ${picker ? 'is-on' : ''}`} title="Emoji" aria-label="Emoji" onClick={() => setPicker((p) => !p)}>😊</button>}
        <button className="composer__send" disabled={empty} onClick={submit} aria-label="Envoyer">{isConsole ? '⏎' : '➤'}</button>
      </div>
    </div>
  );
}

function ReplyBar() {
  const reply = useChat((s) => s.replyTarget);
  const clear = useChat((s) => s.clearReply);
  if (!reply) return null;
  return (
    <div className="replybar">
      <span className="replybar__icon">↩</span>
      <span className="replybar__txt">
        Réponse à <b style={{ color: nickColor(reply.from) }}>{reply.from}</b> — {reply.text}
      </span>
      <button className="replybar__x" onClick={clear} aria-label="Annuler la réponse">✕</button>
    </div>
  );
}

/* ---- Modal shell + dialogs ---- */
function RailFriends({ onOpen }: { onOpen: () => void }) {
  const friends = useChat((s) => s.friends);
  const online = useChat((s) => s.friendsOnline);
  const onlineCount = friends.filter((f) => online[f.toLowerCase()]).length;
  return (
    <button className="rail__item" title="Amis" aria-label="Amis" onClick={onOpen}>
      👥{onlineCount > 0 && <span className="rail__badge">{onlineCount}</span>}
    </button>
  );
}


// Thin banner shown while the connection is down / reconnecting (the session is
// preserved and auto-reconnect is in progress).
function ReconnectBanner() {
  const status = useChat((s) => s.status);
  const reconnectIn = useChat((s) => s.reconnectIn);
  if (status === 'registered') return null;
  const label = status === 'connecting' ? 'Reconnexion…'
    : reconnectIn > 0 ? `Connexion perdue — nouvelle tentative dans ${reconnectIn}s`
    : 'Connexion perdue — reconnexion…';
  return <div className="reconnect-banner"><span className="reconnect-banner__dot" /> {label}</div>;
}

// Shown when the server kicks or bans us from a salon — the salon is already
// closed and gone from the list at this point; this is the heads-up. Rejoining
// is only offered for a kick (a ban would just refuse the join again).
function KickToast() {
  const kicked = useChat((s) => s.kicked);
  const dismiss = useChat((s) => s.dismissKick);
  const rejoin = useChat((s) => s.rejoinKicked);
  useEffect(() => {
    if (!kicked) return;
    const t = setTimeout(dismiss, 12000); // auto-dismiss after a while
    return () => clearTimeout(t);
  }, [kicked, dismiss]);
  if (!kicked) return null;
  const { kind, channel, by, reason } = kicked;
  const title =
    kind === 'kick' ? `Tu as été expulsé de ${channel}`
    : kind === 'ban' ? `Tu es banni de ${channel}`
    : `Tu ne peux pas écrire dans ${channel}`;
  const sub =
    kind === 'kick' ? `par ${by}${reason ? ` — « ${reason} »` : ''}`
    : kind === 'ban' ? 'Accès au salon refusé.'
    : 'Tu es banni ou le salon est modéré.';
  const icon = kind === 'kick' ? '👢' : '⛔';
  return (
    <div className="kicktoast" role="alert">
      <span className="kicktoast__ic">{icon}</span>
      <div className="kicktoast__body">
        <strong>{title}</strong>
        <span className="kicktoast__sub">{sub}</span>
      </div>
      {kind === 'kick' && <button className="kicktoast__rejoin" onClick={rejoin}>Rejoindre</button>}
      <button className="kicktoast__close" onClick={dismiss} aria-label="Fermer">×</button>
    </div>
  );
}

export function Chat() {
  const [navOpen, setNavOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  return (
    <div className={`app ${navOpen ? 'nav-open' : ''} ${membersOpen ? 'members-open' : ''}`}>
      <Rail />
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <main className="main">
        <Topbar onMenu={() => setNavOpen(true)} onMembers={() => setMembersOpen(true)} />
        <MessageList />
        <Composer />
      </main>
      <MemberList onNavigate={() => setMembersOpen(false)} />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      {membersOpen && <div className="nav-backdrop" onClick={() => setMembersOpen(false)} />}
      <Modals />
      <ProfileModal />
      <KickToast />
      <ReconnectBanner />
    </div>
  );
}
