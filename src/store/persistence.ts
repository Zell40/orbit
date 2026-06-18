// localStorage-backed lists (ignored nicks, friends, muted channels, highlight
// words). Pure persistence helpers — no store state.
export const IGNORE_KEY = 'tchatou-ignored';
export const FRIENDS_KEY = 'tchatou-friends';
export const MUTED_KEY = 'tchatou-muted';
export const HIGHLIGHT_KEY = 'tchatou-highlights';

export function loadStr(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
export function saveStr(key: string, list: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ }
}

export const loadIgnored = () => loadStr(IGNORE_KEY);
export const saveIgnored = (list: string[]) => saveStr(IGNORE_KEY, list);
export const loadFriends = () => loadStr(FRIENDS_KEY);
export const saveFriends = (list: string[]) => saveStr(FRIENDS_KEY, list);
