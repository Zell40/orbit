import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { ToggleRow } from '../rows';

/** Client behaviour (invite join, close confirm, PM history) — not server facts. */
export function OptionsSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const status = useActiveChat((s) => s.status);
  const account = useActiveChat((s) => s.account);
  const askClear = useActiveChat((s) => s.askClearAllPmHistory);
  const clearPhase = useActiveChat((s) => s.pmHistoryClearAll?.phase);
  const clearError = useActiveChat((s) => s.pmHistoryClearError);
  const connected = status === 'registered' && !!client;
  const hasHistory = connected && !!account.trim() && !!client?.ircv3.hasCap('entrenous/mphistory');
  const canClear = hasHistory && clearPhase !== 'confirm' && clearPhase !== 'pending';

  return (
    <div className="scard">
      <div className="scard__h">{t('settings.behavior.title')}</div>
      <div className="scard__body">
        <ToggleRow icon="📨" label={t('settings.notifications.joinOnInvite')} hint={t('settings.notifications.joinOnInviteHint')} prefKey="joinOnInvite" />
        <ToggleRow icon="🚪" label={t('settings.notifications.confirmClose')} hint={t('settings.notifications.confirmCloseHint')} prefKey="confirmClose" />
        {(hasHistory || !!clearError) && <div className={`srow${!canClear ? ' is-disabled' : ''}`}>
          <span className="srow__ic" aria-hidden>🗑️</span>
          <div className="srow__txt">
            <div className="srow__label">{t('caps.server.clearHistory')}</div>
            <div className="srow__hint">{t('caps.server.clearHistoryHint')}</div>
            {clearError && <div className="sfield__err" role="alert">{clearError}</div>}
          </div>
          <button type="button" className="upbtn upbtn--sm upbtn--danger" disabled={!canClear} onClick={() => askClear()}>
            {t('caps.server.clearHistoryAction')}
          </button>
        </div>}
      </div>
    </div>
  );
}
