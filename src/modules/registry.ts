// Registry of plugin-contributed UI, backed by zustand so React components
// re-render when a plugin (loaded async) adds or removes a slot. Plugins inject
// UI through Orbit.addUi() into the finite, named insertion points below.
import { create } from 'zustand';
import type { ReactNode } from 'react';

// The UI slots the core currently exposes. Add more as components grow homes.
// 'nav_item' sits in the bottom nav next to Home/Rooms/Friends (for a prominent,
// tab-like control such as the radio player); 'navbar' is a full-width bar across
// the very top of the app, for network branding + portal links (orbit-navbar).
// 'overlay' renders at the app root, always mounted and free of any transformed
// or hidden ancestor — the home for a plugin's own fixed popover/panel, so its
// launcher button can live (and move) anywhere without unmounting the panel.
// 'user_badge' sits to the right of the nick in the app footer (guest/status chips).
export type UiSlot = 'composer_button' | 'settings_section' | 'settings_mode' | 'topbar_item' | 'topbar_more_item' | 'sidebar_item' | 'sidebar_room' | 'footer_item' | 'nav_item' | 'navbar' | 'overlay' | 'user_badge';

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
  text: string; // human-readable: mIRC formatting/colour codes stripped
  raw: string;  // original text, including any mIRC formatting/colour codes
  kind: string;
  ts: number;
  mine: boolean;
  /** Buffer this message lives in (#channel or query nick). */
  buffer?: string;
  /** Client message-tags available to plugins (e.g. +entrenous.fr/conference). */
  tags?: Record<string, string>;
}

// Per-message contributions. A decorator renders inline after the text (badges,
// chips); an action renders in the hover action toolbar (next to reply/react).
export interface PluginPerMessage {
  id: string;
  plugin: string;
  render: (m: MessageInfo) => ReactNode;
}

// Context handed to a per-user action (rendered in the profile/whois card).
export interface UserActionCtx { nick: string; close: () => void }
export interface PluginPerUser {
  id: string;
  plugin: string;
  render: (ctx: UserActionCtx) => ReactNode;
}

// Context for a nicklist (member) menu contribution.
export interface MemberMenuCtx { nick: string; close: () => void }
export interface PluginMemberMenu {
  id: string;
  plugin: string;
  render: (ctx: MemberMenuCtx) => ReactNode;
}

// A message offered to plugin filters before it is shown. Returning true from a
// filter suppresses the message from the chat display (plugins still see it via
// on('raw')). Used e.g. to hide a service's machine-readable control lines.
export interface FilterableMessage {
  nick: string;
  command: string;
  target: string;
  text: string;
  /** Client/server tags worth keeping for plugins (e.g. conference invites). */
  tags?: Record<string, string>;
}
export interface PluginFilter {
  id: string;
  plugin: string;
  fn: (m: FilterableMessage) => boolean;
}

// A plugin-registered slash command. Typing "/name a b c" runs it with the
// space-split args and the raw remainder; the plugin responds through its own
// captured `orbit` (orbit.irc.say/send, orbit.notify, …). Built-in commands win
// over a plugin with the same name.
export interface PluginCommand {
  id: string;
  plugin: string;
  name: string;
  run: (args: string[], rest: string) => void;
  help?: string;
}

// A plugin-registered keyboard shortcut. `combo` is "+"-joined, e.g. "mod+k" or
// "alt+shift+r" (mod = Cmd on macOS, Ctrl elsewhere). Built-in shortcuts win.
export interface PluginShortcut {
  id: string;
  plugin: string;
  combo: string;
  run: (e: KeyboardEvent) => void;
}

/** A TAGMSG / visual-board game: the HUD does not work through a ZNC bouncer. */
export interface VisualDisplayGame {
  id: string;
  plugin: string;
  label: string;
  inChannel: (channel: string) => boolean;
}

// A plugin-opened modal dialog. `render` fills the body; the core supplies the
// backdrop, title bar and close button. Only one is shown at a time.
export interface PluginModalSpec {
  plugin: string;
  render: () => ReactNode;
  title?: string;
  wide?: boolean;
}

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');
// True when a keydown event matches a "mod+shift+k"-style combo.
export function matchShortcut(e: KeyboardEvent, combo: string): boolean {
  const want = { ctrl: false, meta: false, alt: false, shift: false };
  let key = '';
  for (const p of combo.toLowerCase().split('+').map((s) => s.trim()).filter(Boolean)) {
    if (p === 'mod') { if (IS_MAC) want.meta = true; else want.ctrl = true; }
    else if (p === 'ctrl' || p === 'control') want.ctrl = true;
    else if (p === 'meta' || p === 'cmd' || p === 'super') want.meta = true;
    else if (p === 'alt' || p === 'option') want.alt = true;
    else if (p === 'shift') want.shift = true;
    else key = p;
  }
  return e.ctrlKey === want.ctrl && e.metaKey === want.meta && e.altKey === want.alt
    && e.shiftKey === want.shift && (e.key || '').toLowerCase() === key;
}

