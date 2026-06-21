import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat, SERVER } from '../../store';
import { avatarBg } from '../../lib/format';
import { useTheme } from '../../ui/theme';
import { Avatar } from '../Avatar';
import { usePluginRegistry } from '../../plugins/registry';
import { PluginBoundary } from '../PluginBoundary';
export function Rail() {
  const { t } = useTranslation();
  const nick = useChat((s) => s.nick);
  const myAccount = useChat((s) => s.account);
  const setModal = useChat((s) => s.setModal);
  const openUser = useChat((s) => s.openUser);
  const icon = useChat((s) => s.networkIcon);
  return (
    <nav className="rail">
      <div className="rail__brand" title="Tchatou"><img src={icon} alt="Tchatou" /></div>
      <div className="rail__sep" />
      <button className="rail__item is-active" title={t('nav.home')} aria-label={t('nav.home')}>🏠</button>
      <button className="rail__item" title={t('nav.explore')} aria-label={t('nav.explore')} onClick={() => setModal('explore')}>🧭</button>
      <RailFriends onOpen={() => setModal('friends')} />
      <div className="rail__spacer" />
      <button className="rail__me" title={t('sidebar.profileTip', { nick })} aria-label={t('nav.profile')} onClick={() => openUser(nick)}><Avatar nick={nick} size={34} account={myAccount} /></button>
    </nav>
  );
}

type Filter = 'all' | 'rooms' | 'people';

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const order = useChat((s) => s.order);
  const active = useChat((s) => s.active);
  const buffers = useChat((s) => s.buffers);
  const nick = useChat((s) => s.nick);
  const myAccount = useChat((s) => s.account);
  const setActive = useChat((s) => s.setActive);
  const setModal = useChat((s) => s.setModal);
  const openUser = useChat((s) => s.openUser);
  const closeBuffer = useChat((s) => s.closeBuffer);
  const sidebarItems = usePluginRegistry((s) => s.ui);
  const away = useChat((s) => s.away);
  const setAway = useChat((s) => s.setAway);
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

      <div className="side-foot">
        <button className="side-foot__id" title={t('sidebar.viewProfile')} onClick={() => openUser(nick)}>
          <Avatar nick={nick} size={34} account={myAccount} />
          <div className="side-foot__meta">
            <div className="side-foot__name">{nick}</div>
            <div className="side-foot__status"><i className={`presence ${away ? 'presence--away' : ''}`} />{away ? t('sidebar.away') : t('sidebar.online')}</div>
          </div>
        </button>
        <button className="side-foot__cog" title={away ? t('sidebar.markPresent') : t('sidebar.markAway')} aria-label={t('sidebar.presence')}
          onClick={() => setAway(away ? '' : t('sidebar.away'))}>{away ? '🌙' : '☀️'}</button>
        <button className="side-foot__cog" title={t('nav.settings')} aria-label={t('nav.settings')} onClick={() => setModal('settings')}>⚙️</button>
      </div>
    </aside>
  );
}
function RailFriends({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const friends = useChat((s) => s.friends);
  const online = useChat((s) => s.friendsOnline);
  const onlineCount = friends.filter((f) => online[f.toLowerCase()]).length;
  return (
    <button className="rail__item" title={t('nav.friends')} aria-label={t('nav.friends')} onClick={onOpen}>
      👥{onlineCount > 0 && <span className="rail__badge">{onlineCount}</span>}
    </button>
  );
}


// Thin banner shown while the connection is down / reconnecting (the session is
// preserved and auto-reconnect is in progress).
