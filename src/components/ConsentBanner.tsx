import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '../core/config';
import { getConsent, setConsent } from '../core/consent';
import { setGaConsent } from '../core/ga';

// Analytics consent — a FALLBACK. The Django site (tchatou.fr) already asks and
// stores the choice in the shared `tchatou-consent` entry (same origin), so anyone
// arriving from there is never asked again. This only appears when GA is configured
// AND no choice exists yet — i.e. a direct /app/ visit (installed PWA, bookmark) that
// never hit the marketing site. gtag is already loaded (denied by default); accepting
// grants it, rejecting keeps it denied; reject is as prominent as Accept (CNIL). The
// choice writes the same shared entry.
export function ConsentBanner() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !!getConfig().analytics?.gaId && getConsent() === 'unset');
  if (!open) return null;
  const accept = () => { setConsent('granted'); setGaConsent(true); setOpen(false); };
  const reject = () => { setConsent('denied'); setGaConsent(false); setOpen(false); };
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
