import { create } from 'zustand';
import { getConfig } from '../core/config';

// Theme — persisted in localStorage, applied via [data-theme] on <html>.
// 'yomirc' is a retro classic-mIRC skin (monospace, flat nick list, 16-colour log).
// 'orbit' mirrors the orbit.tchatou.fr project site; 'orbit-dark' mirrors tchatou.fr.
export type Theme = 'light' | 'dark' | 'orbit' | 'orbit-dark' | 'yomirc' | 'yomirc-dark';

const KEY = 'tchatou-theme'; // also read by the pre-paint script in index.html
const THEMES: Theme[] = ['light', 'dark', 'orbit', 'orbit-dark', 'yomirc', 'yomirc-dark'];

// Themes registered at runtime by plugins (orbit.addTheme). Their ids are plain
// strings, not the built-in `Theme` union.
export interface PluginTheme { id: string; name: string; icon?: string; color?: string }

interface ThemeState {
  theme: string;
  pluginThemes: PluginTheme[];
  setTheme: (t: string) => void;
  registerTheme: (pt: PluginTheme) => () => void;
}

// Reflect the theme on <html> and set the mobile chrome tint from the theme's own
// --bg (single source of truth); plugin themes fall back to their registered colour.
function applyTheme(t: string): void {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const plugin = useThemeStore.getState().pluginThemes.find((p) => p.id === t)?.color;
  meta.setAttribute('content', bg || plugin || '#ffffff');
}

const savedTheme = (): string => {
  const t = localStorage.getItem(KEY) || '';
  return THEMES.includes(t as Theme) ? t : 'light'; // plugin themes/config default resolved later
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: savedTheme(),
  pluginThemes: [],
  setTheme: (t) => { localStorage.setItem(KEY, t); set({ theme: t }); applyTheme(t); },
  registerTheme: (pt) => {
    set((s) => ({ pluginThemes: [...s.pluginThemes.filter((x) => x.id !== pt.id), pt] }));
    // A saved theme that IS this plugin's (registered after boot) takes effect now.
    if (localStorage.getItem(KEY) === pt.id && get().theme !== pt.id) { set({ theme: pt.id }); applyTheme(pt.id); }
    return () => set((s) => ({ pluginThemes: s.pluginThemes.filter((x) => x.id !== pt.id) }));
  },
}));

// Imperative API — unchanged surface for the existing callers.
export const getTheme = (): string => useThemeStore.getState().theme;
export const setTheme = (t: string): void => useThemeStore.getState().setTheme(t);
export const registerTheme = (pt: PluginTheme): (() => void) => useThemeStore.getState().registerTheme(pt);
export const listPluginThemes = (): PluginTheme[] => useThemeStore.getState().pluginThemes;

// React hooks (re-render on the relevant slice).
export function useTheme(): string { return useThemeStore((s) => s.theme); }
export function usePluginThemes(): PluginTheme[] { return useThemeStore((s) => s.pluginThemes); }

// First-time visitors (no saved theme) adopt the config default once config loads.
export function hydrateTheme(): void {
  if (localStorage.getItem(KEY)) return;
  const d = getConfig().defaults.theme;
  const t = THEMES.includes(d as Theme) ? d : 'light';
  useThemeStore.setState({ theme: t });
  applyTheme(t);
}

// Apply immediately on import so there's no flash of the wrong theme.
applyTheme(getTheme());
