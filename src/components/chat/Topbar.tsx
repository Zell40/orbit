import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVER } from '../../core/store';
import { avatarBg, formatIrc } from '../../lib/format';
import { stripFormatting } from '../../core/store/text';
import { NotifyMenu } from './NotifyMenu';
import { PinMenu } from './PinMenu';
import { usePluginRegistry } from '../../modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { useActiveChat } from '../../core/networks';
export function Topbar({ onMenu, onMembers }: { onMenu: () => void; onMembers: () => void }) {
  const { t } = useTranslation();
  // Narrow per-field selects (stable on message updates) so the topbar doesn't
  // re-render — and recount members — on every incoming line in a busy channel.
  const bname = useActiveChat((s) => s.buffers[s.active]?.name);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const topic = useActiveChat((s) => s.buffers[s.active]?.topic ?? '');
  const modes = useActiveChat((s) => s.buffers[s.active]?.modes ?? '');
  const members = useActiveChat((s) => s.buffers[s.active]?.members);
  const search = useActiveChat((s) => s.search);
  const setSearch = useActiveChat((s) => s.setSearch);
  const setModal = useActiveChat((s) => s.setModal);
  const myPrefix = useActiveChat((s) => { const b = s.buffers[s.active]; const m = b?.members[s.nick]; return m?.prefixes || m?.prefix || ''; });
  const amOp = /[~&@!%]/.test(myPrefix);
  // mIRC-style status line: "Status: <nick> [+<umodes>] on <servername>"
  const myNick = useActiveChat((s) => s.nick);
  const myUmodes = useActiveChat((s) => s.umodes);
  const serverName = useActiveChat((s) => s.serverName);
  const topbarItems = usePluginRegistry((s) => s.ui);
  const [searching, setSearching] = useState(false);
  if (!bname) return <div className="topbar"><button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}>☰</button></div>;
  const n = members ? Object.keys(members).length : 0;
  const isServer = bname === SERVER;
  const label = isServer ? 'Status' : bname.replace(/^#/, '');
  const statusTitle = `Status: ${myNick || '…'}${myUmodes ? ` [+${myUmodes}]` : ''}${serverName ? ` on ${serverName}` : ''}`;
  if (searching || search) {
    return (
      <div className="topbar topbar--search">
        <button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}>☰</button>
        <span className="topbar__searchicon">🔍</span>
        <input className="topbar__searchinput" name="message-search" type="search" autoComplete="off" autoFocus placeholder={t('topbar.searchIn', { label })}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearching(false); } }} />
        <button className="topbar__searchclose" onClick={() => { setSearch(''); setSearching(false); }} aria-label={t('topbar.closeSearch')}>✕</button>
      </div>
    );
  }
  return (
    <div className={`topbar ${isServer ? 'topbar--console' : ''}`}>
      <button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}>☰</button>
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
        {isServer
          ? <span className="topbar__topic topbar__topic--muted">{t('topbar.serverTerminal')}</span>
          : topic
            ? <span className="topbar__topic" title={stripFormatting(topic)}>{formatIrc(topic, false)}</span>
            : isChannel && <span className="topbar__topic topbar__topic--muted">{t('topbar.publicChannel', { n })}</span>}
      </div>
      {topbarItems.filter((u) => u.slot === 'topbar_item').map((u) => <PluginBoundary key={u.id} render={u.render} label="topbar_item" />)}
      {!isServer && <button className="topbar__search" title={t('topbar.search')} aria-label={t('topbar.search')} onClick={() => setSearching(true)}>🔍</button>}
      {isChannel && <PinMenu />}
      {isChannel && <NotifyMenu />}
      {isChannel && amOp && <button className="topbar__search" title={t('topbar.manage')} aria-label={t('topbar.manage')} onClick={() => setModal('chanadmin')}>🛠️</button>}
      {isChannel && <button className="topbar__pill" onClick={onMembers} title={t('topbar.membersTitle')} aria-label={t('topbar.members')}><span className="dot" />{n}</button>}
    </div>
  );
}

