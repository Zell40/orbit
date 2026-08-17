// localStorage-backed lists (ignored nicks, friends, muted channels, highlight
// words). Pure persistence helpers — no store state.
import { lsRead, lsWrite } from '@/lib/storage-keys';

const IGNORE_KEY = 'orbit-ignored';
const FRIENDS_KEY = 'orbit-friends';
const MUTED_KEY = 'orbit-muted';
export const HIGHLIGHT_KEY = 'orbit-highlights';
const NOTIFY_KEY = 'orbit-notify';
const PINS_KEY = 'orbit-pins';

function loadRaw(key: string, legacy: string): string | null {
  return lsRead(key, legacy);
}

export function loadStr(key: string): string[] {
  const legacy = key.replace(/^orbit-/, 'tchatou-');
  try { return JSON.parse(loadRaw(key, legacy) || '[]'); } catch { return []; }
}
export function saveStr(key: string, list: string[]): void {
  lsWrite(key, JSON.stringify(list));
}

// Per-channel notification level (canon key → 'all' | 'mentions' | 'mute').
// Absent entry = the 'mentions' default. Seeded once from any legacy muted list.
export type NotifyLevel = 'all' | 'mentions' | 'mute';
// `ns` namespaces the key PER NETWORK ('' = primary, ':<id>' = extra networks) so
// two networks' same-named channels don't clobber each other in localStorage.
export function loadNotify(ns = ''): Record<string, NotifyLevel> {
  try {
    const raw = loadRaw(NOTIFY_KEY + ns, `tchatou-notify${ns}`);
    if (raw) return JSON.parse(raw);
    if (ns) return {};
    // Migrate legacy muted channels → level 'mute' (primary only).
    const seed: Record<string, NotifyLevel> = {};
    for (const c of loadStr(MUTED_KEY)) seed[c] = 'mute';
    return seed;
  } catch { return {}; }
}
export function saveNotify(map: Record<string, NotifyLevel>, ns = ''): void {
  lsWrite(NOTIFY_KEY + ns, JSON.stringify(map));
}

// Pinned messages are client-local (IRC has no pin protocol) — a snapshot of the
// line, kept per canon channel key, newest first.
export interface Pin { id: string; from: string; text: string; ts: number; }
export function loadPins(ns = ''): Record<string, Pin[]> {
  try {
    return JSON.parse(loadRaw(PINS_KEY + ns, `tchatou-pins${ns}`) || '{}');
  } catch { return {}; }
}
export function savePins(map: Record<string, Pin[]>, ns = ''): void {
  lsWrite(PINS_KEY + ns, JSON.stringify(map));
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
