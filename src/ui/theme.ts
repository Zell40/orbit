import { useSyncExternalStore } from 'react';
import { getConfig } from '../config';

// Theme — persisted in localStorage, applied via [data-theme] on <html>.
// 'yomirc' is a retro classic-mIRC skin (monospace, grey 95-style chrome, flat nick list).
// 'orbit' mirrors the orbit.tchatou.fr project site — near-black slate, green accent.
// 'orbit-dark' mirrors tchatou.fr — near-black, monochrome white accent, Geist, green "live".
export type Theme = 'light' | 'dark' | 'orbit' | 'orbit-dark' | 'yomirc' | 'yomirc-dark';

const KEY = 'tchatou-theme';

const THEME_COLOR: Record<string, string> = {
  light: '#ffffff',
  dark: '#16191c',
  orbit: '#0b0e13',
  'orbit-dark': '#08080a',
  yomirc: '#c0c0c0',
  'yomirc-dark': '#0d1219',
};

const THEMES: Theme[] = ['light', 'dark', 'orbit', 'orbit-dark', 'yomirc', 'yomirc-dark'];

// Themes registered at runtime by plugins (orbit.addTheme). Kept apart from the
// built-in list; the picker and the theme-color meta include them. Their ids are
// plain strings, not the built-in `Theme` union.
export interface PluginTheme { id: string; name: string; icon?: string; color?: string }
let pluginThemes: PluginTheme[] = [];
export function registerTheme(pt: PluginTheme): () => void {
  pluginThemes = [...pluginThemes.filter((x) => x.id !== pt.id), pt];
  if (pt.color) THEME_COLOR[pt.id] = pt.color;
  window.dispatchEvent(new Event('themelistchange'));
  return () => { pluginThemes = pluginThemes.filter((x) => x.id !== pt.id); window.dispatchEvent(new Event('themelistchange')); };
}
export function listPluginThemes(): PluginTheme[] { return pluginThemes; }
export function usePluginThemes(): PluginTheme[] {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('themelistchange', cb); return () => window.removeEventListener('themelistchange', cb); },
    listPluginThemes, listPluginThemes,
  );
}

const known = (t: string) => THEMES.includes(t as Theme) || pluginThemes.some((p) => p.id === t);

export function getTheme(): string {
  const t = localStorage.getItem(KEY) || '';
  if (known(t)) return t;
  const d = getConfig().defaults.theme; // config-provided default for new users
  return known(d) ? d : 'light';
}

export function applyTheme(t: string): void {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[t] ?? '#ffffff');
}

export function setTheme(t: string): void {
  localStorage.setItem(KEY, t);
  applyTheme(t);
  window.dispatchEvent(new Event('themechange'));
}

// Reactive hook: re-renders subscribers when the theme changes (e.g. mIRC log layout).
function subscribe(cb: () => void): () => void {
  window.addEventListener('themechange', cb);
  return () => window.removeEventListener('themechange', cb);
}
export function useTheme(): string {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}

// apply immediately on import so there's no flash of the wrong theme
applyTheme(getTheme());
