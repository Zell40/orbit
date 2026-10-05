import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { useChat } from '@/core/store';
import { usePhoneUi } from '@/ui/phone-ui';
import {
  enablePush,
  isPushSupported,
  isStandalonePwa,
  pushEnabledPref,
} from '@/platform/push';

const SEEN_KEY = 'orbit-push-prompt';

function promptSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}

function markPromptSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

/** First-visit soft prompt on phone: offer Web Push after identify — never auto-enable. */
export function PushPromptBanner() {
  const { t } = useTranslation();
  const phone = usePhoneUi();
  const status = useChat((s) => s.status);
  const account = useChat((s) => s.account);
  const client = useChat((s) => s.client);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (status !== 'registered' || !account) {
      setReady(false);
      return;
    }
    const tmr = window.setTimeout(() => setReady(true), 4500);
    return () => window.clearTimeout(tmr);
  }, [status, account]);

  const cfg = getConfig();
  const show = !gone
    && ready
    && phone
    && !!cfg.features.push
    && !!account
    && status === 'registered'
    && isPushSupported()
    && !!client?.server.vapid
    && !pushEnabledPref()
    && !promptSeen();

  if (!show || !client || !account) return null;

  const dismiss = () => {
    markPromptSeen();
    setGone(true);
  };

  const activate = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    const r = await enablePush(client, account);
    setBusy(false);
    if (r.ok) {
      markPromptSeen();
      setGone(true);
      return;
    }
    setErr(
      r.reason === 'denied'
        ? t(isStandalonePwa() ? 'settings.notifications.pushDeniedPwa' : 'settings.notifications.pushDenied')
        : r.reason === 'dismissed'
          ? t('settings.notifications.pushDismissed')
          : t('settings.notifications.pushFailed'),
    );
  };

  return (
    <div className="pushprompt" role="dialog" aria-labelledby="pushprompt-title">
      <p className="pushprompt__txt">
        <strong id="pushprompt-title">{t('banners.pushPromptTitle')}</strong>
        {' '}
        {t('banners.pushPromptBody')}
      </p>
      {err ? <p className="pushprompt__err">{err}</p> : null}
      <div className="pushprompt__acts">
        <button type="button" className="pushprompt__later" onClick={dismiss} disabled={busy}>
          {t('banners.pushPromptLater')}
        </button>
        <button type="button" className="pushprompt__go" onClick={() => void activate()} disabled={busy}>
          {t('banners.pushPromptEnable')}
        </button>
      </div>
    </div>
  );
}
