import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat, SERVER } from '../../store';
import { avatarBg } from '../../lib/format';
import { useTheme } from '../../ui/theme';
import { Avatar } from '../Avatar';
import { usePluginRegistry } from '../../plugins/registry';
import { PluginBoundary } from '../PluginBoundary';
// App footer bar: account chip (avatar · nick · presence) · nav (Accueil /
// Salons / Amis) · away toggle + settings — everything that used to live in the
// left rail and the sidebar footer, in one place like a real app.
export function TabBar() {
  const { t } = useTranslation();
  const nick = useChat((s) => s.nick);
  const myAccount = useChat((s) => s.account);
  const away = useChat((s) => s.away);
  const setAway = useChat((s) => s.setAway);
  const setModal = useChat((s) => s.setModal);
  const openUser = useChat((s) => s.openUser);
  return (
    <footer className="appbar">
      <button className={`appbar__me ${away ? 'is-away' : ''}`} onClick={() => openUser(nick)} title={t('sidebar.viewProfile')}>
        <span className="appbar__av"><Avatar nick={nick} size={30} account={myAccount} /></span>
        <span className="appbar__meta">
          <span className="appbar__name">{nick}</span>
          <span className="appbar__status">{away ? t('sidebar.away') : t('sidebar.online')}</span>
        </span>
      </button>
      <nav className="appbar__nav" aria-label={t('a11y.conversations')}>
        <button className="tab is-active" aria-label={t('nav.home')}>
          <span className="tab__ic" aria-hidden="true">🏠</span>
          <span className="tab__lb">{t('nav.home')}</span>
        </button>
        <button className="tab" onClick={() => setModal('explore')} aria-label={t('nav.explore')}>
          <span className="tab__ic" aria-hidden="true">🧭</span>
          <span className="tab__lb">{t('nav.tabRooms', { defaultValue: 'Salons' })}</span>
        </button>
        <TabFriends onOpen={() => setModal('friends')} />
      </nav>
      <div className="appbar__actions">
        <button className={`appbar__act appbar__act--away ${away ? 'is-on' : ''}`} onClick={() => setAway(away ? '' : t('sidebar.away'))}
          title={away ? t('sidebar.markPresent') : t('sidebar.markAway')} aria-label={t('sidebar.presence')} aria-pressed={!!away}>💤</button>
        <button className="appbar__act" onClick={() => setModal('settings')}
          title={t('nav.settings')} aria-label={t('nav.settings')}>⚙️</button>
      </div>
    </footer>
  );
}

type Filter = 'all' | 'rooms' | 'people';

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const order = useChat((s) => s.order);
  const active = useChat((s) => s.active);
  const buffers = useChat((s) => s.buffers);
  const setActive = useChat((s) => s.setActive);
  const setModal = useChat((s) => s.setModal);
  const closeBuffer = useChat((s) => s.closeBuffer);
  const sidebarItems = usePluginRegistry((s) => s.ui);
  const serverName = useChat((s) => s.serverName);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const mirc = useTheme().startsWith('yomirc');

  const match = (n: string) => n.toLowerCase().includes(q.trim().toLowerCase());
  const channels = order.filter((n) => buffers[n]?.isChannel && match(n));
  const queries = order.filter((n) => n !== SERVER && !buffers[n]?.isChannel && match(n));
  // mIRC always shows the Status window; otherwise it appears under "Tous" and matches search.
  const hasServer = order.includes(SERVER) && (mirc || (filter === 'all' && match('status')));
  const showChannels = filter !== 'people';
  const showQueries = filter !== 'rooms';

  const item = (name: string) => {
    const b = buffers[name];
    const isServer = name === SERVER;
    const label = isServer ? 'Status' : b.name.replace(/^#/, '');
    const glyph = isServer ? (mirc ? '●' : '✦') : label[0]?.toUpperCase() ?? '?';
    return (
      <button key={name} className={`room ${name === active ? 'is-active' : ''} ${isServer ? 'room--status' : ''}`} onClick={() => { setActive(name); onNavigate(); }}>
        <span className="room__av" data-server={isServer || undefined}
          style={isServer ? undefined : { background: avatarBg(name) }}>
          {b.isChannel ? <span className="room__hash">#</span> : glyph}
        </span>
        <span className="room__body">
          <span className="room__name">{label}</span>
          <span className="room__sub">{b.isChannel ? t('sidebar.publicRoom') : isServer ? (serverName || t('sidebar.system')) : t('sidebar.privateMessage')}</span>
        </span>
        {b.unread > 0 && <span className="room__badge">{b.unread}</span>}
        {!isServer && (
          <span
            className="room__close"
            role="button"
            tabIndex={-1}
            title={b.isChannel ? t('sidebar.leaveRoom') : t('sidebar.closeConversation')}
            onClick={(e) => { e.stopPropagation(); closeBuffer(name); }}
          >✕</span>
        )}
      </button>
    );
  };

  const totalShown = (showChannels ? channels.length : 0) + (showQueries ? queries.length : 0) + (hasServer ? 1 : 0);

  return (
    <aside className="sidebar" aria-label={t('a11y.conversations')}>
      <div className="side-top">
        <h2 className="side-title">{t('nav.home')}</h2>
        {sidebarItems.filter((u) => u.slot === 'sidebar_item').map((u) => <PluginBoundary key={u.id} render={u.render} label="sidebar_item" />)}
        <button className="side-compose" title={t('sidebar.newChat')} aria-label={t('sidebar.newChat')} onClick={() => setModal('join')}>✎</button>
      </div>

      <div className="side-search">
        <span className="side-search__icon">🔍</span>
        <input name="room-filter" type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sidebar.search')} aria-label={t('sidebar.search')} />
      </div>

      <div className="pills">
        <button className={`pill ${filter === 'all' ? 'is-on' : ''}`} onClick={() => setFilter('all')}>{t('sidebar.all')}</button>
        <button className={`pill ${filter === 'rooms' ? 'is-on' : ''}`} onClick={() => setFilter('rooms')}>{t('sidebar.channels')}</button>
        <button className={`pill ${filter === 'people' ? 'is-on' : ''}`} onClick={() => setFilter('people')}>{t('sidebar.dms')}</button>
      </div>

      <div className="rooms">
        {/* mIRC pins the Status window at the very top of the switchbar */}
        {mirc && hasServer && item(SERVER)}
        {showChannels && channels.map(item)}
        {showQueries && queries.length > 0 && <div className="rooms-h">{t('sidebar.privateMessages')}</div>}
        {showQueries && queries.map(item)}
        {!mirc && hasServer && item(SERVER)}
        {totalShown === 0 && <div className="rooms-empty">{t('sidebar.noResults')}</div>}
      </div>

      {/* On mobile the app bar docks at the bottom of this drawer instead of over
          the conversation; CSS shows this copy only on mobile (the full-width bar
          at the window bottom is used on desktop). */}
      <TabBar />
    </aside>
  );
}
function TabFriends({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const friends = useChat((s) => s.friends);
  const online = useChat((s) => s.friendsOnline);
  const onlineCount = friends.filter((f) => online[f.toLowerCase()]).length;
  return (
    <button className="tab" onClick={onOpen} aria-label={t('nav.friends')}>
      <span className="tab__ic" aria-hidden="true">👥{onlineCount > 0 && <span className="tab__badge">{onlineCount}</span>}</span>
      <span className="tab__lb">{t('nav.friends')}</span>
    </button>
  );
}


// Thin banner shown while the connection is down / reconnecting (the session is
// preserved and auto-reconnect is in progress).
