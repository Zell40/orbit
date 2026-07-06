// REDACT + MARKREAD sub-handler.
//
// Two small server-driven updates to per-message / per-buffer state:
//   * draft/message-redaction (REDACT) marks a message as deleted, and
//   * draft/read-marker (MARKREAD) advances a channel's read position.
// Split out of handler.ts; the dispatcher calls handleMsgState(msg) before its
// command switch.
import type { IrcMessage } from '../irc/types';
import type { StoreHelpers } from './helpers';

interface MsgStateDeps {
  ensureBuffer: StoreHelpers['ensureBuffer'];
  patchBuffer: StoreHelpers['patchBuffer'];
}

export function makeMsgState({ ensureBuffer, patchBuffer }: MsgStateDeps) {
  function handleMsgState(msg: IrcMessage): boolean {
    switch (msg.command) {
      case 'REDACT': {
        const ch = msg.params[0];
        const id = msg.params[1];
        patchBuffer(ch, (b) => ({
          ...b,
          messages: b.messages.map((m) => (m.id === id ? { ...m, redacted: true } : m)),
        }));
        return true;
      }
      case 'MARKREAD': {
        const ch = msg.params[0];
        const arg = msg.params[1] ?? '';
        ensureBuffer(ch);
        if (arg.startsWith('timestamp=')) {
          const t = Date.parse(arg.slice('timestamp='.length));
          if (!Number.isNaN(t)) patchBuffer(ch, (b) => ({ ...b, readTs: t }));
        }
        return true;
      }
      default:
        return false;
    }
  }
  return { handleMsgState };
}
