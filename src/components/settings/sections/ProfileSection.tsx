import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { getConfig } from '@/core/config';
import { Avatar } from '@/components/Avatar';
import { Modal } from '@/components/modals/Modal';
import { endSession } from '@/core/resume';
import { findWhoisKey } from '@/core/store/helpers';
import { genderFromLabel, parseProfileGecos } from '@/lib/profile-gecos';
import { fetchWpProfile, type WpProfile } from '@/platform/profile-gecos';
import { ChangeNickField } from '../ChangeNickField';

function genderText(raw: string | undefined, t: (k: string) => string): string {
  if (!raw) return '';
  const kind = genderFromLabel(raw);
  if (kind === 'm') return t('profile.aslMale');
  if (kind === 'f') return t('profile.aslFemale');
  if (kind === 'x') return t('profile.aslOther');
  return raw;
}

function formatRegistered(raw: string | undefined, locale: string): string {
  if (!raw) return '';
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="srv-row">
      <dt className="srv-row__k">{label}</dt>
      <dd className="srv-row__v">{value}</dd>
    </div>
  );
}

export function ProfileSection() {
  const { t, i18n } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const nick = useActiveChat((s) => s.nick);
  const account = useActiveChat((s) => s.account);
  const whois = useActiveChat((s) => s.whois);
  const [leaving, setLeaving] = useState(false);
  const [wp, setWp] = useState<WpProfile | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!account) {
      setWp(undefined);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchWpProfile(account).then((p) => {
      if (!cancelled) setWp(p);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [account]);

  const whoKey = findWhoisKey(whois, nick);
  const gecos = parseProfileGecos(whoKey ? whois[whoKey]?.realname : undefined);
  const age = wp?.age || gecos?.age || '';
  const gender = genderText(wp?.gender, t) || gecos?.genderLabel || '';
  const city = wp?.city || gecos?.city || '';
  const displayName = wp?.displayName || '';
  const login = wp?.login || account || '';
  const registered = formatRegistered(wp?.registered, i18n.language);
  const branding = getConfig().branding;
  const identityUrl = (branding.identityUrl || '').trim();
  const profileUrl = wp?.profileUrl || '';
  const hasProfileBits = !!(displayName || age || gender || city);
  const dash = '—';

  return (
    <>
      <div className="scard">
        <div className="scard__body">
          <div className="srow">
            <span className="srow__ic" style={{ background: 'transparent', padding: 0 }}>
              <Avatar nick={nick} size={42} account={account} url={wp?.avatar} />
            </span>
            <div className="srow__txt">
              <div className="srow__label">{displayName || nick}</div>
              <div className="srow__hint">
                {account
                  ? <>{t('settings.account.loggedIn')} · <strong style={{ color: 'var(--accent-d)' }}>@{account}</strong></>
                  : t('settings.account.guestNotConnected')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {account ? (
        <>
          <div className="scard">
            <div className="scard__h">{t('settings.wpProfile.title')}</div>
            <div className="scard__body">
              {loading && !wp ? (
                <p className="srow__hint" style={{ margin: 0, padding: '.7rem .95rem' }}>{t('settings.wpProfile.loading')}</p>
              ) : !hasProfileBits && wp?.exists === false ? (
                <p className="srow__hint" style={{ margin: 0, padding: '.7rem .95rem' }}>{t('settings.wpProfile.missing')}</p>
              ) : (
                <dl className="srv-info">
                  <InfoRow label={t('settings.wpProfile.displayName')} value={displayName || dash} />
                  <InfoRow label={t('profile.aslColAge')} value={age ? t('settings.wpProfile.ageValue', { age }) : dash} />
                  <InfoRow label={t('settings.wpProfile.gender')} value={gender || dash} />
                  <InfoRow label={t('profile.aslColCity')} value={city || dash} />
                </dl>
              )}
            </div>
          </div>

          <div className="scard">
            <div className="scard__h">{t('settings.wpProfile.wpTitle')}</div>
            <div className="scard__body">
              <dl className="srv-info">
                <InfoRow label={t('settings.wpProfile.login')} value={login || dash} />
                <InfoRow label={t('settings.wpProfile.site')} value="reseau-entrenous.fr" />
                {registered ? <InfoRow label={t('settings.wpProfile.registered')} value={registered} /> : null}
              </dl>
              {(profileUrl || identityUrl) && (
                <div className="sprof-links">
                  {profileUrl ? (
                    <a className="upbtn" href={profileUrl} target="_blank" rel="noopener noreferrer">
                      {t('settings.wpProfile.openWeb')}
                    </a>
                  ) : null}
                  {identityUrl ? (
                    <a className="upbtn upbtn--primary" href={identityUrl} target="_blank" rel="noopener noreferrer">
                      {t('settings.wpProfile.editWeb')}
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="scard">
          <div className="scard__body">
            <div className="sfield">
              <div className="sfield__intro">{t('settings.wpProfile.guest')}</div>
            </div>
          </div>
        </div>
      )}

      {!account && <ChangeNickField hint={t('settings.account.nickHint')} />}

      <button className="set-leave" onClick={() => setLeaving(true)}>{t('settings.account.leaveChat')}</button>

      {leaving && (
        <Modal title={t('settings.account.leaveChat')} onClose={() => setLeaving(false)}>
          <p className="modal__sub">{t('settings.account.leaveConfirm')}</p>
          <div className="modal__actions">
            <button className="upbtn" onClick={() => setLeaving(false)}>{t('profile.cancel')}</button>
            <button className="upbtn upbtn--danger" onClick={() => {
              void endSession().then(() => {
                client?.disconnect();
                location.reload();
              });
            }}>{t('settings.account.leaveChat')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
