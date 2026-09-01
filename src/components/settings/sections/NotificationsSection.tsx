import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { isPushSupported, pushEnabledPref, enablePush, disablePush } from '@/platform/push';
import { useActiveChat } from '@/core/networks';
import { getConsent, setConsent } from '@/core/consent';
import { setGaConsent } from '@/core/ga';
import { ToggleRow } from '../rows';

// Withdraw / grant Google Analytics consent (only shown when GA is configured).
function AnalyticsRow() {
  const { t } = useTranslation();
  const [on, setOn] = useState(getConsent() === 'granted');
  if (!getConfig().analytics?.gaId) return null;
  const toggle = () => {
    if (on) { setConsent('denied'); setGaConsent(false); setOn(false); }
    else { setConsent('granted'); setGaConsent(true); setOn(true); }
  };
  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>📊</span>
      <div className="srow__txt">
        <div className="srow__label">{t('consent.manageLabel')}</div>
        <div className="srow__hint">{on ? t('consent.manageOn') : t('consent.manageOff')}</div>
      </div>
      <button className={`switch ${on ? 'is-on' : ''}`} role="switch" aria-checked={on}
        aria-label={t('consent.manageLabel')} onClick={toggle}><span className="switch__dot" /></button>
    </div>
  );
}

// Web Push toggle — needs both browser support and a VAPID key from the server.
function PushRow() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const account = useActiveChat((s) => s.account);
  const supported = isPushSupported();
  const [on, setOn] = useState(pushEnabledPref());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hasVapid = !!client?.server.vapid;

  async function toggle() {
    if (!client || busy) return;
    setBusy(true); setErr('');
    if (on) {
      await disablePush(client, account);
      setOn(false);
    } else {
      const r = await enablePush(client, account);
      if (r.ok) setOn(true);
      else setErr(
        r.reason === 'denied' ? t('settings.notifications.pushDenied')
        : r.reason === 'no-vapid' ? t('settings.notifications.pushUnavailable')
        : r.reason === 'no-account' ? t('settings.notifications.pushNeedAccount')
        : t('settings.notifications.pushFailed'),
      );
    }
    setBusy(false);
  }

  const hint = !supported ? t('settings.notifications.pushUnsupported')
    : !hasVapid ? t('settings.notifications.pushUnavailable')
    : !account ? t('settings.notifications.pushNeedAccount')
    : err ? err
    : on ? t('settings.notifications.pushActive')
    : t('settings.notifications.pushHint');

  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>📲</span>
      <div className="srow__txt">
        <div className="srow__label">{t('settings.notifications.pushLabel')}</div>
        <div className="srow__hint" style={err ? { color: 'var(--danger, #d33)' } : undefined}>{hint}</div>
      </div>
      {supported && hasVapid
        ? <button className={`switch ${on ? 'is-on' : ''} ${busy ? 'is-busy' : ''}`} role="switch" aria-checked={on}
            aria-label={t('settings.notifications.pushLabel')} disabled={busy || !account} onClick={toggle}><span className="switch__dot" /></button>
        : <span className="srow__hint">—</span>}
    </div>
  );
}

function HighlightWordsRow() {
  const { t } = useTranslation();
  const words = useActiveChat((s) => s.highlightWords);
  const setWords = useActiveChat((s) => s.setHighlightWords);
  const [val, setVal] = useState(words.join(', '));
  const save = () => setWords(val.split(',').map((w) => w.trim()).filter(Boolean));
  return (
    <div className="sfield">
      <label className="sfield__label">🔆 {t('settings.notifications.highlightLabel')}</label>
      <div className="sfield__row">
        <input className="modal__input" value={val} placeholder={t('settings.notifications.highlightPlaceholder')}
          onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <div className="srow__hint" style={{ marginTop: '.3rem' }}>{t('settings.notifications.highlightHint')}</div>
    </div>
  );
}

export function NotificationsSection() {
  const { t } = useTranslation();
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported');
  function askNotif() {
    if ('Notification' in window) Notification.requestPermission().then(setNotif);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="srow">
          <span className="srow__ic" aria-hidden>🔔</span>
          <div className="srow__txt">
            <div className="srow__label">{t('settings.notifications.browserLabel')}</div>
            <div className="srow__hint">{
              notif === 'granted'
                ? (pushEnabledPref() ? t('settings.notifications.browserSuperseded') : t('settings.notifications.browserGranted'))
                : notif === 'denied' ? t('settings.notifications.browserDenied')
                : t('settings.notifications.browserDefault')
            }</div>
          </div>
          <div className="srow__ctrl">
            {notif === 'granted' ? <span className="sbadge-ok">✓ {t('settings.notifications.enabled')}</span>
              : notif === 'unsupported' || notif === 'denied' ? <span className="srow__hint">—</span>
              : <button className="upbtn upbtn--sm" onClick={askNotif}>{t('settings.notifications.enable')}</button>}
          </div>
        </div>
        {getConfig().features.push && <PushRow />}
        <ToggleRow icon="🔊" label={t('settings.notifications.sounds')} hint={t('settings.notifications.soundsHint')} prefKey="sound" />
        <ToggleRow icon="🙈" label={t('settings.notifications.hideJoins')} hint={t('settings.notifications.hideJoinsHint')} prefKey="hideJoinQuit" />
        <ToggleRow icon="⚙️" label={t('settings.notifications.hideModes')} hint={t('settings.notifications.hideModesHint')} prefKey="hideModes" />
        <ToggleRow icon="🚪" label={t('settings.notifications.confirmClose')} hint={t('settings.notifications.confirmCloseHint')} prefKey="confirmClose" />
        {getConfig().features.linkPreviews && (
          <ToggleRow icon="🔗" label={t('settings.notifications.linkPreviews')} hint={t('settings.notifications.linkPreviewsHint')} prefKey="linkPreviews" />
        )}
        <HighlightWordsRow />
        <AnalyticsRow />
      </div>
    </div>
  );
}
