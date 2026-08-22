import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyAppUpdate, onAppUpdate } from '../ui/appUpdate';

export function AppUpdateBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => onAppUpdate(() => setShow(true)), []);
  if (!show) return null;
  return (
    <div className="appupd" role="status">
      <p className="appupd__txt">
        <strong>{t('banners.appUpdateTitle')}</strong>
        {' '}
        {t('banners.appUpdateBody')}
      </p>
      <button type="button" className="appupd__go" onClick={() => applyAppUpdate()}>
        {t('banners.appUpdateReload')}
      </button>
    </div>
  );
}
