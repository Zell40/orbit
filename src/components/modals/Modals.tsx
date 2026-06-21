import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat } from '../../store';
import { Avatar } from '../Avatar';
import { SettingsModal } from '../settings/SettingsModal';
import { QuickSwitcher } from '../QuickSwitcher';
import { Shortcuts } from '../Shortcuts';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
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
          <button className="modal__x" onClick={onClose} aria-label={t('modals.closeButton')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function JoinDialog() {
  const { t } = useTranslation();
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
    <Modal title={t('sidebar.newChat')} onClose={() => setModal('')}>
      <p className="modal__sub">{t('modals.join.sub')}</p>
      <input className="modal__input" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && go()} placeholder={t('modals.join.placeholder')} />
      <div className="modal__actions">
        <button className="upbtn" onClick={() => setModal('')}>{t('profile.cancel')}</button>
        <button className="upbtn upbtn--primary" onClick={go}>
          {isChan ? t('modals.join.joinRoom') : t('modals.join.startDM')}
        </button>
      </div>
    </Modal>
  );
}

function ExploreModal() {
  const { t } = useTranslation();
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
    <Modal title={t('modals.join.title')} onClose={() => setModal('')}>
      <div className="set-inline" style={{ marginBottom: '.7rem' }}>
        <input className="modal__input" name="channel-search" type="search" autoComplete="off" placeholder={t('modals.join.search')} value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) join(q); }} autoFocus />
        <button className="upbtn upbtn--primary" onClick={() => join(q)} disabled={!q.trim()}>{t('modals.join.joinBtn')}</button>
      </div>
      <div className="explore-list">
        {loading && rows.length === 0 && <div className="explore-empty">{t('modals.join.loading')}</div>}
        {!loading && rows.length === 0 && <div className="explore-empty">{needle ? t('modals.join.emptyFound') : t('modals.join.emptyNone')}</div>}
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
  const { t } = useTranslation();
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
    <Modal title={t('modals.friends.title')} onClose={() => setModal('')}>
      <p className="modal__sub">{t('modals.friends.sub')}</p>
      <div className="modal__actions">
        <input className="modal__input" autoFocus value={nick} placeholder={t('modals.dm.search')}
          onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="upbtn upbtn--primary" onClick={submit}>{t('modals.friends.add')}</button>
      </div>
      {sorted.length === 0
        ? <div className="empty" style={{ padding: '1.5rem 0' }}>{t('modals.friends.noFriends')}</div>
        : <ul className="friends-list">
            {sorted.map((f) => {
              const on = !!online[f.toLowerCase()];
              return (
                <li key={f} className="friend">
                  <Avatar nick={f} size={32} />
                  <span className="friend__name">{f}</span>
                  <span className={`friend__dot friend__dot--${on ? 'on' : 'off'}`} />
                  <span className="friend__state">{on ? t('modals.friends.online') : t('modals.friends.offline')}</span>
                  <button className="friend__act" title={t('modals.friends.dm')} onClick={() => { openQuery(f); setModal(''); }}>💬</button>
                  <button className="friend__act" title={t('modals.friends.profile')} onClick={() => { openUser(f); setModal(''); }}>👤</button>
                  <button className="friend__act friend__act--rm" title={t('modals.friends.remove')} onClick={() => remove(f)}>✕</button>
                </li>
              );
            })}
          </ul>}
    </Modal>
  );
}

// Stable keys → labels/descriptions are resolved via i18n (chanFlags.*).
const CHAN_FLAGS: { m: string; key: string }[] = [
  { m: 'i', key: 'invite' },
  { m: 'm', key: 'moderated' },
  { m: 'n', key: 'noExternal' },
  { m: 't', key: 'topicLock' },
  { m: 's', key: 'secret' },
];

function ChanAdminModal() {
  const { t } = useTranslation();
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
    <Modal title={t('modals.chanadmin.manage', { chan })} wide onClose={() => setModal('')}>
      <div className="ca-sec">
        <h4 className="ca-h">{t('modals.chanadmin.subject')}</h4>
        <div className="modal__actions">
          <input className="modal__input" value={topic} placeholder={t('modals.chanadmin.topic')} onChange={(e) => setTopicVal(e.target.value)} />
          <button className="upbtn upbtn--primary" onClick={() => modTopic(topic)}>{t('modals.chanadmin.setTopic')}</button>
        </div>
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">{t('modals.chanadmin.settings')}</h4>
        {CHAN_FLAGS.map((f) => {
          const on = modes.includes(f.m);
          return (
            <label key={f.m} className="ca-flag">
              <input type="checkbox" checked={on} onChange={() => setChannelMode(chan, f.m, !on)} />
              <span className="ca-flag__txt"><b>{t(`chanFlags.${f.key}.label`)}</b><span className="ca-flag__desc">{t(`chanFlags.${f.key}.desc`)}</span></span>
            </label>
          );
        })}
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">{t('modals.chanadmin.bans', { n: banlist.length })}</h4>
        <div className="modal__actions">
          <input className="modal__input" value={newban} placeholder={t('modals.chanadmin.maskPlaceholder')}
            onChange={(e) => setNewban(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBan()} />
          <button className="upbtn upbtn--primary" onClick={addBan}>{t('modals.chanadmin.ban')}</button>
        </div>
        <ul className="ca-bans">
          {banlist.length === 0 && <li className="ca-bans__empty">{t('modals.chanadmin.noBans')}</li>}
          {banlist.map((b) => (
            <li key={b.mask} className="ca-ban">
              <span className="ca-ban__mask">{b.mask}</span>
              {b.by && <span className="ca-ban__by">{t('modals.chanadmin.by', { by: b.by })}</span>}
              <button className="friend__act friend__act--rm" title={t('modals.chanadmin.unban')}
                onClick={() => { removeBan(chan, b.mask); setTimeout(() => loadBanList(chan), 500); }}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function ReportModal() {
  const { t } = useTranslation();
  const setModal = useChat((s) => s.setModal);
  const subject = useChat((s) => s.reportSubject);
  const sendReport = useChat((s) => s.sendReport);
  const [target, setTarget] = useState(subject);
  const [reason, setReason] = useState('');
  const canSend = target.trim().length > 0 && reason.trim().length > 0;
  const submit = () => { if (!canSend) return; sendReport(target, reason); setModal(''); };
  return (
    <Modal title={t('modals.report.title')} onClose={() => setModal('')}>
      <p className="modal__sub">{t('modals.report.sub')}</p>
      <label className="modal__label">{t('modals.report.targetLabel')}</label>
      <input className="modal__input" autoFocus={!subject} value={target}
        onChange={(e) => setTarget(e.target.value)} placeholder={t('modals.report.targetPlaceholder')} />
      <label className="modal__label">{t('modals.report.reasonLabel')}</label>
      <textarea className="modal__input" rows={4} autoFocus={!!subject} value={reason}
        onChange={(e) => setReason(e.target.value)} placeholder={t('modals.report.reasonPlaceholder')}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }} />
      <div className="modal__actions">
        <button className="upbtn" onClick={() => setModal('')}>{t('profile.cancel')}</button>
        <button className="upbtn upbtn--primary" disabled={!canSend} onClick={submit}>{t('modals.report.submit')}</button>
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
  if (modal === 'report') return <ReportModal />;
  if (modal === 'switcher') return <QuickSwitcher />;
  if (modal === 'shortcuts') return <Shortcuts />;
  return null;
}
