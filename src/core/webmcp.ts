// WebMCP (developer.chrome.com/docs/ai/webmcp): expose the chat as structured tools
// for an AI agent when the browser supports it. Progressive enhancement — a no-op
// where document.modelContext is absent. Gated by features.webmcp.
import { activeStore } from './networks';
import { getConfig } from './config';
import { SERVER } from './store';

interface ModelContext {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: unknown;
    execute: (args: Record<string, unknown>) => Promise<string> | string;
    annotations?: Record<string, unknown>;
  }): Promise<unknown>;
}

export function initWebMcp(): void {
  const mc = (document as unknown as { modelContext?: ModelContext }).modelContext;
  if (!mc?.registerTool || !getConfig().features.webmcp) return;

  const state = () => activeStore().getState();
  const chan = (c: string) => (/^[#&]/.test(c) ? c : `#${c}`);

  const tools: Parameters<ModelContext['registerTool']>[0][] = [
    {
      name: 'list_conversations',
      description: 'List the open IRC channels and direct messages, with which one is active and each unread count.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const s = state();
        return JSON.stringify(Object.values(s.buffers).map((b) => ({
          name: b.name,
          kind: b.name === SERVER ? 'console' : b.isChannel ? 'channel' : 'dm',
          active: b.name === s.active,
          unread: b.unread,
        })));
      },
    },
    {
      name: 'read_messages',
      description: 'Read the most recent messages from a conversation. Omit "conversation" to read the active one.',
      inputSchema: {
        type: 'object',
        properties: {
          conversation: { type: 'string', description: 'channel (#name) or nick; omit for the active conversation' },
          limit: { type: 'number', description: 'how many recent messages (default 30, max 100)' },
        },
      },
      annotations: { readOnlyHint: true },
      execute: (a) => {
        const s = state();
        const b = s.buffers[(a.conversation as string) || s.active];
        if (!b) return 'No such conversation.';
        const n = Math.min(Number(a.limit) || 30, 100);
        const out = b.messages.slice(-n).map((m) => {
          const t = new Date(m.ts).toISOString().slice(11, 16);
          return m.from ? `[${t}] <${m.from}> ${m.text}` : `[${t}] * ${m.text}`;
        });
        return out.join('\n') || '(no messages yet)';
      },
    },
    {
      name: 'send_message',
      description: 'Send a chat message to a channel or user.',
      inputSchema: {
        type: 'object',
        properties: {
          conversation: { type: 'string', description: 'channel (#name) or nick; omit for the active conversation' },
          text: { type: 'string' },
        },
        required: ['text'],
      },
      execute: (a) => {
        const s = state();
        const target = (a.conversation as string) || s.active;
        if (!target || target === SERVER) return 'No channel or user to send to.';
        s.client?.privmsg(target, String(a.text ?? ''));
        return `Sent to ${target}.`;
      },
    },
    {
      name: 'join_channel',
      description: 'Join an IRC channel and make it active.',
      inputSchema: { type: 'object', properties: { channel: { type: 'string' } }, required: ['channel'] },
      execute: (a) => {
        const c = chan(String(a.channel));
        const s = state();
        s.client?.join(c);
        s.setActive(c);
        return `Joined ${c}.`;
      },
    },
    {
      name: 'switch_conversation',
      description: 'Make an already-open channel or DM the active conversation.',
      inputSchema: { type: 'object', properties: { conversation: { type: 'string' } }, required: ['conversation'] },
      execute: (a) => {
        const name = String(a.conversation);
        if (!state().buffers[name]) return 'No such conversation.';
        state().setActive(name);
        return `Now on ${name}.`;
      },
    },
    {
      name: 'list_members',
      description: 'List the members of a channel (defaults to the active one).',
      inputSchema: { type: 'object', properties: { channel: { type: 'string' } } },
      annotations: { readOnlyHint: true },
      execute: (a) => {
        const s = state();
        const b = s.buffers[(a.channel as string) || s.active];
        if (!b?.isChannel) return 'Not a channel.';
        return Object.values(b.members).map((m) => (m.prefix || '') + m.nick).join(', ') || '(no members)';
      },
    },
  ];

  for (const t of tools) { try { void mc.registerTool(t); } catch { /* ignore */ } }
}
