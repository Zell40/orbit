// Registry of plugin-contributed UI, backed by zustand so React components
// re-render when a plugin (loaded async) adds or removes a slot. Plugins inject
// UI through Orbit.addUi() into the finite, named insertion points below.
import { create } from 'zustand';
import type { ReactNode } from 'react';

// The UI slots the core currently exposes. Add more as components grow homes.
export type UiSlot = 'composer_button' | 'settings_section';

export interface PluginUi {
  id: string;
  plugin: string;
  slot: UiSlot;
  render: () => ReactNode;
  // Nav metadata for slots that need a label/icon (e.g. settings_section).
  meta?: { label?: string; icon?: string };
}

interface RegistryState {
  ui: PluginUi[];
  addUi: (slot: UiSlot, plugin: string, render: () => ReactNode, meta?: PluginUi['meta']) => () => void;
}

export const usePluginRegistry = create<RegistryState>((set) => ({
  ui: [],
  addUi: (slot, plugin, render, meta) => {
    const id = `${plugin}:${slot}:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ ui: [...s.ui, { id, plugin, slot, render, meta }] }));
    return () => set((s) => ({ ui: s.ui.filter((u) => u.id !== id) }));
  },
}));
