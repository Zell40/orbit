import { useEffect, useState } from 'react';
import { useChat, SERVER } from '../store';
import type { Member } from '../irc/types';
import { avatarBg } from '../lib/format';
import { ProfileModal } from './profile/ProfileModal';
import { Modals } from './modals/Modals';
import { MessageList } from './chat/MessageList';
import { Composer } from './chat/Composer';
import { Avatar } from './Avatar';
import { useTheme } from '../ui/theme';
import { getConfig } from '../config';


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
