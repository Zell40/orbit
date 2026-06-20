import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat, SERVER } from '../../store';
import { avatarBg } from '../../lib/format';
import { getConfig } from '../../config';
import { useTheme } from '../../ui/theme';
import { NotifyMenu } from './NotifyMenu';
import { usePluginRegistry } from '../../plugins/registry';
import { PluginBoundary } from '../PluginBoundary';
export function Topbar({ onMenu, onMembers }: { onMenu: () => void; onMembers: () => void }) {
  const { t } = useTranslation();
  const buffer = useChat((s) => s.buffers[s.active]);
  const search = useChat((s) => s.search);
  const setSearch = useChat((s) => s.setSearch);
  const setModal = useChat((s) => s.setModal);
  const myPrefix = useChat((s) => { const b = s.buffers[s.active]; const m = b?.members[s.nick]; return m?.prefixes || m?.prefix || ''; });
  const amOp = /[~&@!%]/.test(myPrefix);
  const mirc = useTheme().startsWith('yomirc');
  const topbarItems = usePluginRegistry((s) => s.ui);
  const [searching, setSearching] = useState(false);
  if (!buffer) return <div className="topbar"><button className="nav-toggle" onClick={onMenu} aria-label={t('sidebar.channels')}>☰</button></div>;
  const n = Object.keys(buffer.members).length;
  const isServer = buffer.name === SERVER;
  const label = isServer ? (mirc ? 'Status' : 'Console') : buffer.name.replace(/^#/, '');
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
        : <span className="topbar__av" style={{ background: avatarBg(buffer.name) }}>{buffer.isChannel ? '#' : label[0]?.toUpperCase()}</span>}
      <div className="topbar__meta">
        <span className="topbar__title">
          {isServer ? (mirc ? `Status — ${getConfig().branding.name}` : `${getConfig().branding.name} — console`) : label}
          {!isServer && buffer.isChannel && buffer.modes && buffer.modes !== '+' && (
            <span className="topbar__modes" title={t('topbar.modes')}>{buffer.modes}</span>
          )}
        </span>
        {isServer
          ? <span className="topbar__topic topbar__topic--muted">{t('topbar.serverTerminal')}</span>
          : buffer.topic
            ? <span className="topbar__topic">{buffer.topic}</span>
            : buffer.isChannel && <span className="topbar__topic topbar__topic--muted">{t('topbar.publicChannel', { n })}</span>}
      </div>
      {topbarItems.filter((u) => u.slot === 'topbar_item').map((u) => <PluginBoundary key={u.id} render={u.render} label="topbar_item" />)}
      {!isServer && <button className="topbar__search" title={t('topbar.search')} aria-label={t('topbar.search')} onClick={() => setSearching(true)}>🔍</button>}
      {buffer.isChannel && <NotifyMenu />}
      {buffer.isChannel && amOp && <button className="topbar__search" title={t('topbar.manage')} aria-label={t('topbar.manage')} onClick={() => setModal('chanadmin')}>🛠️</button>}
      {buffer.isChannel && <button className="topbar__pill" onClick={onMembers} title={t('topbar.membersTitle')} aria-label={t('topbar.members')}><span className="dot" />{n}</button>}
    </div>
  );
}

