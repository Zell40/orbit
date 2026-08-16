import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { useActiveChat } from '@/core/networks';

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

const GUEST_DISMISS_KEY = 'orbit-guest-register-dismissed';

/** Centered CTA when the user is connected as a guest (no NickServ account). */
export function GuestRegisterPrompt() {
  const { t } = useTranslation();
  const status = useActiveChat((s) => s.status);
  const account = useActiveChat((s) => s.account);
  const nick = useActiveChat((s) => s.nick);
  const setModal = useActiveChat((s) => s.setModal);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(GUEST_DISMISS_KEY) === '1'; } catch { return false; }
  });

  // Wait a beat after IRC registration so a SASL/handoff login can fill `account`
  // before we flash the guest prompt.
  useEffect(() => {
    if (status !== 'registered' || account) { setReady(false); return; }
    const id = window.setTimeout(() => setReady(true), 1600);
    return () => clearTimeout(id);
  }, [status, account]);

  if (!ready || dismissed || account || status !== 'registered') return null;

  const registerUrl = getConfig().branding.registerUrl
    || 'https://www.reseau-entrenous.fr/register/';

  const dismiss = () => {
    try { sessionStorage.setItem(GUEST_DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="guestprompt" role="dialog" aria-labelledby="guestprompt-title" aria-describedby="guestprompt-desc">
      <button type="button" className="guestprompt__x" onClick={dismiss} aria-label={t('modals.closeButton')}>×</button>
      <div className="guestprompt__ic" aria-hidden>🔐</div>
      <h2 id="guestprompt-title" className="guestprompt__title">{t('banners.guestTitle')}</h2>
      <p id="guestprompt-desc" className="guestprompt__txt">
        {t('banners.guestBody', { nick: nick || '…' })}
      </p>
      <div className="guestprompt__actions">
        <a className="guestprompt__primary" href={registerUrl} target="_blank" rel="noopener noreferrer"
          onClick={dismiss}>
          {t('banners.guestCreateProfile')}
        </a>
        <button type="button" className="guestprompt__secondary" onClick={() => { dismiss(); setModal('settings'); }}>
          {t('banners.guestLogin')}
        </button>
      </div>
      <button type="button" className="guestprompt__later" onClick={dismiss}>{t('banners.guestLater')}</button>
    </div>
  );
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
    const timer = setTimeout(dismiss, 12000); // auto-dismiss after a while
    return () => clearTimeout(timer);
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
