import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileModal } from './profile/ProfileModal';
import { Modals } from './modals/Modals';
import { MessageList } from './chat/MessageList';
import { Composer } from './chat/Composer';
import { TabBar, Sidebar } from './chat/Sidebar';
import { Topbar } from './chat/Topbar';
import { ChannelTopicBanner } from './chat/ChannelTopicBanner';
import { MemberList } from './chat/MemberList';
import { ReconnectBanner, KickToast, GuestRegisterPrompt } from './chat/Banners';
import { usePluginRegistry } from '../modules/registry';
import { PluginBoundary } from './PluginBoundary';
import { FriendsPanel } from './chat/FriendsPanel';
import { useActiveChat } from '@/core/networks';

export function Chat() {
  const { t } = useTranslation();
  const [navOpen, setNavOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  // A plugin-filled bar across the very top (branding + portal links). Nothing
  // renders it by default, so the shell collapses to just the app.
  const ui = usePluginRegistry((s) => s.ui);
  const navbar = ui.filter((u) => u.slot === 'navbar');
  // Persistent, root-level home for plugin popovers/panels (see UiSlot 'overlay').
  // Conference sits in the main column under the topbar so chrome stays visible.
  const overlays = ui.filter((u) => u.slot === 'overlay');
  // In-column overlays: conference video + Petit Bac game HUD (under topbar).
  const mainColumnPlugins = new Set(['orbit-conference', 'orbit-petitbac']);
  const mainBanners = overlays.filter((u) => mainColumnPlugins.has(u.plugin));
  const rootOverlays = overlays.filter((u) => !mainColumnPlugins.has(u.plugin));
  // Stable so the memoized room rows aren't invalidated on every render.
  const closeNav = useCallback(() => setNavOpen(false), []);
  // PMs / server console have no member list — drop the empty side column.
  useEffect(() => {
    if (!isChannel) setMembersOpen(false);
  }, [isChannel]);
  return (
    <div className="shell">
      {navbar.map((u) => <PluginBoundary key={u.id} render={u.render} label="navbar" />)}
    <div className={`app ${navOpen ? 'nav-open' : ''} ${membersOpen ? 'members-open' : ''} ${isChannel ? '' : 'app--nomembers'}`}>
      <a className="skip-link" href="#orbit-main">{t('a11y.skip')}</a>
      <Sidebar onNavigate={closeNav} />
      <main className="main" id="orbit-main">
        {/* Gallery plugin paints --rg-pic here for a soft room backdrop. */}
        <div className="main__room-bg" aria-hidden="true" />
        <Topbar onMenu={() => setNavOpen(true)} onMembers={() => setMembersOpen(true)} />
        {/* Conference: always under topbar (desktop + mobile), topic stays compact below. */}
        {mainBanners.map((u) => <PluginBoundary key={u.id} render={u.render} label="overlay" />)}
        <ChannelTopicBanner />
        <MessageList />
        <Composer />
      </main>
      {isChannel && <MemberList onNavigate={() => setMembersOpen(false)} />}
      <TabBar variant="desktop" />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      {membersOpen && <div className="nav-backdrop" onClick={() => setMembersOpen(false)} />}
      <Modals />
      <ProfileModal />
      <KickToast />
      <GuestRegisterPrompt />
      <ReconnectBanner />
    </div>
      {rootOverlays.map((u) => <PluginBoundary key={u.id} render={u.render} label="overlay" />)}
      <FriendsPanel />
    </div>
  );
}
