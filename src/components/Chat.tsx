import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useChat, SERVER } from '../store';
import type { ChatMessage, Member } from '../irc/types';
import { USER_MODE_NAMES } from '../irc/modes';
import { Avatar } from './Avatar';
import { Turnstile } from './Turnstile';
import { getTheme, setTheme, useTheme, type Theme } from '../ui/theme';
import { isPushSupported, pushEnabledPref, enablePush, disablePush } from '../services/push';
import { getConfig } from '../config';

const QUICK = ['👍', '😂', '❤️', '🔥'];
const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', hour12: !useChat.getState().prefs.clock24,
  });

function hashHue(seed: string): number {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
function avatarBg(seed: string): string {
  const h = hashHue(seed);
  return `linear-gradient(140deg, hsl(${h},62%,55%), hsl(${(h + 40) % 360},58%,46%))`;
}

const isImageUrl = (u: string) => /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(u);

/* Element-style image attachment: friendly caption bar + collapsible thumbnail + lightbox. */
function ImageAttachment({ url, defaultShown = false }: { url: string; defaultShown?: boolean }) {
  const [shown, setShown] = useState(defaultShown);
  const [zoom, setZoom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Keep the timeline pinned to the bottom when an image grows the content,
  // but only if the user was already near the bottom (don't yank history readers).
  // Deferred to the next frame so the new image height is laid out first
  // (onLoad fires before reflow → otherwise scrollHeight is stale).
  const snapIfStuck = () => {
    requestAnimationFrame(() => {
      const c = ref.current?.closest('.messages') as HTMLElement | null;
      if (c && c.scrollHeight - c.scrollTop - c.clientHeight < 460) c.scrollTop = c.scrollHeight;
    });
  };
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);
  return (
    <div className="imgcard" ref={ref}>
      <div className="imgcard__bar">
        <span className="imgcard__ic">🖼️</span>
        <span className="imgcard__label">Image</span>
        <a className="imgcard__act" href={url} target="_blank" rel="noopener noreferrer">Ouvrir</a>
        <button className="imgcard__act imgcard__toggle" onClick={() => { setShown((s) => !s); snapIfStuck(); }}>
          {shown ? 'Masquer' : 'Afficher'}
        </button>
      </div>
      {shown && (
        <button className="imgcard__thumb" onClick={() => setZoom(true)} title="Agrandir">
          <img className="msg-img" src={url} alt="image partagée" loading="lazy" onLoad={snapIfStuck} />
        </button>
      )}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)}>
          <img className="lightbox__img" src={url} alt="image partagée" onClick={(e) => e.stopPropagation()} />
          <a className="lightbox__open" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Ouvrir l'original ↗</a>
          <button className="lightbox__x" onClick={() => setZoom(false)} aria-label="Fermer">✕</button>
        </div>
      )}
    </div>
  );
}

// Extract a YouTube video id from the common URL shapes.
function youtubeId(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function YouTubeEmbed({ id, url }: { id: string; url: string }) {
  const [play, setPlay] = useState(false);
  return (
    <div className="ytcard">
      {play ? (
        <iframe className="ytcard__frame" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title="YouTube" allow="accelerator;autoplay;encrypted-media;picture-in-picture" allowFullScreen />
      ) : (
        <button className="ytcard__thumb" onClick={() => setPlay(true)} title="Lire la vidéo">
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="Aperçu YouTube" loading="lazy" />
          <span className="ytcard__play">▶</span>
          <span className="ytcard__badge">YouTube</span>
        </button>
      )}
      <a className="ytcard__link" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
    </div>
  );
}

function linkify(text: string, selfMsg = false): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => {
    if (!/^https?:\/\//.test(p)) return <span key={i}>{p}</span>;
    if (isImageUrl(p)) return <ImageAttachment key={i} url={p} defaultShown={selfMsg} />;
    const yt = youtubeId(p);
    if (yt) return <YouTubeEmbed key={i} id={yt} url={p} />;
    return <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>;
  });
}

// ── mIRC / IRC formatting (colors + bold/italic/underline/strike/reverse/mono) ──
const MIRC_PALETTE = [
  '#ffffff','#000000','#00007f','#009300','#ff0000','#7f0000','#9c009c','#fc7f00',
  '#ffff00','#00fc00','#009393','#00ffff','#0000fc','#ff00ff','#7f7f7f','#d2d2d2',
  '#470000','#472100','#474700','#324700','#004700','#00472c','#004747','#002747',
  '#000047','#2e0047','#470047','#47002a','#740000','#743a00','#747400','#517400',
  '#007400','#007449','#007474','#004074','#000074','#4b0074','#740074','#740045',
  '#b50000','#b56300','#b5b500','#7db500','#00b500','#00b571','#00b5b5','#0063b5',
  '#0000b5','#7500b5','#b500b5','#b5006b','#ff0000','#ff8c00','#ffff00','#b2ff00',
  '#00ff00','#00ffa0','#00ffff','#008cff','#0000ff','#a500ff','#ff00ff','#ff0098',
  '#ff5959','#ffb459','#ffff71','#cfff60','#6fff6f','#65ffc9','#6dffff','#59b4ff',
  '#5959ff','#c459ff','#ff66ff','#ff59bc','#ff9c9c','#ffd39c','#ffff9c','#e2ff9c',
  '#9cff9c','#9cffdb','#9cffff','#9cd3ff','#9c9cff','#dc9cff','#ff9cff','#ff94d3',
  '#000000','#131313','#282828','#363636','#4d4d4d','#656565','#818181','#9f9f9f',
  '#bcbcbc','#e2e2e2','#ffffff',
];
const FMT_RE = /[\x02\x03\x04\x0f\x11\x16\x1d\x1e\x1f]/;

interface FmtState { b: boolean; i: boolean; u: boolean; s: boolean; m: boolean; rev: boolean; fg?: string; bg?: string; }

function fmtToStyle(st: FmtState): CSSProperties {
  const css: CSSProperties = {};
  if (st.b) css.fontWeight = 700;
  if (st.i) css.fontStyle = 'italic';
  const deco = [st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' ');
  if (deco) css.textDecoration = deco;
  if (st.m) css.fontFamily = 'ui-monospace, "SF Mono", Menlo, monospace';
  let fg = st.fg, bg = st.bg;
  if (st.rev) { const t = fg; fg = bg ?? '#000'; bg = t ?? '#fff'; }
  if (fg) css.color = fg;
  if (bg) { css.backgroundColor = bg; css.padding = '0 .15em'; css.borderRadius = '3px'; }
  return css;
}

