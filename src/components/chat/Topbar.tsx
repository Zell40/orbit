import { useState } from 'react';
import { useChat, SERVER } from '../../store';
import { avatarBg } from '../../lib/format';
import { getConfig } from '../../config';
import { useTheme } from '../../ui/theme';
export function Topbar({ onMenu, onMembers }: { onMenu: () => void; onMembers: () => void }) {
  const buffer = useChat((s) => s.buffers[s.active]);
  const search = useChat((s) => s.search);
  const setSearch = useChat((s) => s.setSearch);
  const setModal = useChat((s) => s.setModal);
  const myPrefix = useChat((s) => { const b = s.buffers[s.active]; const m = b?.members[s.nick]; return m?.prefixes || m?.prefix || ''; });
  const amOp = /[~&@!%]/.test(myPrefix);
  const muted = useChat((s) => s.mutedChannels.includes(s.active));
  const toggleMute = useChat((s) => s.toggleMute);
  const activeName = useChat((s) => s.active);
  const mirc = useTheme().startsWith('yomirc');
  const [searching, setSearching] = useState(false);
  if (!buffer) return <div className="topbar"><button className="nav-toggle" onClick={onMenu} aria-label="Salons">☰</button></div>;
  const n = Object.keys(buffer.members).length;
  const isServer = buffer.name === SERVER;
  const label = isServer ? (mirc ? 'Status' : 'Console') : buffer.name.replace(/^#/, '');
  if (searching || search) {
    return (
      <div className="topbar topbar--search">
        <button className="nav-toggle" onClick={onMenu} aria-label="Salons">☰</button>
        <span className="topbar__searchicon">🔍</span>
        <input className="topbar__searchinput" name="message-search" type="search" autoComplete="off" autoFocus placeholder={`Rechercher dans ${label}…`}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setSearching(false); } }} />
        <button className="topbar__searchclose" onClick={() => { setSearch(''); setSearching(false); }} aria-label="Fermer la recherche">✕</button>
      </div>
    );
  }
  return (
    <div className={`topbar ${isServer ? 'topbar--console' : ''}`}>
      <button className="nav-toggle" onClick={onMenu} aria-label="Salons">☰</button>
      {isServer
        ? <span className="term-lights"><i /><i /><i /></span>
        : <span className="topbar__av" style={{ background: avatarBg(buffer.name) }}>{buffer.isChannel ? '#' : label[0]?.toUpperCase()}</span>}
      <div className="topbar__meta">
        <span className="topbar__title">
          {isServer ? (mirc ? `Status — ${getConfig().branding.name}` : `${getConfig().branding.name} — console`) : label}
          {!isServer && buffer.isChannel && buffer.modes && buffer.modes !== '+' && (
            <span className="topbar__modes" title="Modes du salon">{buffer.modes}</span>
          )}
        </span>
        {isServer
          ? <span className="topbar__topic topbar__topic--muted">Terminal serveur · tape une commande IRC (/list, /whois, /join…)</span>
          : buffer.topic
            ? <span className="topbar__topic">{buffer.topic}</span>
            : buffer.isChannel && <span className="topbar__topic topbar__topic--muted">Salon public · {n} membres</span>}
      </div>
      {!isServer && <button className="topbar__search" title="Rechercher" aria-label="Rechercher" onClick={() => setSearching(true)}>🔍</button>}
      {buffer.isChannel && <button className="topbar__search" title={muted ? 'Réactiver les notifications' : 'Couper les notifications'} aria-label="Notifications" onClick={() => toggleMute(activeName)}>{muted ? '🔕' : '🔔'}</button>}
      {buffer.isChannel && amOp && <button className="topbar__search" title="Gérer le salon" aria-label="Gérer le salon" onClick={() => setModal('chanadmin')}>🛠️</button>}
      {buffer.isChannel && <button className="topbar__pill" onClick={onMembers} title="Membres" aria-label="Voir les membres"><span className="dot" />{n}</button>}
    </div>
  );
}

