// Multi-network registry (WIP).
//
// Each network is an INDEPENDENT chat store instance (see createChatStore) — its
// own connection, buffers, nick and state. This registry tracks the set of
// networks and which one is ACTIVE; the chat UI reads the active network's store
// (routing + UI land in later increments). Today it holds only the primary
// network, so single-network behaviour is exactly preserved.
import { create, useStore } from 'zustand';
import { createChatStore, useChat } from './store';
import { getConfig } from './config';

export type ChatStore = ReturnType<typeof createChatStore>;
type ChatState = ReturnType<ChatStore['getState']>;

export interface NetOpts { url: string; nick: string; channels: string[] }

export interface NetworkEntry {
  id: string;
  label: string;      // display name in the sidebar (e.g. "Tchatou", "Libera")
  store: ChatStore;   // the network's own chat store instance
  opts?: NetOpts;     // connection config (no password) — persisted across reloads
}

interface NetworksState {
  networks: NetworkEntry[];
  activeId: string;
  /** Create a new (unconnected) network and return it. */
  add: (label: string, opts?: NetOpts) => NetworkEntry;
  /** Remove a network (can't remove the last one); re-points active if needed. */
  remove: (id: string) => void;
  setActive: (id: string) => void;
}

const PRIMARY = 'default';
const SAVE_KEY = 'orbit-networks';
let seq = 0;

// Session-scoped password store (survives a reload in the same tab, gone on close
// — the same model as the primary network's SASL handoff). Never in localStorage.
export const passKey = (url: string, nick: string) => `orbit-netpass:${url}|${nick}`;

// Persist the EXTRA networks' config (label/url/nick/channels, no password) so they
// come back after a reload. The primary is handled by the normal connect flow.
function persist(): void {
  try {
    const extra = useNetworks.getState().networks
      .filter((n) => n.id !== PRIMARY && n.opts)
      .map((n) => ({ label: n.label, ...n.opts! }));
    localStorage.setItem(SAVE_KEY, JSON.stringify(extra));
  } catch { /* ignore */ }
}

export const useNetworks = create<NetworksState>((set) => ({
  // Seed with the primary network = the existing useChat instance.
  networks: [{ id: PRIMARY, label: getConfig().branding?.name || 'Network', store: useChat }],
  activeId: PRIMARY,
  add: (label, opts) => {
    const id = `net${++seq}`;
    // namespace the new network's persisted per-channel state (pins/notify) by id
    const entry: NetworkEntry = { id, label, store: createChatStore(`:${id}`), opts };
    entry.store.setState({ isActive: false });
    set((s) => ({ networks: [...s.networks, entry] }));
    persist();
    return entry;
  },
  remove: (id) => {
    set((s) => {
      if (s.networks.length <= 1) return s;
      const networks = s.networks.filter((n) => n.id !== id);
      const activeId = s.activeId === id ? networks[0].id : s.activeId;
      networks.forEach((n) => n.store.setState({ isActive: n.id === activeId }));
      return { networks, activeId };
    });
    persist();
  },
  setActive: (id) => set((s) => {
    if (!s.networks.some((n) => n.id === id)) return s;
    s.networks.forEach((n) => n.store.setState({ isActive: n.id === id }));
    return { activeId: id };
  }),
}));

/** The active network's store — the one the chat UI should read from (imperative). */
export function activeStore(): ChatStore {
  const s = useNetworks.getState();
  return (s.networks.find((n) => n.id === s.activeId) ?? s.networks[0]).store;
}

/** React hook: read from the ACTIVE network's store, re-subscribing when the user
 *  switches networks. Drop-in for `useChat(selector)` in components. */
export function useActiveChat<T>(selector: (s: ChatState) => T): T {
  const store = useNetworks((s) => (s.networks.find((n) => n.id === s.activeId) ?? s.networks[0]).store);
  return useStore(store, selector);
}

/** Re-add + reconnect the extra networks saved from a previous session. Called
 *  once at boot; each entry is isolated so one bad/failed network can't block the
 *  rest or the app. Passwords come from sessionStorage (may be absent → guest). */
export function restoreNetworks(): void {
  let saved: unknown;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch { return; }
  if (!Array.isArray(saved)) return;
  for (const n of saved as Array<{ label?: string; url?: string; nick?: string; channels?: string[] }>) {
    if (!n || !n.url || !n.nick) continue;
    try {
      const channels = Array.isArray(n.channels) ? n.channels : [];
      const entry = useNetworks.getState().add(n.label || n.url, { url: n.url, nick: n.nick, channels });
      const password = sessionStorage.getItem(passKey(n.url, n.nick)) || undefined;
      entry.store.getState().connect({ url: n.url, nick: n.nick, channels, password });
    } catch { /* skip a bad entry */ }
  }
}
