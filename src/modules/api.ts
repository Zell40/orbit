// The `window.Orbit` plugin API — the surface plugins register against.
//
// We deliberately expose only safe, stable capabilities (events, read-only
// state, IRC actions, theming, namespaced storage, named UI slots) and keep
// internal modules private so the app's still-evolving internals stay free to
// change. UI authoring uses HTM (htm.bind to the app's React) so plugins write
// template-literal markup at runtime, with no build step.
import React, { type ReactNode } from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import htm from 'htm';
import { useChat } from '../core/store';
import { activeStore } from '../core/networks';
import i18n from '../core/i18n';
import { pluginNotify } from '../platform/notify';
import { getTheme, setTheme, registerTheme, listPluginThemes, type Theme } from '../themes';
import { getConfig, pluginDebug } from '../core/config';
import { bus } from './bus';
import { usePluginRegistry, type UiSlot, type MessageInfo, type UserActionCtx, type FilterableMessage } from './registry';

const html = htm.bind(React.createElement);
const THEMES: Theme[] = ['light', 'dark', 'orbit', 'orbit-dark', 'yomirc', 'yomirc-dark'];

// Plugin API contract version. Bumped on a breaking change to the surface below
// so plugins can guard (e.g. `if (Orbit.apiVersion < 2) …`). Still experimental.
const API_VERSION = 5;

const registered = new Map<string, OrbitPluginApi>();

export interface OrbitPluginApi {
  /** This plugin's name. */
  name: string;
  /** App build version + git commit. */
  version: string;
  commit: string;
  /** Plugin API contract version (bumped on breaking changes). */
  apiVersion: number;
  /** The app's React instance + render helpers (single instance — nodes interop).
   *  Compiled plugins externalize `react`/`react-dom`/`react/jsx-runtime` to these
   *  so they share Orbit's React (never bundle their own — see docs/PLUGINS.md). */
  React: typeof React;
  ReactDOM: typeof ReactDOM;
  jsxRuntime: typeof ReactJSXRuntime;
  Fragment: typeof React.Fragment;
  h: typeof React.createElement;
  /** Tagged-template markup, e.g. html`<button onClick=${fn}>Hi</button>`. */
  html: typeof html;
  log: (...args: unknown[]) => void;
  // ── event bus ────────────────────────────────────────────────────────────
  on: typeof bus.on;
  once: typeof bus.once;
  off: typeof bus.off;
  emit: typeof bus.emit;
  // ── read-only app state ──────────────────────────────────────────────────
  state: {
    active: () => string;
    nick: () => string;
    account: () => string;
    buffers: () => string[];
    get: () => ReturnType<typeof useChat.getState>;
  };
  // ── IRC actions ──────────────────────────────────────────────────────────
  irc: {
    send: (line: string) => void;
    msg: (target: string, text: string) => void;
    say: (text: string) => void;
    join: (channel: string) => void;
    part: (channel: string) => void;
    list: () => void;
  };
  /** The resolved runtime config (branding, features, server, …). */
  config: () => ReturnType<typeof getConfig>;
  // ── i18n ─────────────────────────────────────────────────────────────────
  i18n: {
    /** Current UI language code, e.g. 'es' or 'pt-BR'. */
    language: () => string;
    /** Translate an app locale key with optional {{interpolation}} — bundled
     *  plugins ship their strings as `plugins.*` keys in the app locales. */
    t: (key: string, opts?: Record<string, unknown>) => string;
    /** Pick from a `{ lang: text }` table by the current language (for
     *  self-contained third-party plugins that carry their own strings). */
    pick: (table: Record<string, string>) => string;
  };
  // ── theming ──────────────────────────────────────────────────────────────
  themes: { current: () => string; list: () => string[]; set: (t: string) => void };
  /** Register a runtime theme: injects `[data-theme="id"]{…vars}` and adds it to
   *  the theme picker. `vars` keys may omit the leading `--`. */
  addTheme: (id: string, spec: { name?: string; icon?: string; color?: string; vars?: Record<string, string>; css?: string }) => () => void;
  // ── namespaced persistence ───────────────────────────────────────────────
  storage: { get: <T>(key: string, fallback?: T) => T | undefined; set: (key: string, value: unknown) => void };
  // ── UI extension (named slots — see registry.ts) ─────────────────────────
  addUi: (slot: UiSlot, render: () => ReactNode) => () => void;
  /** Add a whole section to Settings (own nav entry + pane). */
  addSettingsSection: (opts: { label: string; icon?: string; render: () => ReactNode }) => () => void;
  /** Decorate every rendered message inline (e.g. a badge appended after the text). */
  addMessageDecorator: (render: (m: MessageInfo) => ReactNode) => () => void;
  /** Add a button to every message's hover action toolbar (next to reply/react). */
  addMessageAction: (render: (m: MessageInfo) => ReactNode) => () => void;
  /** Add a button to a user's profile/whois card (gets the target nick + a close()). */
  addUserAction: (render: (ctx: UserActionCtx) => ReactNode) => () => void;
  /** Hide messages from the chat display (return true to suppress). The plugin still
   *  receives them via on('raw'). Use for a service's machine-readable control lines. */
  addMessageFilter: (fn: (m: FilterableMessage) => boolean) => () => void;
  /** Register a slash command. Typing "/name a b" calls `run(['a','b'], 'a b')`;
   *  respond via `orbit.irc.say`/`orbit.notify`. Built-in commands take priority. */
  addCommand: (name: string, spec: { run: (args: string[], rest: string) => void; help?: string }) => () => void;
  /** Fire a desktop notification with the brand icon (asks permission once). */
  notify: (title: string, body?: string) => void;
  /** Register a global keyboard shortcut, e.g. "mod+shift+k" (mod = Cmd/Ctrl).
   *  Runs in the chat view; built-in shortcuts take priority. */
  addShortcut: (combo: string, run: (e: KeyboardEvent) => void) => () => void;
  /** Open a modal dialog: `render` fills the body, the core supplies the backdrop,
   *  title bar and close button. Returns a function that closes it. */
  modal: (render: () => ReactNode, opts?: { title?: string; wide?: boolean }) => () => void;
}

