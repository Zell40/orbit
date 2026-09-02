import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';

// About — the app's own identity card (version/build injected at build time +
// the project's open-source links). Orbit is the client; branding.* is the host.
// AGPL §13: these must be the sources of THIS deployment, not only upstream.
const ORBIT_SOURCE = 'https://github.com/Zell40/orbit';
const ORBIT_UPSTREAM = 'https://git.devtronic.pro/orbit/orbit';
const PLUGINS_SOURCE = 'https://github.com/Zell40/entrenous-orbit';

function hostPath(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function AboutSection() {
  const { t } = useTranslation();
  const cfg = getConfig();
  const buildDate = (() => { try { return new Date(__BUILD_TIME__).toLocaleDateString(); } catch { return ''; } })();
  const build = [buildDate, __GIT_COMMIT__].filter(Boolean).join(' · ') || '—';
  const rows: { label: string; value: ReactNode }[] = [
    { label: t('about.version'), value: __APP_VERSION__ },
    { label: t('about.build'), value: build },
    { label: t('about.license'), value: <a href={`${ORBIT_SOURCE}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">AGPL-3.0</a> },
    { label: t('about.source'), value: <a href={ORBIT_SOURCE} target="_blank" rel="noopener noreferrer">{hostPath(ORBIT_SOURCE)} ↗</a> },
    { label: t('about.plugins'), value: <a href={PLUGINS_SOURCE} target="_blank" rel="noopener noreferrer">{hostPath(PLUGINS_SOURCE)} ↗</a> },
    { label: t('about.upstream'), value: <a href={ORBIT_UPSTREAM} target="_blank" rel="noopener noreferrer">{hostPath(ORBIT_UPSTREAM)} ↗</a> },
    { label: t('about.project'), value: <a href={cfg.branding.projectUrl} target="_blank" rel="noopener noreferrer">{hostPath(cfg.branding.projectUrl)} ↗</a> },
    { label: t('about.running'), value: <a href={cfg.branding.url} target="_blank" rel="noopener noreferrer">{cfg.branding.name} ↗</a> },
    ...(cfg.branding.links || []).map((l) => ({
      label: l.label,
      value: <a href={l.url} target="_blank" rel="noopener noreferrer">{l.url.replace(/^https?:\/\//, '')} ↗</a>,
    })),
  ];
  return (
    <div className="scard">
      <div className="scard__body">
        <div className="about-hero">
          <span className="about-hero__mark"><img src={`${import.meta.env.BASE_URL}orbit-icon.svg`} alt="Orbit" width={44} height={44} /></span>
          <div className="about-hero__txt">
            <div className="about-hero__name">Orbit <span className="about-hero__ver">v{__APP_VERSION__}</span></div>
            <div className="about-hero__tag">{t('about.tagline')}</div>
          </div>
        </div>
        <dl className="srv-info">
          {rows.map((r) => (
            <div className="srv-row" key={r.label}>
              <dt className="srv-row__k">{r.label}</dt>
              <dd className="srv-row__v">{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="about-foot">{t('about.madeWith')}</div>
      </div>
    </div>
  );
}
