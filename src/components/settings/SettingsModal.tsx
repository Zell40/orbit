import { useState, useEffect, useRef, type ReactNode } from 'react';
import { escapeHtml } from '../../lib/escape';
import { useTranslation } from 'react-i18next';
import { LANGS, setLang, getLang } from '../../core/i18n';

import { getConfig } from '../../core/config';
import { getTheme, setTheme, usePluginThemes, type Theme } from '../../themes';
import { isPushSupported, pushEnabledPref, enablePush, disablePush } from '../../platform/push';
import { CAP_INFO } from '../../core/irc/cap-info';
import { usePluginRegistry } from '../../modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { Avatar } from '../Avatar';
import { Turnstile } from '../Turnstile';
import { useActiveChat, activeStore } from '../../core/networks';

// Labels & descriptions are resolved via i18n (SEC_KEY / SEC_DESC).
const SETTINGS_SECTIONS = [
  { id: 'profil',    icon: '👤' },
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
            {section === 'apparence' && <AppearanceSection />}
            {section === 'notifs' && <NotificationsSection />}
            {section === 'compte' && <LoginTab />}
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

// One toggle row: icon · label/hint · switch.
function PushRow() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const supported = isPushSupported();
  const [on, setOn] = useState(pushEnabledPref());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hasVapid = !!client?.vapid;

  async function toggle() {
    if (!client || busy) return;
    setBusy(true); setErr('');
    if (on) {
      await disablePush(client);
      setOn(false);
    } else {
      const r = await enablePush(client);
      if (r.ok) setOn(true);
      else setErr(r.reason === 'denied' ? t('settings.notifications.pushDenied') : r.reason === 'no-vapid' ? t('settings.notifications.pushUnavailable') : t('settings.notifications.pushFailed'));
    }
    setBusy(false);
  }

  const hint = !supported ? t('settings.notifications.pushUnsupported')
    : !hasVapid ? t('settings.notifications.pushUnavailable')
    : err ? err
    : on ? t('settings.notifications.pushActive')
    : t('settings.notifications.pushHint');

  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>📲</span>
      <div className="srow__txt">
        <div className="srow__label">{t('settings.notifications.pushLabel')}</div>
        <div className="srow__hint" style={err ? { color: 'var(--danger, #d33)' } : undefined}>{hint}</div>
      </div>
      {supported && hasVapid
        ? <button className={`switch ${on ? 'is-on' : ''} ${busy ? 'is-busy' : ''}`} role="switch" aria-checked={on}
            aria-label={t('settings.notifications.pushLabel')} disabled={busy} onClick={toggle}><span className="switch__dot" /></button>
        : <span className="srow__hint">—</span>}
    </div>
  );
}

function ToggleRow({ icon, label, hint, prefKey }: { icon: string; label: string; hint?: string; prefKey: 'sound' | 'hideJoinQuit' | 'compact' | 'linkPreviews' | 'hoverActions' }) {
  const value = useActiveChat((s) => s.prefs[prefKey]);
  const setPref = useActiveChat((s) => s.setPref);
  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>{icon}</span>
      <div className="srow__txt">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      <button className={`switch ${value ? 'is-on' : ''}`} role="switch" aria-checked={value}
        aria-label={label} onClick={() => setPref(prefKey, !value)}><span className="switch__dot" /></button>
    </div>
  );
}

function HighlightWordsRow() {
  const { t } = useTranslation();
  const words = useActiveChat((s) => s.highlightWords);
  const setWords = useActiveChat((s) => s.setHighlightWords);
  const [val, setVal] = useState(words.join(', '));
  const save = () => setWords(val.split(',').map((w) => w.trim()).filter(Boolean));
  return (
    <div className="sfield">
      <label className="sfield__label">🔆 {t('settings.notifications.highlightLabel')}</label>
      <div className="sfield__row">
        <input className="modal__input" value={val} placeholder={t('settings.notifications.highlightPlaceholder')}
          onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <div className="srow__hint" style={{ marginTop: '.3rem' }}>{t('settings.notifications.highlightHint')}</div>
    </div>
  );
}

function ProfileSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const nick = useActiveChat((s) => s.nick);
  const account = useActiveChat((s) => s.account);

  return (
    <>
      <div className="scard">
        <div className="scard__body">
          <div className="srow">
            <span className="srow__ic" style={{ background: 'transparent', padding: 0 }}><Avatar nick={nick} size={42} account={account} /></span>
            <div className="srow__txt">
              <div className="srow__label">{nick}</div>
              <div className="srow__hint">{account ? <>{t('settings.account.loggedIn')} · <strong style={{ color: 'var(--accent-d)' }}>@{account}</strong></> : t('settings.account.guestNotConnected')}</div>
            </div>
          </div>
        </div>
      </div>

      <button className="set-leave" onClick={() => { client?.disconnect(); location.reload(); }}>{t('settings.account.leaveChat')}</button>
    </>
  );
}

// Change the current IRC nick — lives in the Compte section so you can align
// your pseudo with your account name BEFORE identifying.
function ChangeNickField({ hint }: { hint: string }) {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const nick = useActiveChat((s) => s.nick);
  const [newNick, setNewNick] = useState(nick);
  // Keep the field in sync if the server confirms a nick change elsewhere.
  useEffect(() => { setNewNick(nick); }, [nick]);

  function applyNick() {
    const n = newNick.trim();
    if (n && n !== nick) client?.setNick(n);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.changeNick')}</label>
          <div className="sfield__row">
            <input className="modal__input" value={newNick} maxLength={30}
              onChange={(e) => setNewNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyNick()} />
            <button className="upbtn" onClick={applyNick} disabled={!newNick.trim() || newNick.trim() === nick}>{t('settings.account.changeBtn')}</button>
          </div>
          <div className="srow__hint" style={{ marginTop: '.3rem' }}>{hint}</div>
        </div>
      </div>
    </div>
  );
}

const TEXT_SIZES: Array<{ v: number; label: string }> = [
  { v: 0.9, label: 'S' }, { v: 1, label: 'M' }, { v: 1.1, label: 'L' }, { v: 1.25, label: 'XL' },
];