interface RegistryState {
  ui: PluginUi[];
  decorators: PluginPerMessage[];
  actions: PluginPerMessage[];
  userActions: PluginPerUser[];
  memberMenus: PluginMemberMenu[];
  messageFilters: PluginFilter[];
  commands: PluginCommand[];
  shortcuts: PluginShortcut[];
  visualGames: VisualDisplayGame[];
  modal: PluginModalSpec | null;
  addUi: (slot: UiSlot, plugin: string, render: () => ReactNode, meta?: PluginUi['meta']) => () => void;
  addDecorator: (plugin: string, render: (m: MessageInfo) => ReactNode) => () => void;
  addAction: (plugin: string, render: (m: MessageInfo) => ReactNode) => () => void;
  addUserAction: (plugin: string, render: (ctx: UserActionCtx) => ReactNode) => () => void;
  addMemberMenu: (plugin: string, render: (ctx: MemberMenuCtx) => ReactNode) => () => void;
  addMessageFilter: (plugin: string, fn: (m: FilterableMessage) => boolean) => () => void;
  addCommand: (plugin: string, name: string, run: PluginCommand['run'], help?: string) => () => void;
  addShortcut: (plugin: string, combo: string, run: PluginShortcut['run']) => () => void;
  addVisualDisplay: (plugin: string, label: string, inChannel: (channel: string) => boolean) => () => void;
  openModal: (spec: PluginModalSpec) => () => void;
  closeModal: () => void;
}

export const usePluginRegistry = create<RegistryState>((set) => ({
  ui: [],
  decorators: [],
  actions: [],
  userActions: [],
  memberMenus: [],
  messageFilters: [],
  commands: [],
  shortcuts: [],
  visualGames: [],
  modal: null,
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
  addUserAction: (plugin, render) => {
    const id = `${plugin}:usr:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ userActions: [...s.userActions, { id, plugin, render }] }));
    return () => set((s) => ({ userActions: s.userActions.filter((a) => a.id !== id) }));
  },
  addMemberMenu: (plugin, render) => {
    const id = `${plugin}:mm:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ memberMenus: [...s.memberMenus, { id, plugin, render }] }));
    return () => set((s) => ({ memberMenus: s.memberMenus.filter((a) => a.id !== id) }));
  },
  addMessageFilter: (plugin, fn) => {
    const id = `${plugin}:flt:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ messageFilters: [...s.messageFilters, { id, plugin, fn }] }));
    return () => set((s) => ({ messageFilters: s.messageFilters.filter((f) => f.id !== id) }));
  },
  addCommand: (plugin, name, run, help) => {
    const id = `${plugin}:cmd:${Math.random().toString(36).slice(2, 8)}`;
    const clean = name.replace(/^\//, '').toLowerCase();
    set((s) => ({ commands: [...s.commands, { id, plugin, name: clean, run, help }] }));
    return () => set((s) => ({ commands: s.commands.filter((c) => c.id !== id) }));
  },
  addShortcut: (plugin, combo, run) => {
    const id = `${plugin}:key:${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ shortcuts: [...s.shortcuts, { id, plugin, combo, run }] }));
    return () => set((s) => ({ shortcuts: s.shortcuts.filter((k) => k.id !== id) }));
  },
  addVisualDisplay: (plugin, label, inChannel) => {
    const id = `${plugin}:viz:${Math.random().toString(36).slice(2, 8)}`;
    const name = (label || plugin).trim() || plugin;
    set((s) => ({ visualGames: [...s.visualGames, { id, plugin, label: name, inChannel }] }));
    return () => set((s) => ({ visualGames: s.visualGames.filter((g) => g.id !== id) }));
  },
  openModal: (spec) => {
    set({ modal: spec });
    return () => set((s) => (s.modal === spec ? { modal: null } : {}));
  },
  closeModal: () => set({ modal: null }),
}));

export function matchingVisualGames(games: VisualDisplayGame[], channel: string): VisualDisplayGame[] {
  const ch = (channel || '').trim();
  if (!ch) return [];
  return games.filter((g) => {
    try { return !!g.inChannel(ch); } catch { return false; }
  });
}
