// Minimal ambient types for the Orbit plugin global. Hand-written for plugin
// authors; the host's full types live in Orbit's src/plugins/api.ts.
import type * as React from 'react';

type Handler = (...args: unknown[]) => void;

export interface OrbitPluginApi {
  name: string;
  version: string;
  commit: string;
  React: typeof React;
  on(event: string, fn: Handler): () => void;
  once(event: string, fn: Handler): () => void;
  off(event: string, fn: Handler): void;
  emit(event: string, ...args: unknown[]): void;
  state: {
    active(): string;
    nick(): string;
    account(): string;
    buffers(): string[];
    get(): unknown;
  };
  irc: {
    send(line: string): void;
    msg(target: string, text: string): void;
    say(text: string): void;
    join(channel: string): void;
    part(channel: string): void;
    list(): void;
  };
  themes: { current(): string; list(): string[]; set(theme: string): void };
  storage: { get<T>(key: string, fallback?: T): T | undefined; set(key: string, value: unknown): void };
  addUi(slot: 'composer_button', render: () => React.ReactNode): () => void;
  addSettingsSection(opts: { label: string; icon?: string; render: () => React.ReactNode }): () => void;
  log(...args: unknown[]): void;
}

declare global {
  const Orbit: {
    version: string;
    commit: string;
    React: typeof React;
    plugin(name: string, fn: (orbit: OrbitPluginApi, log: Handler) => void): void;
  };
}

export {};
