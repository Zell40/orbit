import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { Modal } from './Modal';

export function ReportModal() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const subject = useActiveChat((s) => s.reportSubject);
  const sendReport = useActiveChat((s) => s.sendReport);
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
