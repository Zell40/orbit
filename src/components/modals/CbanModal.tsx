import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { Modal } from './Modal';

// Shown when a JOIN is refused because the channel is CBANed network-wide
// (numeric 926, ERR_BADCHANNEL). The CBAN reason often names the correct
// channel, so we offer a one-click join to it.
export function CbanModal() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const cban = useActiveChat((s) => s.cban);
  const client = useActiveChat((s) => s.client);
  if (!cban) return null;

  const suggested = (cban.reason.match(/#[^\s,.:;!?]+/) || [])[0];
  const close = () => setModal('');
  const joinSuggested = () => { if (suggested) client?.join(suggested); close(); };

  return (
    <Modal title={t('modals.cban.title')} onClose={close}>
      <p className="modal__sub">{t('modals.cban.sub', { channel: cban.channel })}</p>
      {cban.reason && (
        <div style={{
          margin: '.2rem 0 .9rem', padding: '.6rem .8rem', borderRadius: '10px',
          background: 'var(--bg-soft, rgba(255,255,255,.05))', borderLeft: '3px solid var(--accent)',
          fontSize: '.9rem', lineHeight: 1.45, wordBreak: 'break-word',
        }}>{cban.reason}</div>
      )}
      <div className="modal__actions">
        <button className="upbtn" onClick={close}>{t('modals.cban.close')}</button>
        {suggested && (
          <button className="upbtn upbtn--primary" onClick={joinSuggested}>
            {t('modals.cban.joinSuggested', { channel: suggested })}
          </button>
        )}
      </div>
    </Modal>
  );
}
