import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGS, setLang, getLang } from '@/core/i18n';
import { getTheme, setTheme, usePluginThemes, type Theme } from '@/themes';
import { useActiveChat } from '@/core/networks';
import { ToggleRow } from '../rows';

const TEXT_SIZES: Array<{ v: number; label: string }> = [
  { v: 0.9, label: 'S' }, { v: 1, label: 'M' }, { v: 1.1, label: 'L' }, { v: 1.25, label: 'XL' },
];

export function AppearanceSection() {
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
    { id: 'orbit', icon: '🟢', label: 'themes.orbit' },
    { id: 'orbit-dark', icon: '🟠', label: 'themes.orbitDark' },
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
        <ToggleRow icon="💬" label={t('settings.appearance.bubbles')} hint={t('settings.appearance.bubblesHint')} prefKey="bubbleMessages" />
        <ToggleRow icon="📟" label={t('settings.appearance.showStatus')} hint={t('settings.appearance.showStatusHint')} prefKey="showStatus" />
        <ToggleRow icon="🏷️" label={t('settings.appearance.topicFull')} hint={t('settings.appearance.topicFullHint')} prefKey="topicSetterFull" />
        <ToggleRow icon="🖱️" label={t('settings.appearance.hoverActions')} hint={t('settings.appearance.hoverActionsHint')} prefKey="hoverActions" />
        <ToggleRow icon="⌨️" label={t('settings.appearance.mono')} hint={t('settings.appearance.monoHint')} prefKey="monoMessages" />
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
