// User preferences (General settings) — persisted in localStorage.
import { getConfig } from './config';

export interface Prefs {
  sound: boolean;        // play a blip on mention / private message
  hideJoinQuit: boolean; // hide join/part/quit lines in busy channels
  compact: boolean;      // denser message rows
  clock24: boolean;      // 24h timestamps (else 12h am/pm)
}

const KEY = 'tchatou-prefs';

// Defaults come from config.json (so a deployment can preset compact/sound/etc.).
function defaults(): Prefs {
  const d = getConfig().defaults;
  return { sound: d.sound, hideJoinQuit: d.hideJoinQuit, compact: d.compact, clock24: d.clock24 };
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

// Density is a global layout concern → reflect it on <html> so CSS can target it.
export function applyPrefs(p: Prefs): void {
  document.documentElement.dataset.density = p.compact ? 'compact' : 'comfortable';
}

// apply immediately on import so the layout is correct before first paint
applyPrefs(getPrefs());
