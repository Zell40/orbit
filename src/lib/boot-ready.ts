/** First-paint gate: hold the splash until the shell is actually usable. */

export const BOOT_MAX_MS = 8000;
export const BOOT_MIN_MS = 400;
/** NickServ account / nicklist: don't stall guests or a slow WHOIS. */
export const BOOT_IDENTITY_MS = 1800;
/** Priority plugin factories + topbar paint. */
export const BOOT_CHROME_MS = 1200;

/** Click-now chrome (visio, salon, members, bar). Games keep loading in the background. */
export const BOOT_PRIORITY_PLUGINS = [
  'orbit-conference',
  'orbit-chanserv',
  'orbit-asl',
  'orbit-navbar',
] as const;

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

type BootBuf = {
  joined?: boolean;
  isChannel?: boolean;
  name?: string;
  members?: Record<string, unknown>;
};

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

export function shellPainted(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('.shell .topbar');
}

/** Our nick is on the primary salon nicklist (prefixes / visio op check). */
export function selfInPrimaryRoom(
  buffers: Record<string, BootBuf>,
  expected: string[],
  nick: string,
): boolean {
  const me = String(nick || '').trim().toLowerCase();
  if (!me) return false;
  const target = expected[0]
    || Object.values(buffers).find((b) => b.isChannel && b.joined)?.name;
  if (!target) return false;
  const n = normChan(target);
  const buf = Object.values(buffers).find((b) => b.joined && normChan(b.name || '') === n);
  if (!buf) return false;
  const members = buf.members;
  if (!members) return false;
  return Object.keys(members).some((k) => k.toLowerCase() === me);
}

export function priorityPluginIds(pluginUrls: string[]): string[] {
  const blob = pluginUrls.join('\n');
  return BOOT_PRIORITY_PLUGINS.filter((id) => blob.includes(id));
}

export function pluginsRegistered(needed: string[], have: string[]): boolean {
  if (!needed.length) return true;
  const set = new Set(have);
  return needed.every((id) => set.has(id));
}

export function identityReady(expectAccount: boolean, account: string): boolean {
  return !expectAccount || !!String(account || '').trim();
}

export function displayReady(opts: {
  topbar: boolean;
  pluginsOk: boolean;
  identityOk: boolean;
  selfInRoom: boolean;
}): boolean {
  return opts.topbar && opts.pluginsOk && opts.identityOk && opts.selfInRoom;
}

export function bootProgress(opts: {
  status: string;
  pluginFrac: number;
  roomFrac: number;
  displayFrac: number;
  connectingForMs: number;
}): number {
  if (opts.status === 'connecting' || opts.status === 'idle') {
    return Math.round(Math.min(32, 8 + opts.connectingForMs / 220));
  }
  let p = 36;
  p += 22 * Math.min(1, Math.max(0, opts.pluginFrac));
  p += 26 * Math.min(1, Math.max(0, opts.roomFrac));
  p += 12 * Math.min(1, Math.max(0, opts.displayFrac));
  return Math.max(8, Math.min(96, Math.round(p)));
}

export type BootPhase = 'connecting' | 'plugins' | 'rooms' | 'display' | 'almost';

export function bootPhase(opts: {
  status: string;
  pluginsDone: boolean;
  roomsDone: boolean;
  displayDone: boolean;
}): BootPhase {
  if (opts.status === 'connecting' || opts.status === 'idle') return 'connecting';
  if (!opts.pluginsDone) return 'plugins';
  if (!opts.roomsDone) return 'rooms';
  if (!opts.displayDone) return 'display';
  return 'almost';
}
