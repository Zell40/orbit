// Bridges the app's state/IRC events onto the plugin event bus. Plugins subscribe
// via Orbit.on('connected' | 'buffer.active' | 'message' | 'raw' | 'status').
//
// Multi-network: plugins follow the ACTIVE network. Each network's client gets a
// relay attached once, but it only feeds the bus while its network is active — so
// switching networks re-points the plugin view. Single-network is unchanged (the
// active network is always the primary, so the gate is always true).
import { useNetworks, activeStore } from '../core/networks';
import type { IrcClient } from '../core/irc/client';
import { bus } from './bus';

const wired = new WeakSet<IrcClient>();

function attachClient(client: IrcClient): void {
  if (wired.has(client)) return;
  wired.add(client);
  client.on('message', (...a: unknown[]) => {
    if (activeStore().getState().client !== client) return; // not the active network — ignore
    const msg = a[0] as { command: string; nick: string; params: string[] };
    bus.emit('raw', msg);
    if (msg.command === 'PRIVMSG') {
      bus.emit('message', {
        from: msg.nick,
        target: msg.params[0],
        text: msg.params[1] ?? '',
        self: msg.nick === activeStore().getState().nick,
      });
    }
  });
}

export function startBridge(): void {
  let unsub = () => {};
  // (Re)bind the status / active-buffer / client relays to the ACTIVE network.
  function bind(): void {
    const store = activeStore();
    const c0 = store.getState().client;
    if (c0) attachClient(c0);
    unsub();
    unsub = store.subscribe((s, prev) => {
      if (s.status !== prev.status) {
        bus.emit('status', s.status);
        if (s.status === 'registered') bus.emit('connected', { nick: s.nick });
      }
      if (s.active !== prev.active) bus.emit('buffer.active', s.active);
      if (s.client && s.client !== prev.client) attachClient(s.client);
    });
  }
  bind();

  // On a network switch: re-bind to the new active store and tell plugins the
  // focus moved. (Single-network: activeId never changes, so this never fires.)
  useNetworks.subscribe((n, prev) => {
    if (n.activeId === prev.activeId) return;
    bind();
    const s = activeStore().getState();
    bus.emit('buffer.active', s.active);
    bus.emit('status', s.status);
  });

  bus.emit('ready');
}
