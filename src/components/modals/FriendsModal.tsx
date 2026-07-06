import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../Avatar';
import { useActiveChat } from '../../core/networks';
import { Modal } from './Modal';

export function FriendsModal() {
  const { t } = useTranslation();
  const friends = useActiveChat((s) => s.friends);
  const online = useActiveChat((s) => s.friendsOnline);
  const add = useActiveChat((s) => s.addFriend);
  const remove = useActiveChat((s) => s.removeFriend);
  const openUser = useActiveChat((s) => s.openUser);
  const openQuery = useActiveChat((s) => s.openQuery);
  const setModal = useActiveChat((s) => s.setModal);
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
