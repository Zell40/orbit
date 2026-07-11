import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVER } from '@/core/store';
import { avatarBg, formatIrc } from '@/lib/format';
import { setterMask, ago } from '@/lib/topic';
import { stripFormatting } from '@/core/store/text';
import { NotifyMenu } from './NotifyMenu';
import { PinMenu } from './PinMenu';
import { TopbarMore } from './TopbarMore';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { Icon } from '../Icon';
import { useActiveChat } from '@/core/networks';
export function Topbar({ onMenu, onMembers }: { onMenu: () => void; onMembers: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'fr';
  // Narrow per-field selects (stable on message updates) so the topbar doesn't
  // re-render — and recount members — on every incoming line in a busy channel.
  const bname = useActiveChat((s) => s.buffers[s.active]?.name);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const topic = useActiveChat((s) => s.buffers[s.active]?.topic ?? '');
  const topicBy = useActiveChat((s) => s.buffers[s.active]?.topicBy ?? '');
  const topicAt = useActiveChat((s) => s.buffers[s.active]?.topicAt ?? 0);
  const modes = useActiveChat((s) => s.buffers[s.active]?.modes ?? '');
  const members = useActiveChat((s) => s.buffers[s.active]?.members);
  const search = useActiveChat((s) => s.search);
  const setSearch = useActiveChat((s) => s.setSearch);
  const setModal = useActiveChat((s) => s.setModal);
  const closeBuffer = useActiveChat((s) => s.closeBuffer);
  const myPrefix = useActiveChat((s) => { const b = s.buffers[s.active]; const m = b?.members[s.nick]; return m?.prefixes || m?.prefix || ''; });
  const amOp = /[~&@!%]/.test(myPrefix);
  // mIRC-style status line: "Status: <nick> [+<umodes>] on <servername>"
  const myNick = useActiveChat((s) => s.nick);
  const myUmodes = useActiveChat((s) => s.umodes);
  const serverName = useActiveChat((s) => s.serverName);
  const topbarItems = usePluginRegistry((s) => s.ui);
  const [searching, setSearching] = useState(false);
  if (!bname) return <div className="topbar"><button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}><Icon name="menu" size={20} /></button></div>;
  const n = members ? Object.keys(members).length : 0;
  const plug = topbarItems.filter((u) => u.slot === 'topbar_item');
  const setter = topicBy ? setterMask(topicBy, members || {}) : '';
  const setterTitle = setter ? `${t('modals.chanadmin.topicBy')} ${setter}${topicAt ? ` · ${ago(topicAt, locale)}` : ''}` : '';
  const isServer = bname === SERVER;
  const label = isServer ? 'Status' : bname.replace(/^#/, '');
  const statusTitle = `Status: ${myNick || '…'}${myUmodes ? ` [+${myUmodes}]` : ''}${serverName ? ` on ${serverName}` : ''}`;
  if (searching || search) {
    return (
      <div className="topbar topbar--search">
        <button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}><Icon name="menu" size={20} /></button>
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
      <button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}><Icon name="menu" size={20} /></button>
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
        {(isServer || isChannel) && (
          <div className="topbar__sub">
            {isServer
              ? <span className="topbar__topic topbar__topic--muted">{t('topbar.serverTerminal')}</span>
              : topic
                ? <span className="topbar__topic" title={stripFormatting(topic)}>{formatIrc(topic, false)}</span>
                : <span className="topbar__topic topbar__topic--muted">{t('topbar.publicChannel', { n })}</span>}
            {isChannel && setter && (
              <span className="topbar__setby" title={setterTitle}>
                {t('modals.chanadmin.topicBy')}{' '}
                <span className="topbar__setby-who">{setter}</span>
                {topicAt ? <span className="topbar__setby-when"> · {ago(topicAt, locale)}</span> : null}
              </span>
            )}
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
      {!isServer && <TopbarMore bname={bname} isChannel={isChannel} amOp={amOp} plugins={plug} onSearch={() => setSearching(true)} />}
    </div>
  );
}

