import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVER } from '@/core/store';
import { avatarBg } from '@/lib/format';
import { NotifyMenu } from './NotifyMenu';
import { PinMenu } from './PinMenu';
import { TopbarMore } from './TopbarMore';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { Icon } from '../Icon';
import { useActiveChat } from '@/core/networks';

/** Channel chrome: title + modes + action icons. Topic / setter live in ChannelTopicBanner. */
export function Topbar({ onMenu, onMembers }: { onMenu: () => void; onMembers: () => void }) {
  const { t } = useTranslation();
  const bname = useActiveChat((s) => s.buffers[s.active]?.name);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const modes = useActiveChat((s) => s.buffers[s.active]?.modes ?? '');
  const members = useActiveChat((s) => s.buffers[s.active]?.members);
  const search = useActiveChat((s) => s.search);
  const setSearch = useActiveChat((s) => s.setSearch);
  const setModal = useActiveChat((s) => s.setModal);
  const closeBuffer = useActiveChat((s) => s.closeBuffer);
  const myPrefix = useActiveChat((s) => { const b = s.buffers[s.active]; const m = b?.members[s.nick]; return m?.prefixes || m?.prefix || ''; });
  const amOp = /[~&@!%]/.test(myPrefix);
  const myNick = useActiveChat((s) => s.nick);
  const myUmodes = useActiveChat((s) => s.umodes);
  const serverName = useActiveChat((s) => s.serverName);
  // Unread outside the active buffer — badge the mobile hamburger so new mail is visible.
  const otherUnread = useActiveChat((s) =>
    Object.entries(s.buffers).reduce((n, [k, b]) => n + (k === s.active ? 0 : (b.unread || 0)), 0));
  const topbarItems = usePluginRegistry((s) => s.ui);
  const [searching, setSearching] = useState(false);
  const menuBtn = (
    <button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}>
      <Icon name="menu" size={20} />
      {otherUnread > 0 && <span className="nav-toggle__badge">{otherUnread > 99 ? '99+' : otherUnread}</span>}
    </button>
  );
  if (!bname) return <div className="topbar">{menuBtn}</div>;
  const n = members ? Object.keys(members).length : 0;
  const plug = topbarItems.filter((u) => u.slot === 'topbar_item');
  const isServer = bname === SERVER;
  const label = isServer ? 'Status' : bname.replace(/^#/, '');
  const statusTitle = `Status: ${myNick || '…'}${myUmodes ? ` [+${myUmodes}]` : ''}${serverName ? ` on ${serverName}` : ''}`;
  if (searching || search) {
    return (
      <div className="topbar topbar--search">
        {menuBtn}
        <span className="topbar__searchicon"><Icon name="search" size={16} /></span>
        <input className="topbar__searchinput" name="message-search" type="search" autoComplete="off" autoFocus placeholder={t('topbar.searchIn', { label })}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearching(false); } }} />
        <button className="topbar__searchclose" onClick={() => { setSearch(''); setSearching(false); }} aria-label={t('topbar.closeSearch')}><Icon name="close" size={16} /></button>
      </div>
    );
  }
  return (
    <div className={`topbar ${isServer ? 'topbar--console' : ''} ${isChannel ? 'topbar--channel' : ''}`}>
      {menuBtn}
      {isServer
        ? <span className="term-lights"><i /><i /><i /></span>
        : <span className="topbar__av" style={{ background: avatarBg(bname) }}>{isChannel ? '#' : label[0]?.toUpperCase()}</span>}
      <div className="topbar__meta">
        <span className="topbar__title">
          {isServer ? statusTitle : label}
          {!isServer && isChannel && modes && modes !== '+' && (
            <span className="topbar__modes" title={t('topbar.modes')}>{modes}</span>
          )}
        </span>
        {isServer && (
          <div className="topbar__sub">
            <span className="topbar__topic topbar__topic--muted">{t('topbar.serverTerminal')}</span>
          </div>
        )}
        {!isServer && !isChannel && (
          <div className="topbar__sub">
            <span className="topbar__topic topbar__topic--muted">{t('sidebar.privateMessage')}</span>
          </div>
        )}
      </div>
      {plug.length > 0 && <span className="topbar__plugins topbar__hide-mobile">{plug.map((u) => <PluginBoundary key={u.id} render={u.render} label="topbar_item" />)}</span>}
      {!isServer && <button className="topbar__search topbar__hide-mobile" title={t('topbar.search')} aria-label={t('topbar.search')} onClick={() => setSearching(true)}><Icon name="search" size={19} /></button>}
      {isChannel && <PinMenu />}
      {isChannel && <NotifyMenu />}
      {isChannel && amOp && <button className="topbar__search topbar__hide-mobile" title={t('topbar.manage')} aria-label={t('topbar.manage')} onClick={() => setModal('chanadmin')}><Icon name="sliders" size={19} /></button>}
      {isChannel && <button className="topbar__pill" onClick={onMembers} title={t('topbar.membersTitle')} aria-label={t('topbar.members')}><span className="dot" />{n}</button>}
      {!isServer && (
        <button className="topbar__leave topbar__hide-mobile" onClick={() => closeBuffer(bname)}
          title={isChannel ? t('sidebar.leaveRoom') : t('sidebar.closeConversation')}
          aria-label={isChannel ? t('sidebar.leaveRoom') : t('sidebar.closeConversation')}><Icon name="close" size={18} /></button>
      )}
      {!isServer && <TopbarMore bname={bname} isChannel={isChannel} amOp={amOp} onSearch={() => setSearching(true)} />}
    </div>
  );
}
