import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { activeStore, useActiveChat } from '@/core/networks';
import { matchingVisualGames, usePluginRegistry } from '@/modules/registry';
import { saveDirectReconnect, siteLoginHref, armLeaveWithoutPrompt } from '@/core/direct-reconnect';
import { clearResume } from '@/core/resume';

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
  const viaBouncer = useActiveChat((s) => s.viaBouncer);
  const nick = useActiveChat((s) => s.nick);
  const setModal = useActiveChat((s) => s.setModal);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(GUEST_DISMISS_KEY) === '1'; } catch { return false; }
  });

  // Wait a beat after IRC registration so a SASL/handoff login can fill `account`
  // before we flash the guest prompt.
  useEffect(() => {
    if (status !== 'registered' || account || viaBouncer) { setReady(false); return; }
    const id = window.setTimeout(() => setReady(true), 1600);
    return () => clearTimeout(id);
  }, [status, account, viaBouncer]);

  if (!ready || dismissed || account || viaBouncer || status !== 'registered') return null;

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
    if (!kicked || kicked.kind === 'moderated') return;
    const timer = setTimeout(dismiss, 12000); // auto-dismiss after a while
    return () => clearTimeout(timer);
  }, [kicked, dismiss]);
  // Moderated (+m) uses ModeratedModal instead of this toast.
  if (!kicked || kicked.kind === 'moderated') return null;
  const { kind, channel, by, reason } = kicked;
  const title =
    kind === 'kick' ? t('banners.kickedTitle', { channel })
    : kind === 'ban' ? t('banners.bannedTitle', { channel })
    : t('banners.restrictedTitle', { channel });
  const sub =
    kind === 'kick' ? t('banners.kickedBy', { by }) + (reason ? ` — « ${reason} »` : '')
    : kind === 'ban' ? t('banners.banRefused')
    : t('banners.restrictedBody');
  const tone = kind === 'mute' ? 'restricted' : kind;
  return (
    <div className={`kicktoast kicktoast--${tone}`} role="alert">
      <span className="kicktoast__badge" aria-hidden>
        {kind === 'kick' ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h7l2-3 3 1 4-2v8H4z" /><path d="M9 14V8a2 2 0 0 1 2-2h1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>
        )}
      </span>
      <div className="kicktoast__body">
        <strong>{title}</strong>
        <span className="kicktoast__sub">{sub}</span>
      </div>
      {kind === 'kick' && <button className="kicktoast__rejoin" onClick={rejoin}>{t('banners.rejoin')}</button>}
      <button className="kicktoast__close" onClick={dismiss} aria-label={t('profile.close')}>×</button>
    </div>
  );
}

/** Centered popup when NickServ sends an important notice (nick change, ghost, etc.). */
export function NickServAlert() {
  const { t } = useTranslation();
  const alert = useActiveChat((s) => s.nickServAlert);
  const dismiss = useActiveChat((s) => s.dismissNickServAlert);
  const openStatus = useActiveChat((s) => s.openStatusFromNickServAlert);
  if (!alert) return null;
  return (
    <div className="servalert" role="alertdialog" aria-labelledby="servalert-title" aria-describedby="servalert-desc">
      <button type="button" className="servalert__x" onClick={dismiss} aria-label={t('modals.closeButton')}>×</button>
      <div className="servalert__ic" aria-hidden>✉️</div>
      <h2 id="servalert-title" className="servalert__title">{t('banners.nickServTitle', { from: alert.from })}</h2>
      <p id="servalert-desc" className="servalert__txt">{alert.text}</p>
      <div className="servalert__actions">
        <button type="button" className="servalert__primary" onClick={openStatus}>{t('banners.nickServViewStatus')}</button>
        <button type="button" className="servalert__secondary" onClick={dismiss}>{t('banners.nickServDismiss')}</button>
      </div>
    </div>
  );
}

const BOUNCER_GAME_DISMISS = 'orbit-bouncer-game-dismiss:';

/** In-channel notice: TAGMSG game HUDs don't work through ZNC. */
export function BouncerVisualBanner() {
  const { t } = useTranslation();
  const viaBouncer = useActiveChat((s) => s.viaBouncer);
  const status = useActiveChat((s) => s.status);
  const active = useActiveChat((s) => s.active);
  const nick = useActiveChat((s) => s.nick);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const channelName = useActiveChat((s) => s.buffers[s.active]?.name || s.active);
  const games = usePluginRegistry((s) => s.visualGames);
  const [dismissed, setDismissed] = useState(false);

  const matched = viaBouncer && isChannel ? matchingVisualGames(games, channelName) : [];
  const labels = [...new Set(matched.map((g) => g.label))];
  const game = labels.join(' · ');

  useEffect(() => {
    if (!active) { setDismissed(false); return; }
    try { setDismissed(sessionStorage.getItem(BOUNCER_GAME_DISMISS + active) === '1'); }
    catch { setDismissed(false); }
  }, [active]);

  if (!viaBouncer || status !== 'registered' || !matched.length || dismissed) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(BOUNCER_GAME_DISMISS + active, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const reconnectDirect = () => {
    const s = activeStore().getState();
    const channels = s.order
      .filter((k) => s.buffers[k]?.isChannel && s.buffers[k]?.joined)
      .map((k) => s.buffers[k].name);
    if (active && !channels.some((c) => c.toLowerCase() === active.toLowerCase())) {
      channels.unshift(s.buffers[active]?.name || active);
    }
    const chans = channels.length ? channels : [active];
    clearResume();
    const loginUrl = (getConfig().branding.loginUrl || '').trim();
    if (loginUrl) {
      armLeaveWithoutPrompt();
      s.client?.disconnect();
      location.assign(siteLoginHref(loginUrl, { nick, channels: chans }));
      return;
    }
    saveDirectReconnect(nick, chans);
    s.client?.disconnect();
    location.reload();
  };

  return (
    <div className="bouncer-game" role="status">
      <div className="bouncer-game__txt">
        <strong className="bouncer-game__title">{t('banners.bouncerGameTitle')}</strong>
        <p className="bouncer-game__body">{t('banners.bouncerGameBody', { game: game || '…' })}</p>
      </div>
      <div className="bouncer-game__actions">
        <button type="button" className="bouncer-game__go" onClick={reconnectDirect}>
          {t('banners.bouncerGameReconnect')}
        </button>
        <button type="button" className="bouncer-game__later" onClick={dismiss}>
          {t('banners.bouncerGameLater')}
        </button>
      </div>
    </div>
  );
}
