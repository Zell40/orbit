import { useTranslation } from 'react-i18next';
import { getConfig } from '../core/config';
import type { BootPhase } from '../lib/boot-ready';
import type { BootDetail } from '../ui/useBootSplash';
import { usePhoneUi } from '../ui/phone-ui';

export function BootSplash({ progress, phase, fading, peek, detail }: {
  progress: number;
  phase: BootPhase;
  fading: boolean;
  peek?: boolean;
  detail: BootDetail;
}) {
  const { t } = useTranslation();
  const cfg = getConfig();
  const phone = usePhoneUi();
  const splashBg = cfg.branding.splashBg?.trim() || '';
  const splashInk = cfg.branding.splashInk?.trim() || (splashBg ? '#ffffff' : '');
  const branded = !!splashBg && !peek;
  const style = branded
    ? { background: splashBg, ['--splash-ink' as string]: splashInk || '#ffffff' }
    : undefined;
  const pct = Math.max(0, Math.min(100, progress));

  let txt = t('connect.connecting');
  if (phase === 'plugins') {
    txt = detail.pluginTotal
      ? t('connect.loadingPlugins', { ok: detail.pluginOk, total: detail.pluginTotal })
      : t('connect.preparingUi');
  } else if (phase === 'rooms') {
    txt = t('connect.joiningRooms', { ok: detail.roomOk, total: detail.roomTotal || 1 });
  } else if (phase === 'display') {
    txt = t('connect.preparingUi');
  } else if (phase === 'almost') {
    txt = t('connect.almostReady');
  }

  return (
    <div
      className={`splash${peek ? ' splash--peek' : ''}${phone ? ' splash--app' : ''}${branded ? ' splash--brand' : ''}${fading ? ' is-out' : ''}`}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy={!fading}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="splash__hud">
        <span className="splash__mark" aria-hidden="true">
          <img src={cfg.branding.icon} alt="" />
        </span>
        <p className="splash__name">{cfg.branding.name}</p>
        <p className="splash__txt">{txt}</p>
        <div className="splash__meter">
          <div className="splash__bar" aria-hidden="true">
            <i style={{ width: `${Math.max(6, pct)}%` }} />
          </div>
          <span className="splash__pct">{Math.round(pct)}%</span>
        </div>
      </div>
    </div>
  );
}
