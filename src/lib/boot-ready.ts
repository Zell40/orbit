/** First-paint gate: hold the splash until rooms/plugins are usable, then reveal. */

export const BOOT_MAX_MS = 4000;
export const BOOT_MIN_MS = 320;
export const BOOT_IMAGES_MS = 1800;

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

export function bootProgress(opts: {
  status: string;
  pluginFrac: number;
  roomFrac: number;
  imagesReady: boolean;
  waitImages: boolean;
  connectingForMs: number;
}): number {
  if (opts.status === 'connecting' || opts.status === 'idle') {
    return Math.round(Math.min(32, 8 + opts.connectingForMs / 220));
  }
  let p = 36;
  p += 22 * Math.min(1, Math.max(0, opts.pluginFrac));
  p += 24 * Math.min(1, Math.max(0, opts.roomFrac));
  if (opts.waitImages) p += opts.imagesReady ? 14 : 6;
  else p += 14;
  return Math.max(8, Math.min(96, Math.round(p)));
}

export type BootPhase = 'connecting' | 'plugins' | 'rooms' | 'almost';

export function bootPhase(opts: {
  status: string;
  pluginsDone: boolean;
  roomsDone: boolean;
  imagesReady: boolean;
  waitImages: boolean;
}): BootPhase {
  if (opts.status === 'connecting' || opts.status === 'idle') return 'connecting';
  if (!opts.pluginsDone) return 'plugins';
  if (!opts.roomsDone) return 'rooms';
  if (opts.waitImages && !opts.imagesReady) return 'rooms';
  return 'almost';
}
