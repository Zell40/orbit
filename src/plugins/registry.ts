// Registry of plugin-contributed UI, backed by zustand so React components
// re-render when a plugin (loaded async) adds or removes a slot. Plugins inject
// UI through Orbit.addUi() into the finite, named insertion points below.
import { create } from 'zustand';
import type { ReactNode } from 'react';

// The UI slots the core currently exposes. Add more as components grow homes.
export type UiSlot = 'composer_button' | 'settings_section' | 'topbar_item' | 'sidebar_item';

export interface PluginUi {
  id: string;
  plugin: string;
  slot: UiSlot;
  render: () => ReactNode;
  // Nav metadata for slots that need a label/icon (e.g. settings_section).
  meta?: { label?: string; icon?: string };
}

// A stable, plugin-facing subset of a message handed to per-message hooks —
// intentionally NOT the internal ChatMessage shape, so plugins don't couple to it.
export interface MessageInfo {
  id: string;
  nick: string;
  text: string;
  kind: string;
  ts: number;
  mine: boolean;
}
/** @deprecated use MessageInfo */
export type DecoratorInfo = MessageInfo;

// Per-message contributions. A decorator renders inline after the text (badges,
// chips); an action renders in the hover action toolbar (next to reply/react).
export interface PluginPerMessage {
  id: string;
  plugin: string;
  render: (m: MessageInfo) => ReactNode;
}

interface RegistryState {
  ui: PluginUi[];
  decorators: PluginPerMessage[];
  actions: PluginPerMessage[];
  addUi: (slot: UiSlot, plugin: string, render: () => ReactNode, meta?: PluginUi['meta']) => () => void;
  addDecorator: (plugin: string, render: (m: MessageInfo) => ReactNode) => () => void;
  addAction: (plugin: string, render: (m: MessageInfo) => ReactNode) => () => void;
}

export const usePluginRegistry = create<RegistryState>((set) => ({
  ui: [],
  decorators: [],
  actions: [],
  addUi: (slot, plugin, render, meta) => {
    const id = `${plugin}:${slot}:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ ui: [...s.ui, { id, plugin, slot, render, meta }] }));
    return () => set((s) => ({ ui: s.ui.filter((u) => u.id !== id) }));
  },
  addDecorator: (plugin, render) => {
    const id = `${plugin}:dec:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ decorators: [...s.decorators, { id, plugin, render }] }));
    return () => set((s) => ({ decorators: s.decorators.filter((d) => d.id !== id) }));
  },
  addAction: (plugin, render) => {
    const id = `${plugin}:act:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ actions: [...s.actions, { id, plugin, render }] }));
    return () => set((s) => ({ actions: s.actions.filter((a) => a.id !== id) }));
  },
}));
