// localStorage-backed lists (ignored nicks, friends, muted channels, highlight
// words). Pure persistence helpers — no store state.
export const IGNORE_KEY = 'tchatou-ignored';
export const FRIENDS_KEY = 'tchatou-friends';
export const MUTED_KEY = 'tchatou-muted';
export const HIGHLIGHT_KEY = 'tchatou-highlights';
export const NOTIFY_KEY = 'tchatou-notify';
export const PINS_KEY = 'tchatou-pins';

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

// Pinned messages are client-local (IRC has no pin protocol) — a snapshot of the
// line, kept per canon channel key, newest first.
export interface Pin { id: string; from: string; text: string; ts: number; }
export function loadPins(): Record<string, Pin[]> {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '{}'); } catch { return {}; }
}
export function savePins(map: Record<string, Pin[]>): void {
  try { localStorage.setItem(PINS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export const PIN_CAP = 30; // most-recent pins kept per channel

// Pure reducers over the pin map — toggle a line in/out, or drop one. An empty
// channel key is removed so the map stays sparse. Kept pure so they're unit-testable
// without the store; the store just wraps these with savePins()/set().
export function togglePinIn(pins: Record<string, Pin[]>, key: string, pin: Pin): Record<string, Pin[]> {
  const cur = pins[key] || [];
  const next = { ...pins };
  next[key] = cur.some((p) => p.id === pin.id)
    ? cur.filter((p) => p.id !== pin.id)
    : [pin, ...cur].slice(0, PIN_CAP);
  if (!next[key].length) delete next[key];
  return next;
}
export function unpinIn(pins: Record<string, Pin[]>, key: string, id: string): Record<string, Pin[]> {
  const next = { ...pins };
  next[key] = (pins[key] || []).filter((p) => p.id !== id);
  if (!next[key].length) delete next[key];
  return next;
}

export const loadIgnored = () => loadStr(IGNORE_KEY);
export const saveIgnored = (list: string[]) => saveStr(IGNORE_KEY, list);
export const loadFriends = () => loadStr(FRIENDS_KEY);
export const saveFriends = (list: string[]) => saveStr(FRIENDS_KEY, list);
