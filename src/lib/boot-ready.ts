/** First-paint gate: hold the splash until the shell is actually usable. */

export const BOOT_MAX_MS = 8000;
export const BOOT_MIN_MS = 400;
/** NickServ account / nicklist: don't stall guests or a slow WHOIS. */
export const BOOT_IDENTITY_MS = 1800;
/** Last-resort filet if a listed priority factory never runs (was 1.2s — too early). */
export const BOOT_CHROME_MS = BOOT_MAX_MS;

/**
 * Click-now chrome. `slug` is the URL path fragment; `id` is Orbit.plugin().
 * A few plugins register a shorter name than their folder.
 */
const BOOT_PRIORITY: { slug: string; id: string }[] = [
  { slug: 'orbit-conference', id: 'orbit-conference' },
  { slug: 'orbit-chanserv', id: 'orbit-chanserv' },
  { slug: 'orbit-asl', id: 'orbit-asl' },
  { slug: 'orbit-navbar', id: 'orbit-navbar' },
  { slug: 'orbit-callerid', id: 'orbit-callerid' },
  { slug: 'orbit-room-gallery', id: 'room-gallery' },
  { slug: 'orbit-helpdesk', id: 'helpdesk' },
  { slug: 'orbit-rss', id: 'orbit-rss' },
  { slug: 'orbit-memoserv', id: 'orbit-memoserv' },
  { slug: 'orbit-ircop', id: 'orbit-ircop' },
  { slug: 'orbit-helpserv-welcome', id: 'helpserv-welcome' },
  { slug: 'orbit-anope', id: 'orbit-anope' },
  { slug: 'orbit-invite', id: 'invite' },
];

export const BOOT_PRIORITY_PLUGINS = BOOT_PRIORITY.map((p) => p.id);

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
  return BOOT_PRIORITY.filter((p) => blob.includes(p.slug)).map((p) => p.id);
}

export function pluginsRegistered(needed: string[], have: string[]): boolean {
  if (!needed.length) return true;
  const set = new Set(have);
  return needed.every((id) => set.has(id));
}

/** How many listed click-now factories have actually run. */
export function pluginReadyFrac(needed: string[], have: string[]): number {
  if (!needed.length) return 1;
  const set = new Set(have);
  return needed.filter((id) => set.has(id)).length / needed.length;
}

export function identityReady(expectAccount: boolean, account: string): boolean {
  return !expectAccount || !!String(account || '').trim();
}

export function displayReady(opts: {
  topbar: boolean;
  pluginsOk: boolean;
}): boolean {
  return opts.topbar && opts.pluginsOk;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Weighted real steps. 100 only when `ready` (do not invent time-based crawl). */
export function bootProgress(opts: {
  status: string;
  pluginFrac: number;
  roomFrac: number;
  displayFrac: number;
  ready: boolean;
}): number {
  if (opts.ready) return 100;
  if (opts.status === 'connecting' || opts.status === 'idle') return 12;
  let p = 28;
  p += 42 * clamp01(opts.pluginFrac);
  p += 22 * clamp01(opts.roomFrac);
  p += 8 * clamp01(opts.displayFrac);
  return Math.max(12, Math.min(99, Math.round(p)));
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
