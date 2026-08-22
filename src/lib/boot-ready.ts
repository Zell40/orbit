/** First-paint gate: hold the splash until rooms/plugins are usable, then reveal. */

export const BOOT_MAX_MS = 8000;
export const BOOT_MIN_MS = 280;

let expectedChannels: string[] = [];

export function setExpectedBootChannels(channels: string[] | undefined): void {
  expectedChannels = (channels ?? []).map((c) => String(c).trim()).filter(Boolean);
}

export function getExpectedBootChannels(): string[] {
  return expectedChannels;
}

export function normChan(name: string): string {
  return String(name || '').trim().toLowerCase();
}

type BootBuf = { joined?: boolean; isChannel?: boolean; name?: string };

export function roomsReady(buffers: Record<string, BootBuf>, expected: string[]): boolean {
  return roomFrac(buffers, expected) >= 1;
}

export function roomFrac(buffers: Record<string, BootBuf>, expected: string[]): number {
  const list = Object.values(buffers);
  if (!expected.length) return list.some((b) => b.isChannel && b.joined) ? 1 : 0;
  let ok = 0;
  for (const ch of expected) {
    const n = normChan(ch);
    if (list.some((b) => b.joined && normChan(b.name || '') === n)) ok += 1;
  }
  return ok / expected.length;
}

/** Sidebar labels as shown (`EntreNous.chat` without leading #). */
export function roomsListed(expected: string[], labels: string[]): boolean {
  const names = labels.map((s) => {
    const t = String(s || '').trim();
    if (!t) return '';
    return normChan(t[0] === '#' || t[0] === '&' ? t : `#${t}`);
  }).filter(Boolean);
  if (!expected.length) return names.length > 0;
  return expected.every((ch) => {
    const n = normChan(ch);
    const bare = n.replace(/^[#&]/, '');
    return names.some((x) => x === n || x.replace(/^[#&]/, '') === bare);
  });
}

export function readSidebarChannelLabels(): string[] {
  if (typeof document === 'undefined') return [];
  const out: string[] = [];
  document.querySelectorAll('.room').forEach((row) => {
    if (!row.querySelector('.room__hash')) return;
    const raw = row.querySelector('.room__name')?.textContent?.trim() || '';
    if (raw) out.push(raw);
  });
  return out;
}

export function bootProgress(opts: {
  status: string;
  pluginFrac: number;
  roomFrac: number;
  connectingForMs: number;
}): number {
  if (opts.status === 'connecting' || opts.status === 'idle') {
    return Math.round(Math.min(32, 8 + opts.connectingForMs / 220));
  }
  let p = 36;
  p += 24 * Math.min(1, Math.max(0, opts.pluginFrac));
  p += 36 * Math.min(1, Math.max(0, opts.roomFrac));
  return Math.max(8, Math.min(96, Math.round(p)));
}

export type BootPhase = 'connecting' | 'plugins' | 'rooms' | 'almost';

export function bootPhase(opts: {
  status: string;
  pluginsDone: boolean;
  roomsDone: boolean;
}): BootPhase {
  if (opts.status === 'connecting' || opts.status === 'idle') return 'connecting';
  if (!opts.pluginsDone) return 'plugins';
  if (!opts.roomsDone) return 'rooms';
  return 'almost';
}
