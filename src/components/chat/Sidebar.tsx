import { memo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVER } from '@/core/store';
import { avatarBg } from '@/lib/format';
import { stripFormatting } from '@/core/store/text';
import { useTheme } from '@/themes';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { useActiveChat } from '@/core/networks';
import { NetworkTabs } from './NetworkTabs';
import { StatusMenu } from './StatusMenu';
import { getConfig } from '@/core/config';
// The footer bar (TabBar) is in the DOM twice for the responsive layout — a
// window-bottom bar on desktop (`.app > .appbar`) and docked in the drawer on
// mobile (`.sidebar .appbar`), with CSS showing one at the 880px breakpoint. So
// plugin `footer_item` slots render only in whichever copy is actually visible,
// keeping the button a true singleton (it mounts once, not twice).
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => matchMedia(query).matches,
    () => false,
  );
}

// App footer bar: account chip (avatar · nick · presence) · nav (Accueil /
// Salons / Amis) · away toggle + settings — everything that used to live in the
// left rail and the sidebar footer, in one place like a real app.
export function TabBar({ variant = 'desktop' }: { variant?: 'desktop' | 'drawer' }) {
  const { t } = useTranslation();
  const nick = useActiveChat((s) => s.nick);
  const myAccount = useActiveChat((s) => s.account);
  const away = useActiveChat((s) => s.away);
  const setModal = useActiveChat((s) => s.setModal);
  const footerItems = usePluginRegistry((s) => s.ui);
  const footerVisible = variant === (useMediaQuery('(max-width: 880px)') ? 'drawer' : 'desktop');
  const [statusAnchor, setStatusAnchor] = useState<DOMRect | null>(null);
  return (
    <footer className="appbar">
      <button className={`appbar__me ${away ? 'is-away' : ''}`} title={t('sidebar.status')}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setStatusAnchor((a) => (a ? null : r)); }}>
        <span className="appbar__av"><Avatar nick={nick} size={30} account={myAccount} /></span>
        <span className="appbar__meta">
          <span className="appbar__name">{nick}</span>
          <span className="appbar__status">{away ? t('sidebar.away') : t('sidebar.online')}</span>
        </span>
      </button>
      {statusAnchor && <StatusMenu nick={nick} away={away} anchor={statusAnchor} onClose={() => setStatusAnchor(null)} />}
      <nav className="appbar__nav" aria-label={t('a11y.conversations')}>
        <button className="tab is-active" aria-label={t('nav.home')}>
          <span className="tab__ic"><Icon name="home" /></span>
          <span className="tab__lb">{t('nav.home')}</span>
        </button>
        <button className="tab" onClick={() => setModal('explore')} aria-label={t('nav.explore')}>
          <span className="tab__ic"><Icon name="compass" /></span>
          <span className="tab__lb">{t('nav.tabRooms')}</span>
        </button>
        <TabFriends onOpen={() => setModal('friends')} />
        {footerVisible && footerItems.filter((u) => u.slot === 'nav_item').map((u) => <PluginBoundary key={u.id} render={u.render} label="nav_item" />)}
      </nav>
      <div className="appbar__actions">
        {footerVisible && footerItems.filter((u) => u.slot === 'footer_item').map((u) => <PluginBoundary key={u.id} render={u.render} label="footer_item" />)}
        <button className="appbar__act" onClick={() => setModal('settings')}
          title={t('nav.settings')} aria-label={t('nav.settings')}><Icon name="settings" size={20} /></button>
      </div>
    </footer>
  );
}

type Filter = 'all' | 'rooms' | 'people';

