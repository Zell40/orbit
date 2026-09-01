// Sidebar conversation order: A–Z by default, then a user drag order (persisted).
import { lsRead, lsWrite } from '@/lib/storage-keys';
import { SERVER, isChannelName, isNoticeBuffer } from './context';

export type SidebarSection = 'channels' | 'queries';
export interface SidebarOrder {
  channels: string[];
  queries: string[];
}

const KEY = 'orbit-sidebar-order';

export function emptySidebarOrder(): SidebarOrder {
  return { channels: [], queries: [] };
}

export function loadSidebarOrder(ns = ''): SidebarOrder {
  try {
    const raw = lsRead(KEY + ns);
    if (!raw) return emptySidebarOrder();
    const p = JSON.parse(raw) as Partial<SidebarOrder>;
    return {
      channels: Array.isArray(p.channels) ? p.channels.map(String) : [],
      queries: Array.isArray(p.queries) ? p.queries.map(String) : [],
    };
  } catch {
    return emptySidebarOrder();
  }
}

export function saveSidebarOrder(order: SidebarOrder, ns = ''): void {
  lsWrite(KEY + ns, JSON.stringify({
    channels: order.channels,
    queries: order.queries,
  }));
}

export function nameCmp(a: string, b: string): number {
  const strip = (s: string) => s.replace(/^[#&+!]/, '');
  return strip(a).localeCompare(strip(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Live names, with a saved drag order if any; unknown names go A–Z after (or the whole list is A–Z). */
export function arrangeNames(live: string[], saved: string[]): string[] {
  const have = new Set(live);
  const custom = saved.filter((k) => have.has(k));
  const rest = live.filter((k) => !custom.includes(k)).sort(nameCmp);
  if (!custom.length) return rest;
  return [...custom, ...rest];
}

/** Move `from` onto `to` (insert after when dragging down, before when dragging up). */
export function moveName(list: string[], from: string, to: string): string[] {
  const i = list.indexOf(from);
  const j = list.indexOf(to);
  if (i < 0 || j < 0 || i === j) return list;
  const next = [...list];
  next.splice(i, 1);
  const insert = next.indexOf(to) + (i < j ? 1 : 0);
  next.splice(insert, 0, from);
  return next;
}

export function liveChannels(order: string[]): string[] {
  return order.filter((n) => isChannelName(n));
}

export function liveQueries(order: string[]): string[] {
  return order.filter((n) => n !== SERVER && !isNoticeBuffer(n) && !isChannelName(n));
}

export function arrangedChannels(order: string[], saved: SidebarOrder): string[] {
  return arrangeNames(liveChannels(order), saved.channels);
}

export function arrangedQueries(order: string[], saved: SidebarOrder): string[] {
  return arrangeNames(liveQueries(order), saved.queries);
}

/** Open channels then PMs in sidebar order (quick switcher, no Status/notices). */
export function sidebarBufferOrder(order: string[], saved: SidebarOrder): string[] {
  return [...arrangedChannels(order, saved), ...arrangedQueries(order, saved)];
}

/** Same as the left rail: channels, PMs, notices, then Status. */
export function sidebarNavOrder(order: string[], saved: SidebarOrder): string[] {
  const notices = order.filter(isNoticeBuffer);
  return [
    ...sidebarBufferOrder(order, saved),
    ...notices,
    ...(order.includes(SERVER) ? [SERVER] : []),
  ];
}