function makeApi(name: string): OrbitPluginApi {
  const ns = `orbit-plugin:${name}:`;
  return {
    name,
    version: __APP_VERSION__,
    commit: __GIT_COMMIT__,
    apiVersion: API_VERSION,
    React, ReactDOM, jsxRuntime: ReactJSXRuntime, Fragment: React.Fragment, h: React.createElement, html,
    log: (...a) => { if (pluginDebug()) console.log(`%c[plugin:${name}]`, 'color:#2ea043', ...a); },
    on: bus.on, once: bus.once, off: bus.off, emit: bus.emit,
    state: {
      active: () => activeStore().getState().active,
      nick: () => activeStore().getState().nick,
      account: () => activeStore().getState().account,
      buffers: () => Object.keys(activeStore().getState().buffers),
      get: () => activeStore().getState(),
    },
    irc: {
      send: (line) => activeStore().getState().client?.send(line),
      msg: (target, text) => activeStore().getState().client?.privmsg(target, text),
      say: (text) => activeStore().getState().sendInput(text),
      join: (channel) => { const s = activeStore().getState(); s.client?.join(channel); s.setActive(channel); },
      part: (channel) => activeStore().getState().client?.part(channel),
      list: () => activeStore().getState().client?.list(),
    },
    config: () => getConfig(),
    i18n: {
      language: () => i18n.language,
      t: (key, opts) => i18n.t(key, opts) as string,
      pick: (table) => {
        const l = i18n.language || 'en';
        return table[l] ?? table[l.split('-')[0]] ?? table.en ?? Object.values(table)[0] ?? '';
      },
    },
    themes: { current: getTheme, list: () => [...THEMES, ...listPluginThemes().map((p) => p.id)], set: setTheme },
    addTheme: (id, spec) => {
      const styleId = `orbit-theme-${id}`;
      let el = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!el) { el = document.createElement('style'); el.id = styleId; document.head.appendChild(el); }
      const vars = Object.entries(spec.vars || {}).map(([k, v]) => `${k.startsWith('--') ? k : '--' + k}:${v};`).join('');
      el.textContent = `[data-theme="${id}"]{${vars}}${spec.css || ''}`;
      const off = registerTheme({ id, name: spec.name || id, icon: spec.icon, color: spec.color });
      return () => { off(); el?.remove(); };
    },
    storage: {
      get: <T,>(key: string, fallback?: T) => {
        try { const v = localStorage.getItem(ns + key); return v === null ? fallback : (JSON.parse(v) as T); }
        catch { return fallback; }
      },
      set: (key, value) => { try { localStorage.setItem(ns + key, JSON.stringify(value)); } catch { /* quota */ } },
    },
    addUi: (slot, render) => usePluginRegistry.getState().addUi(slot, name, render),
    addSettingsSection: (opts) =>
      usePluginRegistry.getState().addUi('settings_section', name, opts.render, { label: opts.label, icon: opts.icon }),
    addMessageDecorator: (render) => usePluginRegistry.getState().addDecorator(name, render),
    addMessageAction: (render) => usePluginRegistry.getState().addAction(name, render),
    addUserAction: (render) => usePluginRegistry.getState().addUserAction(name, render),
    addMessageFilter: (fn) => usePluginRegistry.getState().addMessageFilter(name, fn),
    addCommand: (cmd, spec) => usePluginRegistry.getState().addCommand(name, cmd, spec.run, spec.help),
    notify: (title, body) => pluginNotify(title, body),
    addShortcut: (combo, run) => usePluginRegistry.getState().addShortcut(name, combo, run),
    modal: (render, opts) => usePluginRegistry.getState().openModal({ plugin: name, render, title: opts?.title, wide: opts?.wide }),
  };
}

// The global object plugins register against: Orbit.plugin('name', (orbit, log) => …)
export const Orbit = {
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
  apiVersion: API_VERSION,
  // Render primitives — compiled plugins externalize react/react-dom/jsx-runtime
  // to these (one shared React instance). See plugin-template/ + docs/PLUGINS.md.
  React, ReactDOM, jsxRuntime: ReactJSXRuntime, Fragment: React.Fragment, h: React.createElement, html,
  on: bus.on, once: bus.once, off: bus.off, emit: bus.emit,
  config: () => getConfig(),
  plugin(name: string, fn: (orbit: OrbitPluginApi, log: OrbitPluginApi['log']) => void): void {
    if (!name || typeof fn !== 'function') { console.error('[plugins] Orbit.plugin(name, fn) — bad arguments'); return; }
    if (registered.has(name)) { console.warn(`[plugins] "${name}" already registered — ignoring`); return; }
    const api = makeApi(name);
    registered.set(name, api);
    try { fn(api, api.log); api.log('loaded'); }
    catch (e) { console.error(`[plugins] "${name}" threw during init`, e); }
  },
};

export type OrbitGlobal = typeof Orbit;
