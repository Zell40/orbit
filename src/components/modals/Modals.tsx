import { useState, useEffect, type ReactNode } from 'react';
import { useChat } from '../../store';
import { Avatar } from '../Avatar';
import { SettingsModal } from '../settings/SettingsModal';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="modal__x" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function JoinDialog() {
  const setModal = useChat((s) => s.setModal);
  const client = useChat((s) => s.client);
  const setActive = useChat((s) => s.setActive);
  const openQuery = useChat((s) => s.openQuery);
  const [val, setVal] = useState('#');
  const v = val.trim();
  const isChan = v.startsWith('#') || v.startsWith('&');

  function go() {
    if (v.length < 2) return;
    if (isChan) { client?.join(v); setActive(v); }
    else openQuery(v);
    setModal('');
  }
  return (
    <Modal title="Nouvelle discussion" onClose={() => setModal('')}>
      <p className="modal__sub">Rejoins un salon (commence par <b>#</b>) ou démarre un message privé avec un pseudo.</p>
      <input className="modal__input" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()} placeholder="#salon ou pseudo" />
      <div className="modal__actions">
        <button className="upbtn" onClick={() => setModal('')}>Annuler</button>
        <button className="upbtn upbtn--primary" onClick={go}>
          {isChan ? 'Rejoindre le salon' : 'Démarrer le message privé'}
        </button>
      </div>
    </Modal>
  );
}

