import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import tr from './locales/tr.json';
import ne from './locales/ne.json';
import es from './locales/es.json';
import ru from './locales/ru.json';
import it from './locales/it.json';
import ptPT from './locales/pt-PT.json';
import ptBR from './locales/pt-BR.json';

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
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
    tr: { translation: tr },
    ne: { translation: ne },
    es: { translation: es },
    ru: { translation: ru },
    it: { translation: it },
    'pt-PT': { translation: ptPT },
    'pt-BR': { translation: ptBR },
  },
  lng: detect(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

document.documentElement.lang = i18n.language;

// Apply a deployment's default UI language (config.defaults.lang) — but only for
// users who haven't explicitly picked one (setLang writes KEY). Called after the
// runtime config loads, so it can override the browser-detected language.
export function applyConfigDefaultLang(code?: string): void {
  if (!code) return;
  if (localStorage.getItem(KEY)) return;        // explicit user choice — honour it
  if (!CODES.includes(code)) return;            // unknown language — ignore
  if (i18n.language === code) return;
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

export function getLang(): string {
  return i18n.language;
}

export function setLang(code: string): void {
  localStorage.setItem(KEY, code);
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

export default i18n;
