import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { Modal } from './Modal';

// Shown when ERR_CANNOTSENDTOCHAN is classified as channel +m without voice.
// Same layout as the CBAN dialog: title, short sub, explained reason box, close.
export function ModeratedModal() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const dismissKick = useActiveChat((s) => s.dismissKick);
  const kicked = useActiveChat((s) => s.kicked);
  if (!kicked || kicked.kind !== 'moderated') return null;

  const close = () => {
    setModal('');
    dismissKick();
  };

  return (
    <Modal title={t('modals.moderated.title')} onClose={close}>
      <p className="modal__sub">{t('modals.moderated.sub', { channel: kicked.channel })}</p>
      <div style={{
        margin: '.2rem 0 .9rem', padding: '.6rem .8rem', borderRadius: '10px',
        background: 'var(--bg-soft, rgba(255,255,255,.05))', borderLeft: '3px solid var(--accent)',
        fontSize: '.9rem', lineHeight: 1.45, wordBreak: 'break-word',
      }}>{t('modals.moderated.body')}</div>
      <div className="modal__actions">
        <button className="upbtn upbtn--primary" onClick={close}>{t('modals.moderated.close')}</button>
      </div>
    </Modal>
  );
}
