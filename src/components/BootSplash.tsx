import { useTranslation } from 'react-i18next';
import { getConfig } from '../core/config';
import type { BootPhase } from '../lib/boot-ready';

const PHASE_KEY: Record<BootPhase, string> = {
  connecting: 'connect.connecting',
  plugins: 'connect.loadingPlugins',
  rooms: 'connect.joiningRooms',
  almost: 'connect.almostReady',
};

export function BootSplash({ progress, phase, fading }: {
  progress: number;
  phase: BootPhase;
  fading: boolean;
}) {
  const { t } = useTranslation();
  const cfg = getConfig();
  return (
    <div className={`splash${fading ? ' is-out' : ''}`} role="status" aria-live="polite" aria-busy={!fading}>
      <span className="splash__mark"><img src={cfg.branding.icon} alt="" /></span>
      <p className="splash__txt">{t(PHASE_KEY[phase])}</p>
      <div className="splash__bar" aria-hidden="true">
        <i style={{ width: `${Math.max(6, Math.min(100, progress))}%` }} />
      </div>
    </div>
  );
}
