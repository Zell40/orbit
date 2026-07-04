import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '../../core/networks';

export function ReconnectBanner() {
  const { t } = useTranslation();
  const status = useActiveChat((s) => s.status);
  const reconnectIn = useActiveChat((s) => s.reconnectIn);
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
  const kicked = useActiveChat((s) => s.kicked);
  const dismiss = useActiveChat((s) => s.dismissKick);
  const rejoin = useActiveChat((s) => s.rejoinKicked);
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

