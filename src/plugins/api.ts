// The `window.Orbit` plugin API — the surface plugins register against.
//
// We deliberately expose only safe, stable capabilities (events, read-only
// state, IRC actions, theming, namespaced storage, named UI slots) and keep
// internal modules private so the app's still-evolving internals stay free to
// change. UI authoring uses HTM (htm.bind to the app's React) so plugins write
// template-literal markup at runtime, with no build step.
import React, { type ReactNode } from 'react';
import htm from 'htm';
import { useChat } from '../store';
import { getTheme, setTheme, type Theme } from '../ui/theme';
import { getConfig } from '../config';
import { bus } from './bus';
import { usePluginRegistry, type UiSlot } from './registry';

const html = htm.bind(React.createElement);
const THEMES: Theme[] = ['light', 'dark', 'orbit', 'orbit-dark', 'yomirc', 'yomirc-dark'];

const registered = new Map<string, OrbitPluginApi>();

export interface OrbitPluginApi {
  /** This plugin's name. */
  name: string;
  /** The app's React instance + render helpers (single instance — nodes interop). */
  React: typeof React;
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
  // ── theming ──────────────────────────────────────────────────────────────
  themes: { current: () => Theme; list: () => Theme[]; set: (t: Theme) => void };
  // ── namespaced persistence ───────────────────────────────────────────────
  storage: { get: <T>(key: string, fallback?: T) => T | undefined; set: (key: string, value: unknown) => void };
  // ── UI extension (named slots — see registry.ts) ─────────────────────────
  addUi: (slot: UiSlot, render: () => ReactNode) => () => void;
}

function makeApi(name: string): OrbitPluginApi {
  const ns = `orbit-plugin:${name}:`;
  return {
    name,
    React, h: React.createElement, html,
    log: (...a) => console.log(`%c[plugin:${name}]`, 'color:#2ea043', ...a),
    on: bus.on, once: bus.once, off: bus.off, emit: bus.emit,
    state: {
      active: () => useChat.getState().active,
      nick: () => useChat.getState().nick,
      account: () => useChat.getState().account,
      buffers: () => Object.keys(useChat.getState().buffers),
      get: () => useChat.getState(),
    },
    irc: {
      send: (line) => useChat.getState().client?.send(line),
      msg: (target, text) => useChat.getState().client?.privmsg(target, text),
      say: (text) => useChat.getState().sendInput(text),
      join: (channel) => { const s = useChat.getState(); s.client?.join(channel); s.setActive(channel); },
      part: (channel) => useChat.getState().client?.part(channel),
      list: () => useChat.getState().client?.list(),
    },
    themes: { current: getTheme, list: () => THEMES.slice(), set: setTheme },
    storage: {
      get: <T,>(key: string, fallback?: T) => {
        try { const v = localStorage.getItem(ns + key); return v === null ? fallback : (JSON.parse(v) as T); }
        catch { return fallback; }
      },
      set: (key, value) => { try { localStorage.setItem(ns + key, JSON.stringify(value)); } catch { /* quota */ } },
    },
    addUi: (slot, render) => usePluginRegistry.getState().addUi(slot, name, render),
  };
}

// The global object plugins register against: Orbit.plugin('name', (orbit, log) => …)
export const Orbit = {
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
  React, h: React.createElement, html,
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
