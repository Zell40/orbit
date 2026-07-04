// Multi-network registry (WIP).
//
// Each network is an INDEPENDENT chat store instance (see createChatStore) — its
// own connection, buffers, nick and state. This registry tracks the set of
// networks and which one is ACTIVE; the chat UI reads the active network's store
// (routing + UI land in later increments). Today it holds only the primary
// network, so single-network behaviour is exactly preserved.
import { create, useStore } from 'zustand';
import { createChatStore, useChat } from './store';

export type ChatStore = ReturnType<typeof createChatStore>;
type ChatState = ReturnType<ChatStore['getState']>;

export interface NetworkEntry {
  id: string;
  label: string;      // display name in the sidebar (e.g. "Tchatou", "Libera")
  store: ChatStore;   // the network's own chat store instance
}

interface NetworksState {
  networks: NetworkEntry[];
  activeId: string;
  /** Create a new (unconnected) network and return it. */
  add: (label: string) => NetworkEntry;
  /** Remove a network (can't remove the last one); re-points active if needed. */
  remove: (id: string) => void;
  setActive: (id: string) => void;
}

const PRIMARY = 'default';
let seq = 0;

export const useNetworks = create<NetworksState>((set) => ({
  // Seed with the primary network = the existing useChat instance.
  networks: [{ id: PRIMARY, label: PRIMARY, store: useChat }],
  activeId: PRIMARY,
  add: (label) => {
    const entry: NetworkEntry = { id: `net${++seq}`, label, store: createChatStore() };
    set((s) => ({ networks: [...s.networks, entry] }));
    return entry;
  },
  remove: (id) => set((s) => {
    if (s.networks.length <= 1) return s;
    const networks = s.networks.filter((n) => n.id !== id);
    const activeId = s.activeId === id ? networks[0].id : s.activeId;
    return { networks, activeId };
  }),
  setActive: (id) => set((s) => (s.networks.some((n) => n.id === id) ? { activeId: id } : s)),
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