function formatIrc(text: string, selfMsg: boolean): ReactNode {
  if (!FMT_RE.test(text)) return linkify(text, selfMsg);
  const out: ReactNode[] = [];
  const st: FmtState = { b: false, i: false, u: false, s: false, m: false, rev: false };
  let buf = '';
  let key = 0;
  const flush = () => { if (buf) { out.push(<span key={key++} style={fmtToStyle(st)}>{linkify(buf, selfMsg)}</span>); buf = ''; } };
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    switch (c) {
      case 0x02: flush(); st.b = !st.b; continue;
      case 0x1d: flush(); st.i = !st.i; continue;
      case 0x1f: flush(); st.u = !st.u; continue;
      case 0x1e: flush(); st.s = !st.s; continue;
      case 0x11: flush(); st.m = !st.m; continue;
      case 0x16: flush(); st.rev = !st.rev; continue;
      case 0x0f: flush(); st.b = st.i = st.u = st.s = st.m = st.rev = false; st.fg = st.bg = undefined; continue;
      case 0x03: {
        flush();
        let j = i + 1, n = '';
        while (j < text.length && /\d/.test(text[j]) && n.length < 2) n += text[j++];
        if (n === '') { st.fg = st.bg = undefined; i = j - 1; continue; }
        st.fg = MIRC_PALETTE[parseInt(n, 10)];
        if (text[j] === ',' && /\d/.test(text[j + 1] || '')) {
          j++; let bn = '';
          while (j < text.length && /\d/.test(text[j]) && bn.length < 2) bn += text[j++];
          st.bg = MIRC_PALETTE[parseInt(bn, 10)];
        }
        i = j - 1; continue;
      }
      case 0x04: {
        flush();
        let j = i + 1, h = '';
        while (j < text.length && /[0-9a-fA-F]/.test(text[j]) && h.length < 6) h += text[j++];
        if (h.length < 6) { st.fg = st.bg = undefined; i = j - 1; continue; }
        st.fg = '#' + h;
        if (text[j] === ',' && /[0-9a-fA-F]/.test(text[j + 1] || '')) {
          j++; let bh = '';
          while (j < text.length && /[0-9a-fA-F]/.test(text[j]) && bh.length < 6) bh += text[j++];
          if (bh.length === 6) st.bg = '#' + bh;
        }
        i = j - 1; continue;
      }
      default: buf += text[i];
    }
  }
  flush();
  return out;
}

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

