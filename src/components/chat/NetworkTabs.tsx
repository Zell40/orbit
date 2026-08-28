import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useNetworks, passKey, type NetworkEntry } from '@/core/networks';
import { getConfig } from '@/core/config';
import { zncPass } from '@/core/bouncer';

// One network chip: connection dot + label + (when it's not the active one) an
// unread badge. Subscribes to THIS network's own store for its status/unread.
function NetTab({ net, active }: { net: NetworkEntry; active: boolean }) {
  const setActive = useNetworks((s) => s.setActive);
  const remove = useNetworks((s) => s.remove);
  const isPrimary = useNetworks((s) => s.networks[0]?.id === net.id);
  const status = useStore(net.store, (s) => s.status);
  const serverName = useStore(net.store, (s) => s.serverName);
  const ircNetwork = useStore(net.store, (s) => s.ircNetwork);
  // The active network's badge is never shown (below), so skip the whole-buffer
  // unread scan for it — that's the network taking the most message traffic.
  const unread = useStore(net.store, (s) => (active ? 0 : Object.values(s.buffers).reduce((a, b) => a + (b.unread || 0), 0)));
  const shown = ircNetwork || net.label || serverName;
  return (
    <span className={`nettab ${active ? 'is-on' : ''}`}>
      <button className="nettab__main" onClick={() => setActive(net.id)} title={shown || serverName || net.label}>
        <span className={`nettab__dot nettab__dot--${status === 'registered' ? 'on' : 'off'}`} />
        <span className="nettab__label">{shown}</span>
        {!active && unread > 0 && <span className="nettab__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {!isPrimary && <button className="nettab__x" onClick={() => remove(net.id)} title="✕" aria-label="remove">✕</button>}
    </span>
  );
}

export function NetworkTabs() {
  const { t } = useTranslation();
  const networks = useNetworks((s) => s.networks);
  const activeId = useNetworks((s) => s.activeId);
  const [adding, setAdding] = useState(false);
  return (
    <div className="nettabs">
      {networks.map((n) => <NetTab key={n.id} net={n} active={n.id === activeId} />)}
      <button className="nettab nettab--add" onClick={() => setAdding(true)}
        title={t('networks.add')}>+</button>
      {adding && <AddNetwork onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddNetwork({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState(getConfig().server.url);
  const [nick, setNick] = useState('');
  const [chans, setChans] = useState('');
  const [pass, setPass] = useState('');
  const [bouncer, setBouncer] = useState(false);

  function go() {
    const nk = nick.trim();
    if (!nk || !url.trim()) return;
    let name = label.trim();
    if (!name) { try { name = new URL(url).hostname; } catch { name = 'Network'; } }
    const u = url.trim();
    const channels = chans.split(',').map((c) => c.trim()).filter(Boolean);
    const entry = useNetworks.getState().add(name, { url: u, nick: nk, channels, bouncer });
    const secret = bouncer && pass ? zncPass(nk, '', pass) : pass;
    if (secret) sessionStorage.setItem(passKey(u, nk), secret); // survives reload same-tab, not localStorage
    entry.store.getState().connect(bouncer
      ? { url: u, nick: nk, channels, serverPassword: secret || undefined }
      : { url: u, nick: nk, channels, password: pass || undefined });
    useNetworks.getState().setActive(entry.id);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{t('networks.add')}</h3>
          <button className="modal__x" onClick={onClose} aria-label={t('modals.closeButton')}>✕</button>
        </div>
        <input className="modal__input" placeholder={t('networks.name')} value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="modal__input" placeholder="wss://host/irc/" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="modal__input" autoFocus placeholder={t('connect.nickAria')} value={nick} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <input className="modal__input" placeholder="#channel, #other" value={chans} onChange={(e) => setChans(e.target.value)} />
        <label className="modal__check">
          <input type="checkbox" checked={bouncer} onChange={(e) => setBouncer(e.target.checked)} />
          {t('networks.bouncer')}
        </label>
        <input className="modal__input" type="password" placeholder={bouncer ? t('connect.bouncerPassPlaceholder') : t('networks.password')} value={pass} onChange={(e) => setPass(e.target.value)} />
        <div className="modal__actions">
          <button className="upbtn" onClick={onClose}>{t('profile.cancel')}</button>
          <button className="upbtn upbtn--primary" onClick={go}>{t('networks.connect')}</button>
        </div>
      </div>
    </div>
  );
}
