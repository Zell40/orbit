import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { useActiveChat } from '@/core/networks';
import { ProfileSection } from './sections/ProfileSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { AccountSection } from './sections/AccountSection';
import { ServerSection } from './sections/ServerSection';
import { CapabilitiesSection } from './sections/CapabilitiesSection';
import { AboutSection } from './sections/AboutSection';
import { ModesSection } from './sections/ModesSection';

// Labels & descriptions are resolved via i18n (SEC_KEY / SEC_DESC).
const SETTINGS_SECTIONS = [
  { id: 'profil',    icon: '👤' },
  { id: 'modes',     icon: '🛡️' },
  { id: 'apparence', icon: '🎨' },
  { id: 'notifs',    icon: '🔔' },
  { id: 'compte',    icon: '🔑' },
  { id: 'server',    icon: '🖥️' },
  { id: 'ircv3',     icon: '🔌' },
  { id: 'about',     icon: 'ℹ️' },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

const SEC_KEY: Record<SettingsSection, string> = {
  profil: 'profile.openProfile',
  modes: 'settings.sections.modes',
  apparence: 'settings.sections.appearance',
  notifs: 'settings.sections.notifications',
  compte: 'settings.sections.account',
  server: 'caps.server.title',
  ircv3: 'caps.navLabel',
  about: 'about.navLabel',
};

// IRCv3 has no official drop-in icon — a small chat-bubble "v3" mark (self-
// contained fill so it reads on the white tile and the green active tile alike).
function Ircv3Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ircv3g" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3d8bff" />
          <stop offset="1" stopColor="#1e4fd6" />
        </linearGradient>
      </defs>
      <path d="M6 3h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-7l-4 3.4V17H6a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" fill="url(#ircv3g)" />
      <text x="12" y="13.6" textAnchor="middle" fontSize="8.5" fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif" fill="#fff">v3</text>
    </svg>
  );
}
// Most sections use an emoji; IRCv3 gets the inline mark above.
function SecIcon({ id, icon }: { id: SettingsSection; icon: string }) {
  return id === 'ircv3' ? <Ircv3Mark /> : <>{icon}</>;
}

const SEC_DESC: Record<SettingsSection, string> = {
  profil: 'settings.sectionDesc.profile',
  modes: 'settings.sectionDesc.modes',
  apparence: 'settings.sectionDesc.appearance',
  notifs: 'settings.sectionDesc.notifications',
  compte: 'settings.sectionDesc.account',
  server: 'caps.server.navDesc',
  ircv3: 'caps.navDesc',
  about: 'about.navDesc',
};

export function SettingsModal() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const account = useActiveChat((s) => s.account);
  // Stable-ref selector (zustand v5 loops on a new array each render); filter in body.
  const pluginUi = usePluginRegistry((s) => s.ui);
  const pluginSections = pluginUi.filter((u) => u.slot === 'settings_section');
  const [section, setSection] = useState<string>('profil');
  const [drilled, setDrilled] = useState(false); // mobile: are we inside a section?
  const close = () => setModal('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curFixed = SETTINGS_SECTIONS.find((s) => s.id === section);
  const curPlugin = pluginSections.find((p) => p.id === section);

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className={`settings ${drilled ? 'is-drilled' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* left rail (desktop) / section list (mobile) */}
        <aside className="settings__nav">
          <div className="settings__brand">
            <span className="settings__brand-title">{t('settings.title')}</span>
            <button className="settings__close" onClick={close} aria-label={t('modals.closeButton')}>✕</button>
          </div>
          <nav className="settings__navlist">
            {SETTINGS_SECTIONS.map((s) => (
              <button key={s.id} className={`settings__navitem ${section === s.id ? 'is-on' : ''}`}
                onClick={() => { setSection(s.id); setDrilled(true); }}>
                <span className="settings__navic" aria-hidden><SecIcon id={s.id} icon={s.icon} /></span>
                <span className="settings__navtxt">
                  <span className="settings__navlabel">{t(SEC_KEY[s.id])}</span>
                  <span className="settings__navdesc">{s.id === 'compte' && account ? `@${account}` : t(SEC_DESC[s.id])}</span>
                </span>
                <span className="settings__navchev" aria-hidden>›</span>
              </button>
            ))}
            {pluginSections.map((ps) => (
              <button key={ps.id} className={`settings__navitem ${section === ps.id ? 'is-on' : ''}`}
                onClick={() => { setSection(ps.id); setDrilled(true); }}>
                <span className="settings__navic" aria-hidden>{ps.meta?.icon ?? '🧩'}</span>
                <span className="settings__navtxt">
                  <span className="settings__navlabel">{ps.meta?.label ?? ps.plugin}</span>
                  <span className="settings__navdesc">{ps.plugin}</span>
                </span>
                <span className="settings__navchev" aria-hidden>›</span>
              </button>
            ))}
          </nav>
          <a className="settings__about" href={getConfig().branding.projectUrl} target="_blank" rel="noopener noreferrer">
            <span className="settings__about-mark" aria-hidden>◐</span>
            <span className="settings__about-txt">
              <span className="settings__about-name">{t('settings.misc.poweredBy')}</span>
              <span className="settings__about-sub">{t('settings.misc.aboutSub')}</span>
            </span>
          </a>
        </aside>

        {/* content pane */}
        <section className="settings__pane">
          <header className="settings__top">
            <button className="settings__back" onClick={() => setDrilled(false)} aria-label={t('settings.misc.back')}>‹</button>
            <span className="settings__top-ic" aria-hidden>{curFixed ? <SecIcon id={curFixed.id} icon={curFixed.icon} /> : (curPlugin?.meta?.icon ?? '🧩')}</span>
            <h3 className="settings__top-title">{curFixed ? t(SEC_KEY[curFixed.id]) : (curPlugin?.meta?.label ?? '')}</h3>
            <button className="settings__close settings__close--pane" onClick={close} aria-label={t('modals.closeButton')}>✕</button>
          </header>
          <div className="settings__content" key={section}>
            {section === 'profil' && <ProfileSection />}
            {section === 'modes' && <ModesSection />}
            {section === 'apparence' && <AppearanceSection />}
            {section === 'notifs' && <NotificationsSection />}
            {section === 'compte' && <AccountSection />}
            {section === 'server' && <ServerSection />}
            {section === 'ircv3' && <CapabilitiesSection />}
            {section === 'about' && <AboutSection />}
            {curPlugin && <PluginBoundary render={curPlugin.render} label="settings_section" />}
          </div>
        </section>
      </div>
    </div>
  );
}