const IRCOP_COLOR = '#009393'; // IRC colour 10 — IRCop nick colour, used everywhere
function nickColor(nick: string): string {
  return `hsl(${hashHue(nick)},48%,42%)`;
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

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`;
  return `${Math.floor(sec / 86400)} j`;
}

// "+iwx" → "+iwx · invisible, wallops, hôte masqué" (named where we know them).
function formatUserModes(modes: string): string {
  const letters = modes.replace(/^\+/, '').split('').filter(Boolean);
  if (!letters.length) return '+';
  const named = letters.map((c) => USER_MODE_NAMES[c]).filter(Boolean);
  return `+${letters.join('')}${named.length ? ` · ${named.join(', ')}` : ''}`;
}

// Info fields whose values are long → span the full width of the 2-column grid.
const PM_WIDE_KEYS = new Set(['Identifiant', 'Serveur', 'Salons en commun', 'Empreinte du certificat', 'Info', 'Modes utilisateur']);

/* Wide horizontal profile card — pops over a blurred "nebula" of the app */
function ProfileModal() {
  const nick = useChat((s) => s.profileUser);
  const info = useChat((s) => s.whois[s.profileUser]);
  const me = useChat((s) => s.nick);
  const openQuery = useChat((s) => s.openQuery);
  const refreshUser = useChat((s) => s.refreshUser);
  const close = useChat((s) => s.closeProfile);
  const activeChan = useChat((s) => s.active); // channel this profile was opened from (for +draft/channel-context)
  const ignored = useChat((s) => s.ignored);
  const toggleIgnore = useChat((s) => s.toggleIgnore);
  const reportUser = useChat((s) => s.reportUser);
  const friends = useChat((s) => s.friends);
  const addFriend = useChat((s) => s.addFriend);
  const removeFriend = useChat((s) => s.removeFriend);
  const modKick = useChat((s) => s.modKick);
  const modBan = useChat((s) => s.modBan);
  const modSetMode = useChat((s) => s.modSetMode);
  const active = useChat((s) => s.active);
  const myPrefix = useChat((s) => s.buffers[s.active]?.members[s.nick]?.prefixes || s.buffers[s.active]?.members[s.nick]?.prefix || '');
  const targetMember = useChat((s) => s.buffers[s.active]?.members[s.profileUser]);
  const myUmodes = useChat((s) => s.umodes);
  const [spinning, setSpinning] = useState(false);

  const doRefresh = () => {
    setSpinning(true);
    refreshUser(nick);
    window.setTimeout(() => setSpinning(false), 700); // guaranteed-visible spin even if WHOIS is instant
  };

  useEffect(() => {
    if (!nick) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nick, close]);

  if (!nick) return null;
  const isMe = nick === me;
  const hue = hashHue(nick);
  const isIgnored = ignored.some((n) => n.toLowerCase() === nick.toLowerCase());
  const isFriend = friends.some((f) => f.toLowerCase() === nick.toLowerCase());
  const amOp = /[~&@%]/.test(myPrefix);
  const targetIsOp = /[~&@]/.test(targetMember?.prefixes || targetMember?.prefix || '');
  const canModerate = !isMe && amOp && !!targetMember && (active.startsWith('#') || active.startsWith('&'));

  const rows: Array<[string, string, ReactNode]> = [];
  if (info?.realname) rows.push(['📝', 'Nom affiché', info.realname]);
  if (info?.user || info?.host) rows.push(['🪪', 'Identifiant', `${info?.user ?? '?'}@${info?.host ?? '?'}`]);
  if (info?.server) rows.push(['🛰️', 'Serveur', info.server + (info.serverInfo ? ` · ${info.serverInfo}` : '')]);
  if (info?.channels) rows.push(['#️⃣', 'Salons en commun', info.channels]);
  if (info?.signon) rows.push(['🕓', 'Connecté depuis', new Date(info.signon * 1000).toLocaleString('fr-FR')]);
  if (info?.idle != null) rows.push(['💤', 'Inactif depuis', fmtDuration(info.idle)]);
  if (info?.secure) rows.push(['🔒', 'Connexion', 'Sécurisée (TLS)']);
  const shownModes = info?.modes || (isMe ? myUmodes : '');
  if (shownModes) rows.push(['⚙️', 'Modes utilisateur', formatUserModes(shownModes)]);
  if (info?.certfp) rows.push(['🔑', 'Empreinte du certificat', <code className="pm-fp">{info.certfp}</code>]);
  for (const line of info?.special ?? []) {
    const verif = line.match(/verified\s+(\S+)\s+account\s*\(([^)]+)\)/i);
    const groups = line.match(/security groups?:?\s*(.+)/i);
    const score = line.match(/score:?\s*([\d.]+)/i);
    if (verif) {
      rows.push(['✅', 'Compte vérifié',
        <span className="pm-verif"><span className="pm-check pm-check--inline">✓</span>{verif[2]}<span className="pm-verif__net"> · {verif[1]}</span></span>]);
    } else if (groups) {
      rows.push(['🛡️', 'Groupes',
        <span className="pm-groups">{groups[1].split(/[\s,]+/).filter(Boolean).map((g) => <span className="pm-grouptag" key={g}>{g}</span>)}</span>]);
    } else if (score) {
      rows.push(['📊', 'Score', score[1]]);
    } else {
      rows.push(['ℹ️', 'Info', line]);
    }
  }

  const status = info?.offline ? 'hors ligne' : info?.away ? 'absent' : 'en ligne';
  const statusKey = status === 'en ligne' ? 'on' : 'away';
  const chCount = info?.channels?.trim() ? info.channels.trim().split(/\s+/).length : null;

  return (
    <div className="pm-backdrop" onClick={close}>
      <div className="pm-neb pm-neb--1" /><div className="pm-neb pm-neb--2" />
      <div className="pm-card" style={{ ['--hue' as string]: String(hue) } as CSSProperties} onClick={(e) => e.stopPropagation()}>
        <button className="pm-x" onClick={close} aria-label="Fermer">✕</button>
        <div className="pm-cover"><span className="pm-cover__glow" /></div>
        <div className="pm-hero">
        <div className="pm-avwrap">
          <span className="pm-avring" />
          <Avatar nick={nick} size={92} account={info?.account} />
          <span className={`pm-presence pm-presence--${statusKey}`} />
        </div>
        <div className="pm-id">
          <div className="pm-name" style={info?.oper ? { color: IRCOP_COLOR } : undefined}>
            {nick}
            {info?.account && <span className="pm-check" title={`Enregistré : ${info.account}`}>✓</span>}
          </div>
          <div className="pm-handle">{info?.loading && !info?.user ? 'chargement du profil…' : (info?.account ? `@${info.account}` : 'visiteur')}</div>
        </div>
        </div>

        <div className="pm-meta">
          <div className="pm-badges">
            <span className={`pm-status pm-status--${status === 'en ligne' ? 'on' : 'away'}`}>● {status}</span>
            {info?.bot && <span className="pm-badge pm-badge--bot">🤖 BOT</span>}
            {info?.oper && <span className="pm-badge pm-badge--op">🛡 Opérateur</span>}
            {info?.account
              ? <span className="pm-badge pm-badge--ok">✓ Enregistré</span>
              : <span className="pm-badge">Invité</span>}
            {info?.secure && <span className="pm-badge">🔒 TLS</span>}
          </div>
          {info?.away && <div className="pm-away">💤 {info.away}</div>}
        </div>

        <div className="pm-stats">
          <div className="pm-stat">
            <span className="pm-stat__val"><i className={`pm-dot pm-dot--${statusKey}`} />{status}</span>
            <span className="pm-stat__key">Statut</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat__val">{chCount ?? '—'}</span>
            <span className="pm-stat__key">Salons communs</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat__val">{info?.secure ? '🔒' : info?.loading ? '…' : '—'}</span>
            <span className="pm-stat__key">{info?.secure ? 'Sécurisé' : 'Connexion'}</span>
          </div>
        </div>

        {!isMe && (
          <div className="pm-actions">
            <button className="pm-btn pm-btn--primary" onClick={() => { openQuery(nick, activeChan.startsWith('#') ? activeChan : undefined); close(); }}>💬 Message privé</button>
            <button className={`pm-btn pm-btn--icon ${spinning ? 'is-spinning' : ''}`} onClick={doRefresh} disabled={spinning} title="Actualiser" aria-label="Actualiser"><span className="pm-spin">↻</span></button>
          </div>
        )}

        {!isMe && (
          <div className="pm-modrow">
            <button className={`pm-chip ${isFriend ? 'is-on' : ''}`} onClick={() => isFriend ? removeFriend(nick) : addFriend(nick)}>
              {isFriend ? '⭐ Ami' : '☆ Ajouter en ami'}
            </button>
            <button className={`pm-chip ${isIgnored ? 'is-on' : ''}`} onClick={() => toggleIgnore(nick)}>
              {isIgnored ? '🔔 Ne plus ignorer' : '🔕 Ignorer'}
            </button>
            <button className="pm-chip pm-chip--warn" onClick={() => { reportUser(nick); close(); }}>🚩 Signaler</button>
          </div>
        )}

        {canModerate && (
          <div className="pm-modrow pm-modrow--ops">
            <span className="pm-modrow__lbl">🛡 Modération</span>
            <div className="pm-modbtns">
              <button className="pm-chip" onClick={() => modKick(nick)}>👢 Expulser</button>
              <button className="pm-chip pm-chip--warn" onClick={() => modBan(nick)}>🚫 Bannir</button>
              <button className="pm-chip" onClick={() => modSetMode(nick, 'o', !targetIsOp)}>{targetIsOp ? '➖ Retirer op' : '➕ Op'}</button>
              <button className="pm-chip" onClick={() => modSetMode(nick, 'v', true)}>🔊 Voix</button>
            </div>
          </div>
        )}

        <div className="pm-info">
          {rows.length > 0 && <div className="pm-section">Informations</div>}
          {info?.loading && rows.length === 0 && (
            <div className="pm-skeleton"><i /><i /><i /></div>
          )}
          {rows.map(([icon, k, v]) => (
            <div className={`pm-row ${PM_WIDE_KEYS.has(k) ? 'pm-row--wide' : ''}`} key={k}>
              <span className="pm-row__ic">{icon}</span>
              <div className="pm-row__txt">
                <div className="pm-row__k">{k}</div>
                <div className="pm-row__v">{v}</div>
              </div>
            </div>
          ))}
          {!info?.loading && rows.length === 0 && <div className="pm-empty">Aucune information publique disponible.</div>}
        </div>
      </div>
    </div>
  );
}

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

const escHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

// hex (#rrggbb, lowercase) -> mIRC palette index, for the 16 base colours.
const HEX2IDX: Record<string, number> = {};
MIRC_PALETTE.slice(0, 16).forEach((hex, i) => { if (!(hex in HEX2IDX)) HEX2IDX[hex] = i; });

function rgbToHex(c: string): string {
  c = (c || '').trim();
  if (!c) return '';
  if (c[0] === '#') return c.length === 4 ? ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase() : c.slice(0, 7).toLowerCase();
  const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return '';
  const h = (n: number) => ('0' + (+n).toString(16)).slice(-2);
  return ('#' + h(+m[1]) + h(+m[2]) + h(+m[3])).toLowerCase();
}

// A colour as an IRC code: \x03NN for a palette colour, \x04rrggbb otherwise.
function colorCode(hex: string): string {
  if (!hex) return '';
  const idx = HEX2IDX[hex];
  return idx !== undefined ? '\x03' + ('0' + idx).slice(-2) : '\x04' + hex.replace('#', '');
}

// Formatting that applies to a text node, read from its ancestor elements.
function nodeFmt(node: Node, root: HTMLElement) {
  let b = false, i = false, u = false, s = false, fg = '';
  let el = node.parentElement;
  while (el && el !== root && root.contains(el)) {
    const tag = el.tagName;
    const cs = el.style;
    const fw = cs.fontWeight;
    if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || (/^\d+$/.test(fw) && +fw >= 600)) b = true;
    if (tag === 'I' || tag === 'EM' || cs.fontStyle === 'italic') i = true;
    const td = cs.textDecorationLine || cs.textDecoration || '';
    if (tag === 'U' || td.includes('underline')) u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || td.includes('line-through')) s = true;
    if (!fg) { const hx = rgbToHex(el.getAttribute('color') || cs.color || ''); if (hx) fg = hx; }
    el = el.parentElement;
  }
  return { b, i, u, s, fg };
}

// contentEditable DOM -> IRC formatting codes.
function serialize(root: HTMLElement): string {
  let out = '';
  const cur = { b: false, i: false, u: false, s: false, fg: '' };
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent || '';
        if (!t) continue;
        const f = nodeFmt(child, root);
        if (f.fg !== cur.fg) {
          // Dropping a colour: reset everything then re-assert the surviving styles
          // (a bare \x03 before digit text would be mis-parsed as a colour number).
          if (!f.fg) { out += '\x0f'; cur.b = cur.i = cur.u = cur.s = false; cur.fg = ''; }
          else { out += colorCode(f.fg); cur.fg = f.fg; }
        }
        if (f.b !== cur.b) { out += '\x02'; cur.b = f.b; }
        if (f.i !== cur.i) { out += '\x1d'; cur.i = f.i; }
        if (f.u !== cur.u) { out += '\x1f'; cur.u = f.u; }
        if (f.s !== cur.s) { out += '\x1e'; cur.s = f.s; }
        out += t;
      } else if (child.nodeName === 'BR') {
        out += '\n';
      } else {
        if ((child.nodeName === 'DIV' || child.nodeName === 'P') && out && !out.endsWith('\n')) out += '\n';
        visit(child);
      }
    }
  };
  visit(root);
  return out;
}

// IRC formatting codes -> HTML, for putting a saved draft back into the editor.
function ircToHtml(text: string): string {
  if (!text) return '';
  const st = { b: false, i: false, u: false, s: false, fg: '' };
  let html = '', buf = '';
  const style = () => {
    const p: string[] = [];
    if (st.b) p.push('font-weight:700');
    if (st.i) p.push('font-style:italic');
    if (st.u && st.s) p.push('text-decoration:underline line-through');
    else if (st.u) p.push('text-decoration:underline');
    else if (st.s) p.push('text-decoration:line-through');
    if (st.fg) p.push('color:' + st.fg);
    return p.join(';');
  };
  const flush = () => { if (buf) { const s = style(); html += s ? `<span style="${s}">${escHtml(buf)}</span>` : escHtml(buf); buf = ''; } };
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x02) { flush(); st.b = !st.b; continue; }
    if (c === 0x1d) { flush(); st.i = !st.i; continue; }
    if (c === 0x1f) { flush(); st.u = !st.u; continue; }
    if (c === 0x1e) { flush(); st.s = !st.s; continue; }
    if (c === 0x0f) { flush(); st.b = st.i = st.u = st.s = false; st.fg = ''; continue; }
    if (c === 0x0a) { flush(); html += '<br>'; continue; }
    if (c === 0x03) {
      flush(); let j = i + 1, n = '';
      while (j < text.length && /\d/.test(text[j]) && n.length < 2) n += text[j++];
      st.fg = n === '' ? '' : (MIRC_PALETTE[parseInt(n, 10)] || '');
      if (text[j] === ',' && /\d/.test(text[j + 1] || '')) { j++; while (j < text.length && /\d/.test(text[j])) j++; }
      i = j - 1; continue;
    }
    if (c === 0x04) {
      flush(); let j = i + 1, h = '';
      while (j < text.length && /[0-9a-fA-F]/.test(text[j]) && h.length < 6) h += text[j++];
      if (h.length === 6) st.fg = '#' + h.toLowerCase();
      i = j - 1; continue;
    }
    buf += text[i];
  }
  flush();
  return html;
}

// Linear caret offset within the editor's plain text (for tab-completion).
function caretIndex(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return (root.textContent || '').length;
  const r = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}
function locate(root: HTMLElement, index: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  if (!node) return { node: root, offset: 0 };
  let n = index;
  while (node) {
    const len = (node.textContent || '').length;
    if (n <= len) return { node, offset: n };
    n -= len;
    const nx = walker.nextNode();
    if (!nx) return { node, offset: len };
    node = nx;
  }
  return { node, offset: 0 };
}
function selectRange(root: HTMLElement, start: number, end: number) {
  const a = locate(root, start), b = locate(root, end);
  const r = document.createRange();
  r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset);
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
}

// Is the caret on the first / last visual line of the editor? Lets ArrowUp/Down
// move between lines in a multi-line draft, but recall history at the edges.
function caretAtEdge(root: HTMLElement): { top: boolean; bottom: boolean } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { top: true, bottom: true };
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getClientRects()[0];
  const er = root.getBoundingClientRect();
  if (!rect || rect.height === 0) return { top: true, bottom: true }; // empty/blank line
  const lh = parseFloat(getComputedStyle(root).lineHeight) || 20;
  return { top: rect.top - er.top < lh * 0.75, bottom: er.bottom - rect.bottom < lh * 0.75 };
}

// Place the caret at the very end of the editor (after recalling history).
function caretToEnd(root: HTMLElement) {
  const sel = window.getSelection(); if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(root); r.collapse(false);
  sel.removeAllRanges(); sel.addRange(r);
}

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
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="modal__x" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function JoinDialog() {
  const setModal = useChat((s) => s.setModal);
  const client = useChat((s) => s.client);
  const setActive = useChat((s) => s.setActive);
  const openQuery = useChat((s) => s.openQuery);
  const [val, setVal] = useState('#');
  const v = val.trim();
  const isChan = v.startsWith('#') || v.startsWith('&');

  function go() {
    if (v.length < 2) return;
    if (isChan) { client?.join(v); setActive(v); }
    else openQuery(v);
    setModal('');
  }
  return (
    <Modal title="Nouvelle discussion" onClose={() => setModal('')}>
      <p className="modal__sub">Rejoins un salon (commence par <b>#</b>) ou démarre un message privé avec un pseudo.</p>
      <input className="modal__input" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="#salon ou pseudo" />
      <div className="modal__actions">
        <button className="upbtn" onClick={() => setModal('')}>Annuler</button>
        <button className="upbtn upbtn--primary" onClick={go}>
          {isChan ? 'Rejoindre le salon' : 'Démarrer le message privé'}
        </button>
      </div>
    </Modal>
  );
}

const SETTINGS_SECTIONS = [
  { id: 'profil',    icon: '👤', label: 'Profil',        desc: 'Pseudo & avatar' },
  { id: 'apparence', icon: '🎨', label: 'Apparence',     desc: 'Thème & affichage' },
  { id: 'notifs',    icon: '🔔', label: 'Notifications', desc: 'Alertes & sons' },
  { id: 'compte',    icon: '🔑', label: 'Compte',        desc: 'Connexion & sécurité' },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

function SettingsModal() {
  const setModal = useChat((s) => s.setModal);
  const account = useChat((s) => s.account);
  const [section, setSection] = useState<SettingsSection>('profil');
  const [drilled, setDrilled] = useState(false); // mobile: are we inside a section?
  const close = () => setModal('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = SETTINGS_SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className={`settings ${drilled ? 'is-drilled' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* left rail (desktop) / section list (mobile) */}
        <aside className="settings__nav">
          <div className="settings__brand">
            <span className="settings__brand-title">Réglages</span>
            <button className="settings__close" onClick={close} aria-label="Fermer">✕</button>
          </div>
          <nav className="settings__navlist">
            {SETTINGS_SECTIONS.map((s) => (
              <button key={s.id} className={`settings__navitem ${section === s.id ? 'is-on' : ''}`}
                onClick={() => { setSection(s.id); setDrilled(true); }}>
                <span className="settings__navic" aria-hidden>{s.icon}</span>
                <span className="settings__navtxt">
                  <span className="settings__navlabel">{s.label}</span>
                  <span className="settings__navdesc">{s.id === 'compte' && account ? `@${account}` : s.desc}</span>
                </span>
                <span className="settings__navchev" aria-hidden>›</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* content pane */}
        <section className="settings__pane">
          <header className="settings__top">
            <button className="settings__back" onClick={() => setDrilled(false)} aria-label="Retour">‹</button>
            <span className="settings__top-ic" aria-hidden>{cur.icon}</span>
            <h3 className="settings__top-title">{cur.label}</h3>
            <button className="settings__close settings__close--pane" onClick={close} aria-label="Fermer">✕</button>
          </header>
          <div className="settings__content" key={section}>
            {section === 'profil' && <ProfileSection />}
            {section === 'apparence' && <AppearanceSection />}
            {section === 'notifs' && <NotificationsSection />}
            {section === 'compte' && <LoginTab />}
          </div>
        </section>
      </div>
    </div>
  );
}

// One toggle row: icon · label/hint · switch.
function PushRow() {
  const client = useChat((s) => s.client);
  const supported = isPushSupported();
  const [on, setOn] = useState(pushEnabledPref());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hasVapid = !!client?.vapid;

  async function toggle() {
    if (!client || busy) return;
    setBusy(true); setErr('');
    if (on) {
      await disablePush(client);
      setOn(false);
    } else {
      const r = await enablePush(client);
      if (r.ok) setOn(true);
      else setErr(r.reason === 'denied' ? 'Autorisation refusée.' : r.reason === 'no-vapid' ? 'Indisponible sur ce serveur.' : 'Échec de l’activation.');
    }
    setBusy(false);
  }

  const hint = !supported ? 'Non pris en charge par ce navigateur.'
    : !hasVapid ? 'Indisponible sur ce serveur.'
    : err ? err
    : on ? 'Actif — alertes même app fermée (au mieux si connecté à ton compte).'
    : 'Reçois les MP et mentions même quand l’app est fermée.';

  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>📲</span>
      <div className="srow__txt">
        <div className="srow__label">Notifications push</div>
        <div className="srow__hint" style={err ? { color: 'var(--danger, #d33)' } : undefined}>{hint}</div>
      </div>
      {supported && hasVapid
        ? <button className={`switch ${on ? 'is-on' : ''} ${busy ? 'is-busy' : ''}`} role="switch" aria-checked={on}
            aria-label="Notifications push" disabled={busy} onClick={toggle}><span className="switch__dot" /></button>
        : <span className="srow__hint">—</span>}
    </div>
  );
}

