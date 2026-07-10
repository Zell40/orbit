import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '../core/config';
import { getConsent, setConsent } from '../core/consent';
import { initGa } from '../core/ga';

// First-visit analytics consent. Only shown when Google Analytics is configured
// (config.analytics.gaId) and the visitor hasn't chosen yet. Accepting loads gtag;
// rejecting means it never loads. Reject is as prominent as Accept (CNIL).
export function ConsentBanner() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !!getConfig().analytics?.gaId && getConsent() === 'unset');
  if (!open) return null;
  const accept = () => { setConsent('granted'); initGa(); setOpen(false); };
  const reject = () => { setConsent('denied'); setOpen(false); };
  return (
    <div className="consent" role="dialog" aria-label={t('consent.title')} aria-live="polite">
      <div className="consent__body">
        <strong className="consent__title">{t('consent.title')}</strong>
        <p className="consent__text">{t('consent.body')}</p>
      </div>
      <div className="consent__actions">
        <button className="consent__btn consent__btn--ghost" onClick={reject}>{t('consent.reject')}</button>
        <button className="consent__btn consent__btn--primary" onClick={accept}>{t('consent.accept')}</button>
      </div>
    </div>
  );
}
