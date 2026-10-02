import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '../core/config';
import type { BootPhase } from '../lib/boot-ready';
import { usePhoneUi } from '../ui/phone-ui';

const PHASE_KEY: Record<BootPhase, string> = {
  connecting: 'connect.connecting',
  plugins: 'connect.loadingPlugins',
  rooms: 'connect.joiningRooms',
  display: 'connect.preparingUi',
  almost: 'connect.almostReady',
};

declare global {
  interface Window {
    __orbitDismissBoot?: () => void;
  }
}

export function BootSplash({ progress, phase, fading, peek }: {
  progress: number;
  phase: BootPhase;
  fading: boolean;
  peek?: boolean;
}) {
  const { t } = useTranslation();
  const cfg = getConfig();
  const phone = usePhoneUi();
  const splashBg = cfg.branding.splashBg?.trim() || '';
  const splashInk = cfg.branding.splashInk?.trim() || (splashBg ? '#ffffff' : '');
  const branded = phone && !!splashBg && !peek;
  const style = branded
    ? { background: splashBg, ['--splash-ink' as string]: splashInk || '#ffffff' }
    : undefined;

  // React splash is on screen: drop the pre-React #orbit-boot plate (same look).
  useEffect(() => {
    window.__orbitDismissBoot?.();
  }, []);

  return (
    <div
      className={`splash${peek ? ' splash--peek' : ''}${phone ? ' splash--app' : ''}${branded ? ' splash--brand' : ''}${fading ? ' is-out' : ''}`}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy={!fading}
    >
      <div className="splash__hud">
        <span className="splash__mark"><img src={cfg.branding.icon} alt="" /></span>
        {phone ? <p className="splash__name">{cfg.branding.name}</p> : null}
        <p className="splash__txt">{t(PHASE_KEY[phase])}</p>
        <div className="splash__bar" aria-hidden="true">
          <i style={{ width: `${Math.max(6, Math.min(100, progress))}%` }} />
        </div>
      </div>
    </div>
  );
}