function ToggleRow({ icon, label, hint, prefKey }: { icon: string; label: string; hint?: string; prefKey: 'sound' | 'hideJoinQuit' | 'compact' }) {
  const value = useChat((s) => s.prefs[prefKey]);
  const setPref = useChat((s) => s.setPref);
  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>{icon}</span>
      <div className="srow__txt">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      <button className={`switch ${value ? 'is-on' : ''}`} role="switch" aria-checked={value}
        aria-label={label} onClick={() => setPref(prefKey, !value)}><span className="switch__dot" /></button>
    </div>
  );
}

function HighlightWordsRow() {
  const words = useChat((s) => s.highlightWords);
  const setWords = useChat((s) => s.setHighlightWords);
  const [val, setVal] = useState(words.join(', '));
  const save = () => setWords(val.split(',').map((w) => w.trim()).filter(Boolean));
  return (
    <div className="sfield">
      <label className="sfield__label">🔆 Mots-clés de surbrillance</label>
      <div className="sfield__row">
        <input className="modal__input" value={val} placeholder="ex : tchatou, rdv, urgent"
          onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <div className="srow__hint" style={{ marginTop: '.3rem' }}>En plus de ton pseudo, ces mots déclenchent une alerte (séparés par des virgules).</div>
    </div>
  );
}

