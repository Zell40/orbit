import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '../../../core/networks';
import { Avatar } from '../../Avatar';
import { Modal } from '../../modals/Modal';
import { clearResume } from '../../../core/resume';

export function ProfileSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const nick = useActiveChat((s) => s.nick);
  const account = useActiveChat((s) => s.account);
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <div className="scard">
        <div className="scard__body">
          <div className="srow">
            <span className="srow__ic" style={{ background: 'transparent', padding: 0 }}><Avatar nick={nick} size={42} account={account} /></span>
            <div className="srow__txt">
              <div className="srow__label">{nick}</div>
              <div className="srow__hint">{account ? <>{t('settings.account.loggedIn')} · <strong style={{ color: 'var(--accent-d)' }}>@{account}</strong></> : t('settings.account.guestNotConnected')}</div>
            </div>
          </div>
        </div>
      </div>

      <button className="set-leave" onClick={() => setLeaving(true)}>{t('settings.account.leaveChat')}</button>

      {leaving && (
        <Modal title={t('settings.account.leaveChat')} onClose={() => setLeaving(false)}>
          <p className="modal__sub">{t('settings.account.leaveConfirm')}</p>
          <div className="modal__actions">
            <button className="upbtn" onClick={() => setLeaving(false)}>{t('profile.cancel')}</button>
            <button className="upbtn upbtn--danger" onClick={() => { clearResume(); client?.disconnect(); location.reload(); }}>{t('settings.account.leaveChat')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