// One conversation row. Memoized + subscribed to its OWN buffer, so a message in
// channel X re-renders only X's row, not the whole list on every incoming line.
const RoomRow = memo(function RoomRow({ name, mirc, onNavigate }: { name: string; mirc: boolean; onNavigate: () => void }) {
  const { t } = useTranslation();
  const b = useActiveChat((s) => s.buffers[name]);
  const isActive = useActiveChat((s) => s.active === name);
  const setActive = useActiveChat((s) => s.setActive);
  const closeBuffer = useActiveChat((s) => s.closeBuffer);
  const serverName = useActiveChat((s) => s.serverName);
  if (!b) return null;
  const isServer = name === SERVER;
  const label = isServer ? 'Status' : b.name.replace(/^#/, '');
  const glyph = isServer ? (mirc ? '●' : '✦') : label[0]?.toUpperCase() ?? '?';
  // A channel's topic is the row's subtitle; mark topic-less channels so the
  // minimal (yomirc) skin can hide the repetitive "Public channel" fallback.
  const channelTopic = b.isChannel ? stripFormatting(b.topic || '').trim() : '';
  const genericSub = !isServer && !channelTopic; // no real subtitle (topicless channel or a DM)
  return (
    <div className={`room ${isActive ? 'is-active' : ''} ${isServer ? 'room--status' : ''} ${b.unread > 0 ? 'has-unread' : ''} ${b.highlight ? 'has-mention' : ''}`}
      role="button" tabIndex={0}
      onClick={() => { setActive(name); onNavigate(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(name); onNavigate(); } }}>
      <span className="room__av" data-server={isServer || undefined}
        style={isServer ? undefined : { background: avatarBg(name) }}>
        {b.isChannel ? <span className="room__hash">#</span> : glyph}
      </span>
      <span className="room__body">
        <span className="room__name">{label}</span>
        <span className={`room__sub${genericSub ? ' room__sub--generic' : ''}`}>{
          isServer ? (serverName || t('sidebar.system'))
            : b.isChannel ? (channelTopic || t('sidebar.publicRoom'))
              : t('sidebar.privateMessage')
        }</span>
      </span>
      {b.unread > 0 && <span className="room__badge">{b.unread}</span>}
      {!isServer && (
        <button
          type="button"
          className="room__close"
          title={b.isChannel ? t('sidebar.leaveRoom') : t('sidebar.closeConversation')}
          onClick={(e) => { e.stopPropagation(); closeBuffer(name); }}
        >✕</button>
      )}
    </div>
  );
});

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const order = useActiveChat((s) => s.order);
  const buffers = useActiveChat((s) => s.buffers);
  const setModal = useActiveChat((s) => s.setModal);
  const refreshChannels = useActiveChat((s) => s.refreshChannels);
  const sidebarItems = usePluginRegistry((s) => s.ui);
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

  const item = (name: string) => <RoomRow key={name} name={name} mirc={mirc} onNavigate={onNavigate} />;

  const totalShown = (showChannels ? channels.length : 0) + (showQueries ? queries.length : 0) + (hasServer ? 1 : 0);

  return (
    <aside className="sidebar" aria-label={t('a11y.conversations')}>
      <div className="side-top">
        <h2 className="side-title">{t('nav.home')}</h2>
        {sidebarItems.filter((u) => u.slot === 'sidebar_item').map((u) => <PluginBoundary key={u.id} render={u.render} label="sidebar_item" />)}
        <button className="side-compose" title={t('sidebar.newChat')} aria-label={t('sidebar.newChat')} onClick={() => setModal('join')}>✎</button>
        {/* mIRC toolbar: a channels-list button (the vertical Explore CTA is hidden in the switchbar). */}
        {mirc && <button className="side-compose side-explore" title={t('nav.explore')} aria-label={t('nav.explore')} onClick={() => { refreshChannels(); setModal('explore'); }}>☰</button>}
      </div>

      {getConfig().features.multiNetwork && <NetworkTabs />}

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
        {/* Fill the space under a short list with a way to find more rooms. */}
        {showChannels && !q && (
          <button className="room-discover" onClick={() => { refreshChannels(); setModal('explore'); }}>
            <span>{t('nav.explore')}</span>
            <span className="room-discover__arrow" aria-hidden>→</span>
          </button>
        )}
      </div>

      {/* On mobile the app bar docks at the bottom of this drawer instead of over
          the conversation; CSS shows this copy only on mobile (the full-width bar
          at the window bottom is used on desktop). */}
      <TabBar variant="drawer" />
    </aside>
  );
}
function TabFriends({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const friends = useActiveChat((s) => s.friends);
  const online = useActiveChat((s) => s.friendsOnline);
  const onlineCount = friends.filter((f) => online[f.toLowerCase()]).length;
  return (
    <button className="tab" onClick={onOpen} aria-label={t('nav.friends')}>
      <span className="tab__ic"><Icon name="users" />{onlineCount > 0 && <span className="tab__badge">{onlineCount}</span>}</span>
      <span className="tab__lb">{t('nav.friends')}</span>
    </button>
  );
}


// Thin banner shown while the connection is down / reconnecting (the session is
// preserved and auto-reconnect is in progress).
