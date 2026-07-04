// User preferences (General settings) — persisted in localStorage.
import { getConfig } from '../core/config';

export interface Prefs {
  sound: boolean;        // play a blip on mention / private message
  hideJoinQuit: boolean; // hide join/part/quit lines in busy channels
  compact: boolean;      // denser message rows
  clock24: boolean;      // 24h timestamps (else 12h am/pm)
  textScale: number;     // UI text size multiplier (1 = default; 0.9 / 1.1 / 1.25)
  linkPreviews: boolean; // show OpenGraph link-preview cards (off = never fetch)
  hoverActions: boolean; // quick react/reply/pin toolbar on message hover (off = classic)
}

const KEY = 'tchatou-prefs';

// Defaults come from config.json (so a deployment can preset compact/sound/etc.).
function defaults(): Prefs {
  const d = getConfig().defaults;
  return { sound: d.sound, hideJoinQuit: d.hideJoinQuit, compact: d.compact, clock24: d.clock24, textScale: 1, linkPreviews: true, hoverActions: true };
}

export function getPrefs(): Prefs {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return d;
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// Density + text size are global layout concerns → reflect them on <html> (CSS
// targets density; the root font-size scales rem-based sizing across the app).
export function applyPrefs(p: Prefs): void {
  document.documentElement.dataset.density = p.compact ? 'compact' : 'comfortable';
  document.documentElement.dataset.actions = p.hoverActions ? 'on' : 'off';
  const scale = Math.min(1.4, Math.max(0.8, p.textScale || 1));
  document.documentElement.style.fontSize = Math.round(scale * 100) + '%';
}

// apply immediately on import so the layout is correct before first paint
applyPrefs(getPrefs());