function AppearanceSection() {
  const clock24 = useActiveChat((s) => s.prefs.clock24);
  const textScale = useActiveChat((s) => s.prefs.textScale);
  const setPref = useActiveChat((s) => s.setPref);
  const { t } = useTranslation();
  const [theme, setT] = useState<string>(getTheme());
  const [lang, setLangState] = useState(getLang());
  const pluginThemes = usePluginThemes();
  function pick(tm: string) { setT(tm); setTheme(tm); }
  function pickLang(code: string) { setLangState(code); setLang(code); }

  const THEME_OPTS: Array<{ id: Theme; icon: string; label: string }> = [
    { id: 'light', icon: '☀️', label: 'themes.light' },
    { id: 'dark', icon: '🌙', label: 'themes.dark' },
    { id: 'orbit', icon: '🛰️', label: 'themes.orbit' },
    { id: 'orbit-dark', icon: '🌑', label: 'themes.orbitDark' },
    { id: 'yomirc', icon: '🖥️', label: 'themes.yomirc' },
    { id: 'yomirc-dark', icon: '🌑', label: 'themes.yomircDark' },
  ];
  // Built-in options (i18n labels) plus any themes plugins registered (plain names).
  const themeOpts: Array<{ id: string; icon: string; label: string }> = [
    ...THEME_OPTS.map((o) => ({ id: o.id as string, icon: o.icon, label: t(o.label) })),
    ...pluginThemes.map((p) => ({ id: p.id, icon: p.icon || '🎨', label: p.name })),
  ];

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">{t('settings.appearance.language')}</label>
          <select className="modal__input lang-select" value={lang} onChange={(e) => pickLang(e.target.value)} aria-label={t('settings.appearance.language')}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.appearance.theme')}</label>
          <div className="theme-grid">
            {themeOpts.map((tm) => (
              <button key={tm.id} className={`theme-opt ${theme === tm.id ? 'is-on' : ''}`} onClick={() => pick(tm.id)}>
                <span className="theme-opt__ic" aria-hidden>{tm.icon}</span>
                <span className="theme-opt__label">{tm.label}</span>
              </button>
            ))}
          </div>
        </div>
        <ToggleRow icon="🗜️" label={t('settings.appearance.compact')} hint={t('settings.appearance.compactHint')} prefKey="compact" />
        <ToggleRow icon="🖱️" label={t('settings.appearance.hoverActions')} hint={t('settings.appearance.hoverActionsHint')} prefKey="hoverActions" />
        <div className="srow">
          <span className="srow__ic" aria-hidden>🕓</span>
          <div className="srow__txt"><div className="srow__label">{t('settings.appearance.timeFormat')}</div></div>
          <div className="srow__ctrl"><div className="sseg">
            <button className={clock24 ? 'is-on' : ''} onClick={() => setPref('clock24', true)}>24 h</button>
            <button className={!clock24 ? 'is-on' : ''} onClick={() => setPref('clock24', false)}>12 h</button>
          </div></div>
        </div>
        <div className="srow">
          <span className="srow__ic" aria-hidden>🔠</span>
          <div className="srow__txt"><div className="srow__label">{t('settings.appearance.textSize')}</div></div>
          <div className="srow__ctrl"><div className="sseg">
            {TEXT_SIZES.map((s) => (
              <button key={s.label} className={(textScale ?? 1) === s.v ? 'is-on' : ''}
                onClick={() => setPref('textScale', s.v)} aria-label={`${t('settings.appearance.textSize')} ${s.label}`}>{s.label}</button>
            ))}
          </div></div>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const { t } = useTranslation();
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported');
  function askNotif() {
    if ('Notification' in window) Notification.requestPermission().then(setNotif);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="srow">
          <span className="srow__ic" aria-hidden>🔔</span>
          <div className="srow__txt">
            <div className="srow__label">{t('settings.notifications.browserLabel')}</div>
            <div className="srow__hint">{notif === 'granted' ? t('settings.notifications.browserGranted') : notif === 'denied' ? t('settings.notifications.browserDenied') : t('settings.notifications.browserDefault')}</div>
          </div>
          <div className="srow__ctrl">
            {notif === 'granted' ? <span className="sbadge-ok">✓ {t('settings.notifications.enabled')}</span>
              : notif === 'unsupported' || notif === 'denied' ? <span className="srow__hint">—</span>
              : <button className="upbtn upbtn--sm" onClick={askNotif}>{t('settings.notifications.enable')}</button>}
          </div>
        </div>
        {getConfig().features.push && <PushRow />}
        <ToggleRow icon="🔊" label={t('settings.notifications.sounds')} hint={t('settings.notifications.soundsHint')} prefKey="sound" />
        <ToggleRow icon="🙈" label={t('settings.notifications.hideJoins')} hint={t('settings.notifications.hideJoinsHint')} prefKey="hideJoinQuit" />
        {getConfig().features.linkPreviews && (
          <ToggleRow icon="🔗" label={t('settings.notifications.linkPreviews')} hint={t('settings.notifications.linkPreviewsHint')} prefKey="linkPreviews" />
        )}
        <HighlightWordsRow />
      </div>
    </div>
  );
}

