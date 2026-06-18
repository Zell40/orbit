import { useState } from 'react';
import { ProfileModal } from './profile/ProfileModal';
import { Modals } from './modals/Modals';
import { MessageList } from './chat/MessageList';
import { Composer } from './chat/Composer';
import { Rail, Sidebar } from './chat/Sidebar';
import { Topbar } from './chat/Topbar';
import { MemberList } from './chat/MemberList';
import { ReconnectBanner, KickToast } from './chat/Banners';

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