function ProfileSection() {
  const client = useChat((s) => s.client);
  const nick = useChat((s) => s.nick);
  const account = useChat((s) => s.account);

  return (
    <>
      <div className="scard">
        <div className="scard__body">
          <div className="srow">
            <span className="srow__ic" style={{ background: 'transparent', padding: 0 }}><Avatar nick={nick} size={42} account={account} /></span>
            <div className="srow__txt">
              <div className="srow__label">{nick}</div>
              <div className="srow__hint">{account ? <>Connecté · <strong style={{ color: 'var(--green-d)' }}>@{account}</strong></> : 'Invité — non connecté'}</div>
            </div>
          </div>
        </div>
      </div>

      <button className="set-leave" onClick={() => { client?.disconnect(); location.reload(); }}>Quitter le tchat</button>
    </>
  );
}

// Change the current IRC nick — lives in the Compte section so you can align
// your pseudo with your account name BEFORE identifying.
function ChangeNickField({ hint }: { hint: string }) {
  const client = useChat((s) => s.client);
  const nick = useChat((s) => s.nick);
  const [newNick, setNewNick] = useState(nick);
  // Keep the field in sync if the server confirms a nick change elsewhere.
  useEffect(() => { setNewNick(nick); }, [nick]);

  function applyNick() {
    const n = newNick.trim();
    if (n && n !== nick) client?.setNick(n);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">Changer de pseudo</label>
          <div className="sfield__row">
            <input className="modal__input" value={newNick} maxLength={30}
              onChange={(e) => setNewNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyNick()} />
            <button className="upbtn" onClick={applyNick} disabled={!newNick.trim() || newNick.trim() === nick}>Changer</button>
          </div>
          <div className="srow__hint" style={{ marginTop: '.3rem' }}>{hint}</div>
        </div>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const clock24 = useChat((s) => s.prefs.clock24);
  const setPref = useChat((s) => s.setPref);
  const [theme, setT] = useState<Theme>(getTheme());
  function pick(t: Theme) { setT(t); setTheme(t); }

  const THEME_OPTS: Array<{ id: Theme; icon: string; label: string }> = [
    { id: 'light', icon: '☀️', label: 'Clair' },
    { id: 'dark', icon: '🌙', label: 'Sombre' },
    { id: 'yomirc', icon: '🖥️', label: 'yomIRC' },
    { id: 'yomirc-dark', icon: '🌑', label: 'yomIRC nuit' },
  ];

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">Thème</label>
          <div className="theme-grid">
            {THEME_OPTS.map((t) => (
              <button key={t.id} className={`theme-opt ${theme === t.id ? 'is-on' : ''}`} onClick={() => pick(t.id)}>
                <span className="theme-opt__ic" aria-hidden>{t.icon}</span>
                <span className="theme-opt__label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <ToggleRow icon="🗜️" label="Mode compact" hint="Messages plus denses, plus d’infos à l’écran." prefKey="compact" />
        <div className="srow">
          <span className="srow__ic" aria-hidden>🕓</span>
          <div className="srow__txt"><div className="srow__label">Format de l’heure</div></div>
          <div className="srow__ctrl"><div className="sseg">
            <button className={clock24 ? 'is-on' : ''} onClick={() => setPref('clock24', true)}>24 h</button>
            <button className={!clock24 ? 'is-on' : ''} onClick={() => setPref('clock24', false)}>12 h</button>
          </div></div>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported');
  function askNotif() {
    if ('Notification' in window) Notification.requestPermission().then(setNotif);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="srow">
          <span className="srow__ic" aria-hidden>🔔</span>
          <div className="srow__txt">
            <div className="srow__label">Notifications navigateur</div>
            <div className="srow__hint">{notif === 'granted' ? 'Tu seras alerté hors de l’onglet.' : notif === 'denied' ? 'Bloquées dans ton navigateur.' : 'Reçois une alerte même hors de l’onglet.'}</div>
          </div>
          <div className="srow__ctrl">
            {notif === 'granted' ? <span className="sbadge-ok">✓ Activées</span>
              : notif === 'unsupported' || notif === 'denied' ? <span className="srow__hint">—</span>
              : <button className="upbtn upbtn--sm" onClick={askNotif}>Activer</button>}
          </div>
        </div>
        {getConfig().features.push && <PushRow />}
        <ToggleRow icon="🔊" label="Sons" hint="Un bip sur mention ou message privé." prefKey="sound" />
        <ToggleRow icon="🙈" label="Masquer entrées / sorties" hint="Cache les « a rejoint / a quitté »." prefKey="hideJoinQuit" />
        <HighlightWordsRow />
      </div>
    </div>
  );
}

function LoginTab() {
  const client = useChat((s) => s.client);
  const account = useChat((s) => s.account);
  const nick = useChat((s) => s.nick);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [acct, setAcct] = useState(nick);
  const [pw, setPw] = useState('');
  const [phase, setPhase] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const wasAccount = useRef(account);

  // React to the server confirming login (RPL_LOGGEDIN → account fills in) —
  // covers both manual IDENTIFY and the auto-login after a fresh VERIFY. On
  // success, auto-align the visible nick to the account we just logged into, so
  // the user doesn't have to change it by hand (a no-op if it already matches).
  useEffect(() => {
    if (account && account !== wasAccount.current) {
      setPhase('success');
      setPw('');
      // Drop focus so the mobile keyboard closes before the form swaps to the
      // connected view (otherwise the unmounted input leaves the layout shrunk).
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (client && nick && nick.toLowerCase() !== account.toLowerCase()) client.setNick(account);
    }
    wasAccount.current = account;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // While pending, give up after a few seconds (wrong password → no 900).
  useEffect(() => {
    if (phase !== 'pending') return;
    const t = setTimeout(() => setPhase((p) => (p === 'pending' ? 'error' : p)), 5000);
    return () => clearTimeout(t);
  }, [phase]);

  // One step: IDENTIFY to the named account (works from ANY nick), then the
  // success handler above renames us to it.
  function login() {
    const a = acct.trim();
    const p = pw.trim();
    if (!a || !p || !client) return;
    client.privmsg('NickServ', `IDENTIFY ${a} ${p}`);
    setPhase('pending');
  }
  function logout() {
    client?.privmsg('NickServ', 'LOGOUT');
    setPhase('idle');
  }

  // Logged in → account hero + security card + logout.
  if (account) {
    return (
      <>
        <div className={`login-card login-card--ok ${phase === 'success' ? 'is-burst' : ''}`}>
          <div className="login-card__check" aria-hidden>
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M14 27 l8 8 l16 -18" /></svg>
          </div>
          <div className="login-card__title">Connecté</div>
          <div className="login-card__sub">Tu es identifié comme <strong>{account}</strong></div>
        </div>
        <ChangeNickField hint="Change le pseudo affiché dans les salons." />
        <ChangePassword />
        <button className="set-leave" onClick={logout}>Se déconnecter du compte</button>
      </>
    );
  }

  // Not logged in → login / register switcher (register hidden if disabled in config).
  const canRegister = getConfig().features.register;
  return (
    <>
      {canRegister && (
        <div className="login-switch">
          <button className={mode === 'login' ? 'is-on' : ''} onClick={() => setMode('login')}>Se connecter</button>
          <button className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>Créer un compte</button>
        </div>
      )}

      {(mode === 'login' || !canRegister) ? (
        <div className="scard">
          <div className="scard__h">🔑 Se connecter</div>
          <div className="scard__body">
            <div className="sfield">
              <div className="sfield__intro">Identifie-toi à ton compte enregistré, quel que soit ton pseudo actuel — on te renomme automatiquement.</div>
            </div>
            <div className="sfield">
              <label className="sfield__label">Compte</label>
              <input className="modal__input" autoComplete="username" placeholder="Nom du compte" value={acct} maxLength={30}
                onChange={(e) => { setAcct(e.target.value); if (phase === 'error') setPhase('idle'); }}
                onKeyDown={(e) => e.key === 'Enter' && login()} />
            </div>
            <div className="sfield">
              <label className="sfield__label">Mot de passe</label>
              <div className="sfield__row">
                <input className="modal__input" type="password" autoComplete="current-password"
                  placeholder="Mot de passe" value={pw}
                  onChange={(e) => { setPw(e.target.value); if (phase === 'error') setPhase('idle'); }}
                  onKeyDown={(e) => e.key === 'Enter' && login()} />
                <button className={`upbtn upbtn--primary ${phase === 'pending' ? 'is-loading' : ''}`}
                  onClick={login} disabled={!acct.trim() || !pw.trim() || phase === 'pending'}>
                  {phase === 'pending' ? 'Connexion…' : 'Se connecter'}
                </button>
              </div>
              {phase === 'error' && <div className="sfield__err">Compte inconnu ou mot de passe incorrect.</div>}
            </div>
          </div>
        </div>
      ) : (
        <RegisterForm />
      )}
    </>
  );
}

// Change the account password — updates BOTH Anope (IRC) and Django (site).
function ChangePassword() {
  const change = useChat((s) => s.accountChangePassword);
  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function go() {
    if (cur.length < 1 || np.trim().length < 6 || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await change(cur, np.trim());
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setCur(''); setNp(''); }
  }

  return (
    <div className="scard">
      <div className="scard__h">🔒 Sécurité</div>
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">Mot de passe actuel</label>
          <input className="modal__input" type="password" autoComplete="current-password"
            placeholder="Mot de passe actuel" value={cur}
            onChange={(e) => { setCur(e.target.value); setMsg(null); }} />
        </div>
        <div className="sfield">
          <label className="sfield__label">Nouveau mot de passe</label>
          <div className="sfield__row">
            <input className="modal__input" type="password" autoComplete="new-password"
              placeholder="Min. 6 caractères" value={np}
              onChange={(e) => { setNp(e.target.value); setMsg(null); }}
              onKeyDown={(e) => e.key === 'Enter' && go()} />
            <button className={`upbtn upbtn--primary ${busy ? 'is-loading' : ''}`} onClick={go}
              disabled={busy || cur.length < 1 || np.trim().length < 6}>
              {busy ? 'Maj…' : 'Mettre à jour'}
            </button>
          </div>
          {msg && (msg.ok ? <div className="sfield__ok">✓ {msg.text}</div> : <div className="sfield__err">{msg.text}</div>)}
        </div>
      </div>
    </div>
  );
}

// Create a Tchatou account via IRCv3 draft/account-registration (REGISTER → e-mail
// code → VERIFY → the server auto-logs you in).
function RegisterForm() {
  const nick = useChat((s) => s.nick);
  const reg = useChat((s) => s.reg);
  const doRegister = useChat((s) => s.accountRegister);
  const doVerify = useChat((s) => s.accountVerify);
  const doResend = useChat((s) => s.accountResend);
  const reset = useChat((s) => s.resetReg);
  const challengeComplete = useChat((s) => s.accountChallengeComplete);

  const [account, setAccount] = useState(nick);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Step 2: enter the e-mail verification code (+ anti-bot challenge if required).
  if (reg.step === 'code') {
    return (
      <div className="scard">
        <div className="scard__h">📧 Vérification</div>
        <div className="scard__body">
          {reg.challengeUrl ? (
            <div className="sfield">
              <div className="challenge">
                <div className="challenge__head">
                  <span className="challenge__icon" aria-hidden>🛡️</span>
                  <div>
                    <div className="challenge__title">Vérification anti-robot</div>
                    <div className="challenge__txt">Valide ce rapide défi. Ton code te sera ensuite envoyé par e-mail.</div>
                  </div>
                </div>
                <Turnstile sitekey={getConfig().turnstile.sitekey} theme={getTheme().includes('dark') ? 'dark' : 'light'}
                  onVerify={(t) => challengeComplete(t)}
                  onError={() => useChat.setState((s) => ({ reg: { ...s.reg, error: 'Le défi anti-robot n’a pas pu se charger. Réessaie.' } }))} />
                {reg.busy && <div className="challenge__busy">Validation…</div>}
              </div>
            </div>
          ) : (
            <div className="sfield"><div className="sfield__intro">
              {reg.info ? reg.info : <>📧 Un code a été envoyé à <strong>{email || 'ton e-mail'}</strong>. Saisis-le pour activer <strong>{reg.account}</strong>.</>}
            </div></div>
          )}
          <div className="sfield">
            <label className="sfield__label">Code de vérification</label>
            <div className="sfield__row">
              <input className="modal__input" inputMode="numeric" placeholder="Ex : 123456" value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && code.trim() && doVerify(code.trim())} />
              <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`}
                onClick={() => doVerify(code.trim())} disabled={!code.trim() || reg.busy}>
                {reg.busy ? 'Vérification…' : 'Valider'}
              </button>
            </div>
            {reg.error && <div className="sfield__err">{reg.error}</div>}
            <div className="reg-foot">
              <button className="linkbtn" onClick={() => doResend()}>Renvoyer le code</button>
              <button className="linkbtn" onClick={() => reset()}>Recommencer</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: account / email / password.
  return (
    <div className="scard">
      <div className="scard__h">✨ Créer un compte</div>
      <div className="scard__body">
        <div className="sfield"><div className="sfield__intro">Choisis un pseudo, ton e-mail et un mot de passe. Tu recevras un code pour valider.</div></div>
        <div className="sfield">
          <label className="sfield__label">Pseudo</label>
          <input className="modal__input" placeholder="Pseudo" value={account} maxLength={30}
            onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">E-mail</label>
          <input className="modal__input" type="email" autoComplete="email" placeholder="toi@exemple.fr"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">Mot de passe</label>
          <input className="modal__input" type="password" autoComplete="new-password"
            placeholder="Min. 6 caractères" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {reg.error && <div className="sfield__err">{reg.error}</div>}
          <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`} style={{ marginTop: '.2rem' }}
            onClick={() => doRegister(account.trim(), email.trim(), password)}
            disabled={reg.busy || !account.trim() || !email.trim() || password.length < 6}>
            {reg.busy ? 'Création…' : 'Créer mon compte'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExploreModal() {
  const setModal = useChat((s) => s.setModal);
  const client = useChat((s) => s.client);
  const setActive = useChat((s) => s.setActive);
  const channels = useChat((s) => s.channels);
  const loading = useChat((s) => s.listLoading);
  const refresh = useChat((s) => s.refreshChannels);
  const [q, setQ] = useState('');

  useEffect(() => { refresh(); }, [refresh]);

  const needle = q.trim().toLowerCase();
  const rows = channels
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.topic.toLowerCase().includes(needle))
    .sort((a, b) => b.users - a.users);

  function join(name: string) {
    const n = name.trim();
    if (!n) return;
    const chan = n.startsWith('#') || n.startsWith('&') ? n : '#' + n;
    client?.join(chan); setActive(chan); setModal('');
  }

  return (
    <Modal title="Explorer les salons" onClose={() => setModal('')}>
      <div className="set-inline" style={{ marginBottom: '.7rem' }}>
        <input className="modal__input" placeholder="Rechercher ou créer #salon…" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) join(q); }} autoFocus />
        <button className="upbtn upbtn--primary" onClick={() => join(q)} disabled={!q.trim()}>Rejoindre</button>
      </div>
      <div className="explore-list">
        {loading && rows.length === 0 && <div className="explore-empty">Chargement des salons…</div>}
        {!loading && rows.length === 0 && <div className="explore-empty">Aucun salon{needle ? ' trouvé' : ''}. Tape un nom pour en créer un.</div>}
        {rows.map((c) => (
          <button key={c.name} className="explore-row" onClick={() => join(c.name)}>
            <span className="explore-row__av">#</span>
            <div className="explore-row__main">
              <div className="explore-row__name">{c.name}</div>
              {c.topic && <div className="explore-row__topic">{c.topic}</div>}
            </div>
            <span className="explore-row__count"><span className="dot" />{c.users}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

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

function FriendsModal() {
  const friends = useChat((s) => s.friends);
  const online = useChat((s) => s.friendsOnline);
  const add = useChat((s) => s.addFriend);
  const remove = useChat((s) => s.removeFriend);
  const openUser = useChat((s) => s.openUser);
  const openQuery = useChat((s) => s.openQuery);
  const setModal = useChat((s) => s.setModal);
  const [nick, setNick] = useState('');
  const submit = () => { const n = nick.trim(); if (n) { add(n); setNick(''); } };
  const sorted = [...friends].sort((a, b) =>
    Number(!!online[b.toLowerCase()]) - Number(!!online[a.toLowerCase()]) || a.localeCompare(b, 'fr'));
  return (
    <Modal title="Amis" onClose={() => setModal('')}>
      <p className="modal__sub">Ajoute des pseudos pour être prévenu quand ils se connectent. 🔔</p>
      <div className="modal__actions">
        <input className="modal__input" autoFocus value={nick} placeholder="Ajouter un pseudo…"
          onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="upbtn upbtn--primary" onClick={submit}>Ajouter</button>
      </div>
      {sorted.length === 0
        ? <div className="empty" style={{ padding: '1.5rem 0' }}>Aucun ami pour l'instant.</div>
        : <ul className="friends-list">
            {sorted.map((f) => {
              const on = !!online[f.toLowerCase()];
              return (
                <li key={f} className="friend">
                  <Avatar nick={f} size={32} />
                  <span className="friend__name">{f}</span>
                  <span className={`friend__dot friend__dot--${on ? 'on' : 'off'}`} />
                  <span className="friend__state">{on ? 'en ligne' : 'hors ligne'}</span>
                  <button className="friend__act" title="Message privé" onClick={() => { openQuery(f); setModal(''); }}>💬</button>
                  <button className="friend__act" title="Profil" onClick={() => { openUser(f); setModal(''); }}>👤</button>
                  <button className="friend__act friend__act--rm" title="Retirer" onClick={() => remove(f)}>✕</button>
                </li>
              );
            })}
          </ul>}
    </Modal>
  );
}

const CHAN_FLAGS: { m: string; label: string; desc: string }[] = [
  { m: 'i', label: 'Sur invitation', desc: 'Il faut être invité pour entrer (+i)' },
  { m: 'm', label: 'Modéré', desc: 'Seuls les voix et ops peuvent parler (+m)' },
  { m: 'n', label: 'Pas de messages externes', desc: 'Seuls les membres peuvent écrire (+n)' },
  { m: 't', label: 'Sujet protégé', desc: 'Seuls les ops changent le sujet (+t)' },
  { m: 's', label: 'Secret', desc: 'Caché des listes publiques (+s)' },
];

function ChanAdminModal() {
  const setModal = useChat((s) => s.setModal);
  const buffer = useChat((s) => s.buffers[s.active]);
  const banlist = useChat((s) => s.banlists[s.active] || []);
  const loadBanList = useChat((s) => s.loadBanList);
  const setChannelMode = useChat((s) => s.setChannelMode);
  const removeBan = useChat((s) => s.removeBan);
  const modTopic = useChat((s) => s.modTopic);
  const client = useChat((s) => s.client);
  const chan = buffer?.name || '';
  const [newban, setNewban] = useState('');
  const [topic, setTopicVal] = useState(buffer?.topic || '');
  useEffect(() => { if (chan) loadBanList(chan); }, [chan, loadBanList]);
  if (!buffer || !buffer.isChannel) return null;
  const modes = buffer.modes || '';
  const addBan = () => {
    const v = newban.trim(); if (!v) return;
    client?.ban(chan, v.includes('@') || v.includes('!') ? v : `${v}!*@*`);
    setNewban(''); setTimeout(() => loadBanList(chan), 500);
  };
  return (
    <Modal title={`Gérer ${chan}`} wide onClose={() => setModal('')}>
      <div className="ca-sec">
        <h4 className="ca-h">Sujet</h4>
        <div className="modal__actions">
          <input className="modal__input" value={topic} placeholder="Sujet du salon…" onChange={(e) => setTopicVal(e.target.value)} />
          <button className="upbtn upbtn--primary" onClick={() => modTopic(topic)}>Définir</button>
        </div>
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">Réglages</h4>
        {CHAN_FLAGS.map((f) => {
          const on = modes.includes(f.m);
          return (
            <label key={f.m} className="ca-flag">
              <input type="checkbox" checked={on} onChange={() => setChannelMode(chan, f.m, !on)} />
              <span className="ca-flag__txt"><b>{f.label}</b><span className="ca-flag__desc">{f.desc}</span></span>
            </label>
          );
        })}
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">Bannissements ({banlist.length})</h4>
        <div className="modal__actions">
          <input className="modal__input" value={newban} placeholder="*!*@masque ou pseudo…"
            onChange={(e) => setNewban(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBan()} />
          <button className="upbtn upbtn--primary" onClick={addBan}>Bannir</button>
        </div>
        <ul className="ca-bans">
          {banlist.length === 0 && <li className="ca-bans__empty">Aucun bannissement.</li>}
          {banlist.map((b) => (
            <li key={b.mask} className="ca-ban">
              <span className="ca-ban__mask">{b.mask}</span>
              {b.by && <span className="ca-ban__by">par {b.by}</span>}
              <button className="friend__act friend__act--rm" title="Lever le bannissement"
                onClick={() => { removeBan(chan, b.mask); setTimeout(() => loadBanList(chan), 500); }}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function Modals() {
  const modal = useChat((s) => s.modal);
  if (modal === 'join') return <JoinDialog />;
  if (modal === 'settings') return <SettingsModal />;
  if (modal === 'explore') return <ExploreModal />;
  if (modal === 'friends') return <FriendsModal />;
  if (modal === 'chanadmin') return <ChanAdminModal />;
  return null;
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
