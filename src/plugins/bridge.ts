// Bridges the app's state/IRC events onto the plugin event bus. Plugins subscribe
// via Orbit.on('connected' | 'buffer.active' | 'message' | 'raw' | 'status').
import { useChat } from '../store';
import type { IrcClient } from '../irc/client';
import { bus } from './bus';

let attached: IrcClient | null = null;

function attachClient(client: IrcClient): void {
  if (attached === client) return;
  attached = client;
  client.on('message', (...a: unknown[]) => {
    const msg = a[0] as { command: string; nick: string; params: string[] };
    bus.emit('raw', msg);
    if (msg.command === 'PRIVMSG') {
      bus.emit('message', {
        from: msg.nick,
        target: msg.params[0],
        text: msg.params[1] ?? '',
        self: msg.nick === useChat.getState().nick,
      });
    }
  });
}

export function startBridge(): void {
  const s0 = useChat.getState();
  if (s0.client) attachClient(s0.client);

  useChat.subscribe((s, prev) => {
    if (s.status !== prev.status) {
      bus.emit('status', s.status);
      if (s.status === 'registered') bus.emit('connected', { nick: s.nick });
    }
    if (s.active !== prev.active) bus.emit('buffer.active', s.active);
    if (s.client && s.client !== prev.client) attachClient(s.client);
  });

  bus.emit('ready');
}