// Server / IRCd facts, pulled live from the registration numerics + ISUPPORT.
function ServerSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const status = useActiveChat((s) => s.status);
  const connected = status === 'registered' && !!client;

  const dash = '—';
  let host = '', secure = false;
  try { const u = new URL(getConfig().server.url); host = u.host; secure = u.protocol === 'wss:'; } catch { /* bad url */ }
  const software = client && (client.serverName || client.serverVersion)
    ? [client.serverName, client.serverVersion].filter(Boolean).join(' · ') : dash;
  const roles = client ? client.prefixModes.split('').join(' ') : dash;
  // CHANLIMIT is "#:100" / "#&:50" — surface the join cap as a plain number.
  const maxChans = (() => {
    const m = (client?.isupport?.['CHANLIMIT'] || '').match(/(\d+)/);
    return m ? m[1] : dash;
  })();
  const srv: { label: string; value: string }[] = [
    { label: t('caps.server.network'), value: (connected && client?.network) || dash },
    { label: t('caps.server.software'), value: connected ? software : dash },
    { label: t('caps.server.connection'), value: host ? (secure ? `🔒 ${t('caps.server.secure')} · ${host}` : host) : dash },
    { label: t('caps.server.users'), value: connected && client && client.users > 0 ? client.users.toLocaleString() : dash },
    { label: t('caps.server.casemapping'), value: (connected && client?.casemapping) || dash },
    { label: t('caps.server.channelTypes'), value: (connected && client?.chantypes) || dash },
    { label: t('caps.server.roles'), value: connected ? roles : dash },
    { label: t('caps.server.maxChannels'), value: connected ? maxChans : dash },
    { label: t('caps.server.limits'), value: connected && client
      ? t('caps.server.limitsValue', { nick: client.nicklen, chan: client.channellen, topic: client.topiclen }) : dash },
  ];

  // Everything the server advertised in ISUPPORT (005), for the curious.
  const raw = connected && client
    ? Object.entries(client.isupport).sort((a, b) => a[0].localeCompare(b[0])) : [];

  return (
    <div className="scard">
      <div className="scard__body">
        <dl className="srv-info">
          {srv.map((r) => (
            <div className="srv-row" key={r.label}>
              <dt className="srv-row__k">{r.label}</dt>
              <dd className="srv-row__v">{r.value}</dd>
            </div>
          ))}
        </dl>
        {raw.length > 0 && (
          <details className="srv-adv">
            <summary>{t('caps.server.advanced')} · {raw.length}</summary>
            <div className="srv-adv__grid">
              {raw.map(([k, v]) => (
                <code className="srv-tok" key={k}>{k}{v ? <span className="srv-tok__v">={v}</span> : null}</code>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// About — the app's own identity card (version/build injected at build time +
// the project's open-source links). Orbit is the client; branding.* is the host.
const ORBIT_SOURCE = 'https://git.devtronic.pro/orbit/orbit';
function AboutSection() {
  const { t } = useTranslation();
  const cfg = getConfig();
  const buildDate = (() => { try { return new Date(__BUILD_TIME__).toLocaleDateString(); } catch { return ''; } })();
  const build = [buildDate, __GIT_COMMIT__].filter(Boolean).join(' · ') || '—';
  const rows: { label: string; value: ReactNode }[] = [
    { label: t('about.version'), value: __APP_VERSION__ },
    { label: t('about.build'), value: build },
    { label: t('about.license'), value: <a href={`${ORBIT_SOURCE}/src/branch/main/LICENSE`} target="_blank" rel="noopener noreferrer">AGPL-3.0</a> },
    { label: t('about.source'), value: <a href={ORBIT_SOURCE} target="_blank" rel="noopener noreferrer">{ORBIT_SOURCE.replace(/^https?:\/\//, '')} ↗</a> },
    { label: t('about.project'), value: <a href={cfg.branding.projectUrl} target="_blank" rel="noopener noreferrer">{cfg.branding.projectUrl.replace(/^https?:\/\//, '')} ↗</a> },
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

// IRCv3 capabilities panel — shows every cap Orbit negotiates and whether the
// connected server actually supports it (live, from the client's CAP state).
function CapabilitiesSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const status = useActiveChat((s) => s.status);
  const connected = status === 'registered' && !!client;
  const caps = client ? client.ircv3.listCaps() : CAP_KEYS.map((name) => ({ name, available: false, enabled: false }));
  const active = caps.filter((c) => c.enabled).length;

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield"><div className="sfield__intro">{t('caps.intro')}</div></div>
        <div className="caps-count">{t('caps.status.enabled')} · <b>{active}</b> / {caps.length}</div>
        <ul className="caps-list">
          {caps.map((c) => {
            const info = CAP_INFO[c.name];
            const state = !connected ? 'offline' : c.enabled ? 'enabled' : c.available ? 'available' : 'unavailable';
            const desc = info ? t(`caps.desc.${info.key}`) : '';
            return (
              <li key={c.name} className={`caprow caprow--${state}`} title={desc ? `${c.name} — ${desc}` : c.name}>
                <span className="caprow__ic" aria-hidden>{info?.icon ?? '🔌'}</span>
                <div className="caprow__txt">
                  <code className="caprow__name">{c.name}</code>
                  {desc && <span className="caprow__desc">{desc}</span>}
                </div>
                <span className={`capbadge capbadge--${state}`}>{t(`caps.status.${state}`)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
const CAP_KEYS = Object.keys(CAP_INFO);

function LoginTab() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const account = useActiveChat((s) => s.account);
  const nick = useActiveChat((s) => s.nick);
  const status = useActiveChat((s) => s.status); // re-render once (re)registration acks the caps
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [acct, setAcct] = useState(nick);
  const [pw, setPw] = useState('');
  const [phase, setPhase] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const wasAccount = useRef(account);

  // React to the server confirming login (RPL_LOGGEDIN → account fills in) —
  // covers both manual IDENTIFY and the auto-login after a fresh VERIFY. On
  // success, auto-align the visible nick to the account we just logged into, so
  // the user doesn't have to change it by hand (a no-op if it already matches).
  useEffect(() => {
    if (account && account !== wasAccount.current) {
      setPhase('success');
      setPw('');
      // Drop focus so the mobile keyboard closes before the form swaps to the
      // connected view (otherwise the unmounted input leaves the layout shrunk).
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (client && nick && nick.toLowerCase() !== account.toLowerCase()) client.setNick(account);
    }
    wasAccount.current = account;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // While pending, give up after a few seconds (wrong password → no 900).
  useEffect(() => {
    if (phase !== 'pending') return;
    const t = setTimeout(() => setPhase((p) => (p === 'pending' ? 'error' : p)), 5000);
    return () => clearTimeout(t);
  }, [phase]);

  // One step: IDENTIFY to the named account (works from ANY nick), then the
  // success handler above renames us to it.
  function login() {
    const a = acct.trim();
    const p = pw.trim();
    if (!a || !p || !client) return;
    client.privmsg('NickServ', `IDENTIFY ${a} ${p}`);
    setPhase('pending');
  }
  function logout() {
    client?.privmsg('NickServ', 'LOGOUT');
    setPhase('idle');
  }

  // Logged in → account hero + security card + logout.
  if (account) {
    return (
      <>
        <div className={`login-card login-card--ok ${phase === 'success' ? 'is-burst' : ''}`}>
          <div className="login-card__check" aria-hidden>
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M14 27 l8 8 l16 -18" /></svg>
          </div>
          <div className="login-card__title">{t('settings.account.loggedIn')}</div>
          <div className="login-card__sub">{t('settings.account.identifiedPre')} <strong>{account}</strong></div>
        </div>
        <ChangeNickField hint={t('settings.account.nickHint')} />
        <ChangePassword />
        <button className="set-leave" onClick={logout}>{t('settings.account.logoutAccount')}</button>
      </>
    );
  }

  // Not logged in → login / register switcher. Registration needs BOTH the build
  // to enable it AND the server to advertise draft/account-registration; otherwise
  // REGISTER would just come back as an unknown command (e.g. a leaner ircd).
  const canRegister = getConfig().features.register
    && status === 'registered' && !!client?.ircv3.hasCap('draft/account-registration');
  return (
    <>
      {canRegister && (
        <div className="login-switch">
          <button className={mode === 'login' ? 'is-on' : ''} onClick={() => setMode('login')}>{t('settings.account.signin')}</button>
          <button className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>{t('settings.account.createTitle')}</button>
        </div>
      )}

      {(mode === 'login' || !canRegister) ? (
        <div className="scard">
          <div className="scard__h">🔑 {t('settings.account.signin')}</div>
          <div className="scard__body">
            <div className="sfield">
              <div className="sfield__intro">{t('settings.account.loginIntro')}</div>
            </div>
            <div className="sfield">
              <label className="sfield__label">{t('settings.sections.account')}</label>
              <input className="modal__input" autoComplete="username" placeholder={t('settings.account.accountPlaceholder')} value={acct} maxLength={30}
                onChange={(e) => { setAcct(e.target.value); if (phase === 'error') setPhase('idle'); }}
                onKeyDown={(e) => e.key === 'Enter' && login()} />
            </div>
            <div className="sfield">
              <label className="sfield__label">{t('settings.account.password')}</label>
              <div className="sfield__row">
                <input className="modal__input" type="password" autoComplete="current-password"
                  placeholder={t('settings.account.passwordPlaceholder')} value={pw}
                  onChange={(e) => { setPw(e.target.value); if (phase === 'error') setPhase('idle'); }}
                  onKeyDown={(e) => e.key === 'Enter' && login()} />
                <button className={`upbtn upbtn--primary ${phase === 'pending' ? 'is-loading' : ''}`}
                  onClick={login} disabled={!acct.trim() || !pw.trim() || phase === 'pending'}>
                  {phase === 'pending' ? t('settings.account.connecting') : t('settings.account.signin')}
                </button>
              </div>
              {phase === 'error' && <div className="sfield__err">{t('settings.account.unknownError')}</div>}
            </div>
          </div>
        </div>
      ) : (
        <RegisterForm />
      )}
    </>
  );
}

// Change the account password — updates BOTH Anope (IRC) and Django (site).
function ChangePassword() {
  const { t } = useTranslation();
  const change = useActiveChat((s) => s.accountChangePassword);
  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function go() {
    if (cur.length < 1 || np.trim().length < 6 || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await change(cur, np.trim());
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setCur(''); setNp(''); }
  }

  return (
    <div className="scard">
      <div className="scard__h">🔒 {t('settings.account.security')}</div>
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.currentPassword')}</label>
          <input className="modal__input" type="password" autoComplete="current-password"
            placeholder={t('settings.account.currentPassword')} value={cur}
            onChange={(e) => { setCur(e.target.value); setMsg(null); }} />
        </div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.newPassword')}</label>
          <div className="sfield__row">
            <input className="modal__input" type="password" autoComplete="new-password"
              placeholder={t('settings.account.minPassword')} value={np}
              onChange={(e) => { setNp(e.target.value); setMsg(null); }}
              onKeyDown={(e) => e.key === 'Enter' && go()} />
            <button className={`upbtn upbtn--primary ${busy ? 'is-loading' : ''}`} onClick={go}
              disabled={busy || cur.length < 1 || np.trim().length < 6}>
              {busy ? t('settings.account.updating') : t('settings.account.update')}
            </button>
          </div>
          {msg && (msg.ok ? <div className="sfield__ok">✓ {msg.text}</div> : <div className="sfield__err">{msg.text}</div>)}
        </div>
      </div>
    </div>
  );
}

// Create a Tchatou account via IRCv3 draft/account-registration (REGISTER → e-mail
// code → VERIFY → the server auto-logs you in).
function RegisterForm() {
  const { t } = useTranslation();
  const nick = useActiveChat((s) => s.nick);
  const reg = useActiveChat((s) => s.reg);
  const doRegister = useActiveChat((s) => s.accountRegister);
  const doVerify = useActiveChat((s) => s.accountVerify);
  const doResend = useActiveChat((s) => s.accountResend);
  const reset = useActiveChat((s) => s.resetReg);
  const challengeComplete = useActiveChat((s) => s.accountChallengeComplete);

  const [account, setAccount] = useState(nick);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Step 2: enter the e-mail verification code (+ anti-bot challenge if required).
  if (reg.step === 'code') {
    return (
      <div className="scard">
        <div className="scard__h">📧 {t('settings.account.verifyTitle')}</div>
        <div className="scard__body">
          {reg.challengeUrl ? (
            <div className="sfield">
              <div className="challenge">
                <div className="challenge__head">
                  <span className="challenge__icon" aria-hidden>🛡️</span>
                  <div>
                    <div className="challenge__title">{t('settings.account.antiBot')}</div>
                    <div className="challenge__txt">{t('settings.account.antiBotDesc')}</div>
                  </div>
                </div>
                {getConfig().turnstile.enabled ? (
                  <Turnstile sitekey={getConfig().turnstile.sitekey} theme={getTheme().includes('dark') ? 'dark' : 'light'}
                    onVerify={(tok) => challengeComplete(tok)}
                    onError={() => activeStore().setState((s) => ({ reg: { ...s.reg, error: t('settings.account.challengeLoadError') } }))} />
                ) : (
                  // turnstile.enabled=false: don't load Cloudflare's script — link to the verification page instead.
                  <a className="challenge__link" href={reg.challengeUrl} target="_blank" rel="noopener noreferrer">
                    {t('settings.account.challengeOpen')}
                  </a>
                )}
                {reg.busy && <div className="challenge__busy">{t('settings.account.validating')}</div>}
              </div>
            </div>
          ) : (
            <div className="sfield"><div className="sfield__intro">
              {reg.info ? reg.info : <span dangerouslySetInnerHTML={{ __html: t('settings.account.codeSentHtml', { email: escapeHtml(email || t('settings.account.yourEmail')), account: escapeHtml(reg.account) }) }} />}
            </div></div>
          )}
          <div className="sfield">
            <label className="sfield__label">{t('settings.account.verificationCode')}</label>
            <div className="sfield__row">
              <input className="modal__input" inputMode="numeric" placeholder={t('settings.account.totpCode')} value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && code.trim() && doVerify(code.trim())} />
              <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`}
                onClick={() => doVerify(code.trim())} disabled={!code.trim() || reg.busy}>
                {reg.busy ? t('settings.account.validating') : t('settings.account.verify')}
              </button>
            </div>
            {reg.error && <div className="sfield__err">{reg.error}</div>}
            <div className="reg-foot">
              <button className="linkbtn" onClick={() => doResend()}>{t('settings.account.resend')}</button>
              <button className="linkbtn" onClick={() => reset()}>{t('settings.account.restart')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: account / email / password.
  return (
    <div className="scard">
      <div className="scard__h">✨ {t('settings.account.createTitle')}</div>
      <div className="scard__body">
        <div className="sfield"><div className="sfield__intro">{t('settings.account.registerIntro')}</div></div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.nickLabel')}</label>
          <input className="modal__input" placeholder={t('settings.account.nickPlaceholder')} value={account} maxLength={30}
            onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.emailLabel')}</label>
          <input className="modal__input" type="email" autoComplete="email" placeholder={t('settings.account.emailPlaceholder')}
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.password')}</label>
          <input className="modal__input" type="password" autoComplete="new-password"
            placeholder={t('settings.account.minPassword')} value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {reg.error && <div className="sfield__err">{reg.error}</div>}
          <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`} style={{ marginTop: '.2rem' }}
            onClick={() => doRegister(account.trim(), email.trim(), password)}
            disabled={reg.busy || !account.trim() || !email.trim() || password.length < 6}>
            {reg.busy ? t('settings.account.creating') : t('settings.account.createCta')}
          </button>
        </div>
      </div>
    </div>
  );
}

