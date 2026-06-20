// Registry of plugin-contributed UI, backed by zustand so React components
// re-render when a plugin (loaded async) adds or removes a slot. Plugins inject
// UI through Orbit.addUi() into the finite, named insertion points below.
import { create } from 'zustand';
import type { ReactNode } from 'react';

// The UI slots the core currently exposes. Add more as components grow homes.
export type UiSlot = 'composer_button';

export interface PluginUi {
  id: string;
  plugin: string;
  slot: UiSlot;
  render: () => ReactNode;
}

interface RegistryState {
  ui: PluginUi[];
  addUi: (slot: UiSlot, plugin: string, render: () => ReactNode) => () => void;
}

export const usePluginRegistry = create<RegistryState>((set) => ({
  ui: [],
  addUi: (slot, plugin, render) => {
    const id = `${plugin}:${slot}:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ ui: [...s.ui, { id, plugin, slot, render }] }));
    return () => set((s) => ({ ui: s.ui.filter((u) => u.id !== id) }));
  },
}));
