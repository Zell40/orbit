import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { Modal } from './Modal';

export function JoinDialog() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const client = useActiveChat((s) => s.client);
  const setActive = useActiveChat((s) => s.setActive);
  const openQuery = useActiveChat((s) => s.openQuery);
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
