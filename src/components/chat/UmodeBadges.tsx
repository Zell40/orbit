import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { useActiveChat } from '@/core/networks';

function DeafIcon({ letter, hint, onDisable }: { letter: 'd' | 'D'; hint: string; onDisable: () => void }) {
  const { t } = useTranslation();
  const [flash, setFlash] = useState(true);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 5000);
    return () => window.clearTimeout(id);
  }, []);
  const show = flash || hover;
  const label = letter === 'd' ? t('topbar.deafChan') : t('topbar.deafPriv');
  return (
    <button
      type="button"
      className={`topbar__umode${show ? ' is-tip' : ''}`}
      title={hint}
      aria-label={label}
      onClick={onDisable}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Icon name={letter === 'd' ? 'deafChan' : 'deafPriv'} size={18} />
      {show && <span className="topbar__umode-tip" role="tooltip">{hint}</span>}
    </button>
  );
}

/** +d / +D badges in the header: flash 5s on enable, hover to reread, click to unset. */
export function UmodeBadges() {
  const { t } = useTranslation();
  const umodes = useActiveChat((s) => s.umodes);
  const client = useActiveChat((s) => s.client);
  const um = umodes.replace(/^\+/, '');
  const deaf = um.includes('d');
  const privDeaf = um.includes('D');
  if (!deaf && !privDeaf) return null;
  return (
    <span className="topbar__umodes">
      {deaf && (
        <DeafIcon
          letter="d"
          hint={t('topbar.deafChanTip')}
          onDisable={() => client?.setUserModes('-d')}
        />
      )}
      {privDeaf && (
        <DeafIcon
          letter="D"
          hint={t('topbar.deafPrivTip')}
          onDisable={() => client?.setUserModes('-D')}
        />
      )}
    </span>
  );
}
