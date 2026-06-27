import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat } from '../../store';
import { isPushSupported, pushEnabledPref, enablePush } from '../../services/push';

const PUSH_NUDGE_KEY = 'tchatou-pushnudge';

// A gentle, one-time invitation to turn on Web Push — shown a little after the
// user has settled in, never if they've already decided (granted/denied/pref) or
// dismissed it. Tapping "Activer" runs the normal subscribe flow (which prompts).
export function PushNudge() {
  const { t } = useTranslation();
  const status = useChat((s) => s.status);
  const client = useChat((s) => s.client);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'registered' || !client?.vapid) return;
    if (!isPushSupported() || pushEnabledPref()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    try { if (localStorage.getItem(PUSH_NUDGE_KEY) === 'off') return; } catch { /* ignore */ }
    const id = setTimeout(() => setShow(true), 25000); // let them read a bit first
    return () => clearTimeout(id);
  }, [status, client]);

  if (!show) return null;

  const close = () => {
    try { localStorage.setItem(PUSH_NUDGE_KEY, 'off'); } catch { /* ignore */ }
    setShow(false);
  };
  const enable = async () => {
    if (!client) return;
    setBusy(true);
    try { await enablePush(client); } catch { /* permission denied / unsupported */ }
    close();
  };

  return (
    <div className="pushnudge" role="dialog" aria-label={t('banners.pushTitle', { defaultValue: 'Notifications' })}>
      <span className="pushnudge__ic" aria-hidden>🔔</span>
      <div className="pushnudge__body">
        <strong>{t('banners.pushTitle', { defaultValue: 'Ne rate aucun message' })}</strong>
        <span className="pushnudge__sub">{t('banners.pushSub', { defaultValue: 'Sois prévenu·e quand on te parle, même l’app fermée.' })}</span>
      </div>
      <button className="pushnudge__go" onClick={enable} disabled={busy}>
        {busy ? '…' : t('banners.pushEnable', { defaultValue: 'Activer' })}
      </button>
      <button className="pushnudge__close" onClick={close} aria-label={t('profile.close')}>×</button>
    </div>
  );
}
export function ReconnectBanner() {
  const { t } = useTranslation();
  const status = useChat((s) => s.status);
  const reconnectIn = useChat((s) => s.reconnectIn);
  if (status === 'registered') return null;
  const label = status === 'connecting' ? t('banners.reconnecting')
    : reconnectIn > 0 ? t('banners.lostRetry', { n: reconnectIn })
    : t('banners.lostReconnecting');
  return <div className="reconnect-banner"><span className="reconnect-banner__dot" /> {label}</div>;
}

// Shown when the server kicks or bans us from a salon — the salon is already
// closed and gone from the list at this point; this is the heads-up. Rejoining
// is only offered for a kick (a ban would just refuse the join again).
export function KickToast() {
  const { t } = useTranslation();
  const kicked = useChat((s) => s.kicked);
  const dismiss = useChat((s) => s.dismissKick);
  const rejoin = useChat((s) => s.rejoinKicked);
  useEffect(() => {
    if (!kicked) return;
    const t = setTimeout(dismiss, 12000); // auto-dismiss after a while
    return () => clearTimeout(t);
  }, [kicked, dismiss]);
  if (!kicked) return null;
  const { kind, channel, by, reason } = kicked;
  const title =
    kind === 'kick' ? t('banners.kickedTitle', { channel })
    : kind === 'ban' ? t('banners.bannedTitle', { channel })
    : t('banners.cantWriteTitle', { channel });
  const sub =
    kind === 'kick' ? t('banners.kickedBy', { by }) + (reason ? ` — « ${reason} »` : '')
    : kind === 'ban' ? t('banners.banRefused')
    : t('banners.bannedOrModerated');
  const icon = kind === 'kick' ? '👢' : '⛔';
  return (
    <div className="kicktoast" role="alert">
      <span className="kicktoast__ic">{icon}</span>
      <div className="kicktoast__body">
        <strong>{title}</strong>
        <span className="kicktoast__sub">{sub}</span>
      </div>
      {kind === 'kick' && <button className="kicktoast__rejoin" onClick={rejoin}>{t('banners.rejoin')}</button>}
      <button className="kicktoast__close" onClick={dismiss} aria-label={t('profile.close')}>×</button>
    </div>
  );
}

