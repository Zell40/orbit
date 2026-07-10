import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Only the default + fallback locale ships in the initial chunk so the app paints
// without parsing ~360 KB of other-language JSON it doesn't need yet. French is the
// primary audience, so most users never fetch a second locale; the other nine are
// separate chunks loaded on demand (language switch, or a config-pinned default).
import fr from './locales/fr.json';

const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('./locales/en.json'),
  de: () => import('./locales/de.json'),
  es: () => import('./locales/es.json'),
  it: () => import('./locales/it.json'),
  'pt-PT': () => import('./locales/pt-PT.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  ru: () => import('./locales/ru.json'),
  tr: () => import('./locales/tr.json'),
  ne: () => import('./locales/ne.json'),
};

// Supported UI languages — code + native label (shown in the selector).
export const LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ru', label: 'Русский' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ne', label: 'नेपाली' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];

const KEY = 'tchatou-lang';
const CODES = LANGS.map((l) => l.code) as readonly string[];

function detect(): string {
  const saved = localStorage.getItem(KEY);
  if (saved && CODES.includes(saved)) return saved;
  // browser language: exact (pt-BR) then base (pt → pt-PT, en, de…)
  for (const cand of navigator.languages ?? [navigator.language]) {
    if (CODES.includes(cand)) return cand;
    const base = cand.split('-')[0];
    const hit = CODES.find((c) => c === base || c.split('-')[0] === base);
    if (hit) return hit;
  }
  return 'fr';
}

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: detect(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

document.documentElement.lang = i18n.language;

// Fetch a locale's chunk (once), register it, and switch to it. changeLanguage
// re-asserts the language so react-i18next re-renders with the freshly-added
// bundle even when it was already the active (fallback-rendered) language.
async function loadLang(code: string): Promise<void> {
  const load = loaders[code];
  if (load && !i18n.hasResourceBundle(code, 'translation')) {
    const { default: table } = await load();
    i18n.addResourceBundle(code, 'translation', table, true, true);
  }
  await i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

// The detected language isn't the bundled fallback — pull its chunk and swap in.
if (i18n.language !== 'fr') void loadLang(i18n.language);

// Apply a deployment's default UI language (config.defaults.lang) — but only for
// users who haven't explicitly picked one (setLang writes KEY). Called after the
// runtime config loads, so it can override the browser-detected language.
export function applyConfigDefaultLang(code?: string): void {
  if (!code) return;
  if (localStorage.getItem(KEY)) return;        // explicit user choice — honour it
  if (!CODES.includes(code)) return;            // unknown language — ignore
  if (i18n.language === code) return;
  void loadLang(code);
}

export function getLang(): string {
  return i18n.language;
}

export function setLang(code: string): void {
  localStorage.setItem(KEY, code);
  void loadLang(code);
}

export default i18n;