function ExploreModal() {
  const setModal = useChat((s) => s.setModal);
  const client = useChat((s) => s.client);
  const setActive = useChat((s) => s.setActive);
  const channels = useChat((s) => s.channels);
  const loading = useChat((s) => s.listLoading);
  const refresh = useChat((s) => s.refreshChannels);
  const [q, setQ] = useState('');

  useEffect(() => { refresh(); }, [refresh]);

  const needle = q.trim().toLowerCase();
  const rows = channels
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.topic.toLowerCase().includes(needle))
    .sort((a, b) => b.users - a.users);

  function join(name: string) {
    const n = name.trim();
    if (!n) return;
    const chan = n.startsWith('#') || n.startsWith('&') ? n : '#' + n;
    client?.join(chan); setActive(chan); setModal('');
  }

  return (
    <Modal title="Explorer les salons" onClose={() => setModal('')}>
      <div className="set-inline" style={{ marginBottom: '.7rem' }}>
        <input className="modal__input" name="channel-search" type="search" autoComplete="off" placeholder="Rechercher ou créer #salon…" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) join(q); }} autoFocus />
        <button className="upbtn upbtn--primary" onClick={() => join(q)} disabled={!q.trim()}>Rejoindre</button>
      </div>
      <div className="explore-list">
        {loading && rows.length === 0 && <div className="explore-empty">Chargement des salons…</div>}
        {!loading && rows.length === 0 && <div className="explore-empty">Aucun salon{needle ? ' trouvé' : ''}. Tape un nom pour en créer un.</div>}
        {rows.map((c) => (
          <button key={c.name} className="explore-row" onClick={() => join(c.name)}>
            <span className="explore-row__av">#</span>
            <div className="explore-row__main">
              <div className="explore-row__name">{c.name}</div>
              {c.topic && <div className="explore-row__topic">{c.topic}</div>}
            </div>
            <span className="explore-row__count"><span className="dot" />{c.users}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function FriendsModal() {
  const friends = useChat((s) => s.friends);
  const online = useChat((s) => s.friendsOnline);
  const add = useChat((s) => s.addFriend);
  const remove = useChat((s) => s.removeFriend);
  const openUser = useChat((s) => s.openUser);
  const openQuery = useChat((s) => s.openQuery);
  const setModal = useChat((s) => s.setModal);
  const [nick, setNick] = useState('');
  const submit = () => { const n = nick.trim(); if (n) { add(n); setNick(''); } };
  const sorted = [...friends].sort((a, b) =>
    Number(!!online[b.toLowerCase()]) - Number(!!online[a.toLowerCase()]) || a.localeCompare(b, 'fr'));
  return (
    <Modal title="Amis" onClose={() => setModal('')}>
      <p className="modal__sub">Ajoute des pseudos pour être prévenu quand ils se connectent. 🔔</p>
      <div className="modal__actions">
        <input className="modal__input" autoFocus value={nick} placeholder="Ajouter un pseudo…"
          onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="upbtn upbtn--primary" onClick={submit}>Ajouter</button>
      </div>
      {sorted.length === 0
        ? <div className="empty" style={{ padding: '1.5rem 0' }}>Aucun ami pour l'instant.</div>
        : <ul className="friends-list">
            {sorted.map((f) => {
              const on = !!online[f.toLowerCase()];
              return (
                <li key={f} className="friend">
                  <Avatar nick={f} size={32} />
                  <span className="friend__name">{f}</span>
                  <span className={`friend__dot friend__dot--${on ? 'on' : 'off'}`} />
                  <span className="friend__state">{on ? 'en ligne' : 'hors ligne'}</span>
                  <button className="friend__act" title="Message privé" onClick={() => { openQuery(f); setModal(''); }}>💬</button>
                  <button className="friend__act" title="Profil" onClick={() => { openUser(f); setModal(''); }}>👤</button>
                  <button className="friend__act friend__act--rm" title="Retirer" onClick={() => remove(f)}>✕</button>
                </li>
              );
            })}
          </ul>}
    </Modal>
  );
}

const CHAN_FLAGS: { m: string; label: string; desc: string }[] = [
  { m: 'i', label: 'Sur invitation', desc: 'Il faut être invité pour entrer (+i)' },
  { m: 'm', label: 'Modéré', desc: 'Seuls les voix et ops peuvent parler (+m)' },
  { m: 'n', label: 'Pas de messages externes', desc: 'Seuls les membres peuvent écrire (+n)' },
  { m: 't', label: 'Sujet protégé', desc: 'Seuls les ops changent le sujet (+t)' },
  { m: 's', label: 'Secret', desc: 'Caché des listes publiques (+s)' },
];

function ChanAdminModal() {
  const setModal = useChat((s) => s.setModal);
  const buffer = useChat((s) => s.buffers[s.active]);
  const banlist = useChat((s) => s.banlists[s.active] || []);
  const loadBanList = useChat((s) => s.loadBanList);
  const setChannelMode = useChat((s) => s.setChannelMode);
  const removeBan = useChat((s) => s.removeBan);
  const modTopic = useChat((s) => s.modTopic);
  const client = useChat((s) => s.client);
  const chan = buffer?.name || '';
  const [newban, setNewban] = useState('');
  const [topic, setTopicVal] = useState(buffer?.topic || '');
  useEffect(() => { if (chan) loadBanList(chan); }, [chan, loadBanList]);
  if (!buffer || !buffer.isChannel) return null;
  const modes = buffer.modes || '';
  const addBan = () => {
    const v = newban.trim(); if (!v) return;
    client?.ban(chan, v.includes('@') || v.includes('!') ? v : `${v}!*@*`);
    setNewban(''); setTimeout(() => loadBanList(chan), 500);
  };
  return (
    <Modal title={`Gérer ${chan}`} wide onClose={() => setModal('')}>
      <div className="ca-sec">
        <h4 className="ca-h">Sujet</h4>
        <div className="modal__actions">
          <input className="modal__input" value={topic} placeholder="Sujet du salon…" onChange={(e) => setTopicVal(e.target.value)} />
          <button className="upbtn upbtn--primary" onClick={() => modTopic(topic)}>Définir</button>
        </div>
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">Réglages</h4>
        {CHAN_FLAGS.map((f) => {
          const on = modes.includes(f.m);
          return (
            <label key={f.m} className="ca-flag">
              <input type="checkbox" checked={on} onChange={() => setChannelMode(chan, f.m, !on)} />
              <span className="ca-flag__txt"><b>{f.label}</b><span className="ca-flag__desc">{f.desc}</span></span>
            </label>
          );
        })}
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">Bannissements ({banlist.length})</h4>
        <div className="modal__actions">
          <input className="modal__input" value={newban} placeholder="*!*@masque ou pseudo…"
            onChange={(e) => setNewban(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBan()} />
          <button className="upbtn upbtn--primary" onClick={addBan}>Bannir</button>
        </div>
        <ul className="ca-bans">
          {banlist.length === 0 && <li className="ca-bans__empty">Aucun bannissement.</li>}
          {banlist.map((b) => (
            <li key={b.mask} className="ca-ban">
              <span className="ca-ban__mask">{b.mask}</span>
              {b.by && <span className="ca-ban__by">par {b.by}</span>}
              <button className="friend__act friend__act--rm" title="Lever le bannissement"
                onClick={() => { removeBan(chan, b.mask); setTimeout(() => loadBanList(chan), 500); }}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

export function Modals() {
  const modal = useChat((s) => s.modal);
  if (modal === 'join') return <JoinDialog />;
  if (modal === 'settings') return <SettingsModal />;
  if (modal === 'explore') return <ExploreModal />;
  if (modal === 'friends') return <FriendsModal />;
  if (modal === 'chanadmin') return <ChanAdminModal />;
  return null;
}
