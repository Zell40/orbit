import { useSyncExternalStore } from 'react';
import { getConfig } from '../config';

// Theme — persisted in localStorage, applied via [data-theme] on <html>.
// 'yomirc' is a retro classic-mIRC skin (monospace, grey 95-style chrome, flat nick list).
// 'orbit' mirrors the orbit.tchatou.fr project site — near-black slate, green accent.
// 'orbit-dark' mirrors tchatou.fr — near-black, monochrome white accent, Geist, green "live".
export type Theme = 'light' | 'dark' | 'orbit' | 'orbit-dark' | 'yomirc' | 'yomirc-dark';

const KEY = 'tchatou-theme';

const THEME_COLOR: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#16191c',
  orbit: '#0b0e13',
  'orbit-dark': '#08080a',
  yomirc: '#c0c0c0',
  'yomirc-dark': '#0d1219',
};

const THEMES: Theme[] = ['light', 'dark', 'orbit', 'orbit-dark', 'yomirc', 'yomirc-dark'];

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY) as Theme;
  if (THEMES.includes(t)) return t;
  const d = getConfig().defaults.theme as Theme; // config-provided default for new users
  return THEMES.includes(d) ? d : 'light';
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[t] ?? '#ffffff');
}

export function setTheme(t: Theme): void {
  localStorage.setItem(KEY, t);
  applyTheme(t);
  window.dispatchEvent(new Event('themechange'));
}

// Reactive hook: re-renders subscribers when the theme changes (e.g. mIRC log layout).
function subscribe(cb: () => void): () => void {
  window.addEventListener('themechange', cb);
  return () => window.removeEventListener('themechange', cb);
}
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}

// apply immediately on import so there's no flash of the wrong theme
applyTheme(getTheme());
