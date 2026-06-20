// localStorage-backed lists (ignored nicks, friends, muted channels, highlight
// words). Pure persistence helpers — no store state.
export const IGNORE_KEY = 'tchatou-ignored';
export const FRIENDS_KEY = 'tchatou-friends';
export const MUTED_KEY = 'tchatou-muted';
export const HIGHLIGHT_KEY = 'tchatou-highlights';
export const NOTIFY_KEY = 'tchatou-notify';

export function loadStr(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
export function saveStr(key: string, list: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ }
}

// Per-channel notification level (canon key → 'all' | 'mentions' | 'mute').
// Absent entry = the 'mentions' default. Seeded once from any legacy muted list.
export type NotifyLevel = 'all' | 'mentions' | 'mute';
export function loadNotify(): Record<string, NotifyLevel> {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (raw) return JSON.parse(raw);
    // Migrate legacy muted channels → level 'mute'.
    const seed: Record<string, NotifyLevel> = {};
    for (const c of loadStr(MUTED_KEY)) seed[c] = 'mute';
    return seed;
  } catch { return {}; }
}
export function saveNotify(map: Record<string, NotifyLevel>): void {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export const loadIgnored = () => loadStr(IGNORE_KEY);
export const saveIgnored = (list: string[]) => saveStr(IGNORE_KEY, list);
export const loadFriends = () => loadStr(FRIENDS_KEY);
export const saveFriends = (list: string[]) => saveStr(FRIENDS_KEY, list);
