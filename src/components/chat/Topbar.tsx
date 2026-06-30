import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat, SERVER } from '../../store';
import { avatarBg, formatIrc } from '../../lib/format';
import { stripFormatting } from '../../store/text';
import { NotifyMenu } from './NotifyMenu';
import { usePluginRegistry } from '../../plugins/registry';
import { PluginBoundary } from '../PluginBoundary';
export function Topbar({ onMenu, onMembers }: { onMenu: () => void; onMembers: () => void }) {
  const { t } = useTranslation();
  // Narrow per-field selects (stable on message updates) so the topbar doesn't
  // re-render — and recount members — on every incoming line in a busy channel.
  const bname = useChat((s) => s.buffers[s.active]?.name);
  const isChannel = useChat((s) => !!s.buffers[s.active]?.isChannel);
  const topic = useChat((s) => s.buffers[s.active]?.topic ?? '');
  const modes = useChat((s) => s.buffers[s.active]?.modes ?? '');
  const members = useChat((s) => s.buffers[s.active]?.members);
  const search = useChat((s) => s.search);
  const setSearch = useChat((s) => s.setSearch);
  const setModal = useChat((s) => s.setModal);
  const myPrefix = useChat((s) => { const b = s.buffers[s.active]; const m = b?.members[s.nick]; return m?.prefixes || m?.prefix || ''; });
  const amOp = /[~&@!%]/.test(myPrefix);
  // mIRC-style status line: "Status: <nick> [+<umodes>] on <servername>"
  const myNick = useChat((s) => s.nick);
  const myUmodes = useChat((s) => s.umodes);
  const serverName = useChat((s) => s.serverName);
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
      {isChannel && <NotifyMenu />}
      {isChannel && amOp && <button className="topbar__search" title={t('topbar.manage')} aria-label={t('topbar.manage')} onClick={() => setModal('chanadmin')}>🛠️</button>}
      {isChannel && <button className="topbar__pill" onClick={onMembers} title={t('topbar.membersTitle')} aria-label={t('topbar.members')}><span className="dot" />{n}</button>}
    </div>
  );
}

