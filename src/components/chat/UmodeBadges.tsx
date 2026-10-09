import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { useActiveChat } from '@/core/networks';
import { advertisedUserModes } from '@/core/irc/mode-catalog';

function DeafChanBadge({ onDisable }: { onDisable: () => void }) {
  const { t } = useTranslation();
  const [flash, setFlash] = useState(true);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 5000);
    return () => window.clearTimeout(id);
  }, []);
  const show = flash || hover;
  return (
    <button
      type="button"
      className={`topbar__umode${show ? ' is-tip' : ''}`}
      title={t('topbar.deafChanTip')}
      aria-label={t('topbar.deafChan')}
      onClick={onDisable}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Icon name="deafChan" size={18} />
      {show && <span className="topbar__umode-tip" role="tooltip">{t('topbar.deafChanTip')}</span>}
    </button>
  );
}

/** Always-visible +D toggle; +d only when active (flash / click to clear). */
export function UmodeBadges() {
  const { t } = useTranslation();
  const umodes = useActiveChat((s) => s.umodes);
  const client = useActiveChat((s) => s.client);
  const um = umodes.replace(/^\+/, '');
  const deaf = um.includes('d');
  const privDeaf = um.includes('D');
  const advertised = advertisedUserModes(client?.server.isupport ?? {}, client?.server.userModes);
  const showPrivDeaf = !advertised.size || advertised.has('D');
  if (!deaf && !showPrivDeaf) return null;

  const tip = privDeaf ? t('topbar.deafPrivTip') : t('topbar.deafPrivEnableTip');

  return (
    <span className="topbar__umodes">
      {deaf && (
        <DeafChanBadge onDisable={() => client?.setUserModes('-d')} />
      )}
      {showPrivDeaf && (
        <button
          type="button"
          className={`topbar__search topbar__privdeaf topbar__hide-mobile${privDeaf ? ' is-on' : ''}`}
          title={tip}
          aria-label={t('topbar.deafPriv')}
          aria-pressed={privDeaf}
          onClick={() => client?.setUserModes(privDeaf ? '-D' : '+D')}
        >
          <Icon name="deafPriv" size={19} />
        </button>
      )}
    </span>
  );
}
