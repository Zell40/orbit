import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileModal } from './profile/ProfileModal';
import { Modals } from './modals/Modals';
import { MessageList } from './chat/MessageList';
import { Composer } from './chat/Composer';
import { TabBar, Sidebar } from './chat/Sidebar';
import { Topbar } from './chat/Topbar';
import { ChannelTopicBanner } from './chat/ChannelTopicBanner';
import { MemberList } from './chat/MemberList';
import { ReconnectBanner, KickToast } from './chat/Banners';
import { usePluginRegistry } from '../modules/registry';
import { PluginBoundary } from './PluginBoundary';
import { FriendsPanel } from './chat/FriendsPanel';

export function Chat() {
  const { t } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  // A plugin-filled bar across the very top (branding + portal links). Nothing
  // renders it by default, so the shell collapses to just the app.
  const ui = usePluginRegistry((s) => s.ui);
  const navbar = ui.filter((u) => u.slot === 'navbar');
  // Persistent, root-level home for plugin popovers/panels (see UiSlot 'overlay').
  const overlays = ui.filter((u) => u.slot === 'overlay');
  // Stable so the memoized room rows aren't invalidated on every render.
  const closeNav = useCallback(() => setNavOpen(false), []);
  return (
    <div className="shell">
      {navbar.map((u) => <PluginBoundary key={u.id} render={u.render} label="navbar" />)}
    <div className={`app ${navOpen ? 'nav-open' : ''} ${membersOpen ? 'members-open' : ''}`}>
      <a className="skip-link" href="#orbit-main">{t('a11y.skip')}</a>
      <Sidebar onNavigate={closeNav} />
      <main className="main" id="orbit-main">
        <Topbar onMenu={() => setNavOpen(true)} onMembers={() => setMembersOpen(true)} />
        <ChannelTopicBanner />
        <MessageList />
        <Composer />
      </main>
      <MemberList onNavigate={() => setMembersOpen(false)} />
      <TabBar variant="desktop" />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      {membersOpen && <div className="nav-backdrop" onClick={() => setMembersOpen(false)} />}
      <Modals />
      <ProfileModal />
      <KickToast />
      <ReconnectBanner />
    </div>
      {overlays.map((u) => <PluginBoundary key={u.id} render={u.render} label="overlay" />)}
      <FriendsPanel />
    </div>
  );
}
