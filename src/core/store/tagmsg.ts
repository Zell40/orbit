// TAGMSG sub-handler — typing indicators, DM read receipts, and reactions.
// Split out of handler.ts as the first, cleanest slice of the messaging block;
// the dispatcher calls handleTagmsg(msg, me) before its command switch.
import { isChannelName } from './context';
import { isService } from '../services';
import type { IrcMessage } from '../irc/types';
import type { StoreHelpers } from './helpers';

interface TagmsgDeps {
  ensureBuffer: StoreHelpers['ensureBuffer'];
  patchBuffer: StoreHelpers['patchBuffer'];
}

export function makeTagmsg({ ensureBuffer, patchBuffer }: TagmsgDeps) {
  // Handle a TAGMSG (typing / reaction). Returns true when it was one; `me` is the
  // client's current nick.
  function handleTagmsg(msg: IrcMessage, me: string): boolean {
    if (msg.command !== 'TAGMSG') return false;
    const target = msg.params[0];
    const fromMe = msg.nick === me;

    // typing indicator (+typing client tag)
    const typing = msg.tags['+typing'] || msg.tags['+draft/typing'];
    if (typing && isChannelName(target) && !fromMe) {
      ensureBuffer(target);
      if (typing === 'done' || typing === 'paused') {
        patchBuffer(target, (b) => {
          const t = { ...b.typing }; delete t[msg.nick]; return { ...b, typing: t };
        });
      } else {
        const exp = Date.now() + 6000;
        patchBuffer(target, (b) => ({ ...b, typing: { ...b.typing, [msg.nick]: exp } }));
        setTimeout(() => patchBuffer(target, (b) => {
          if ((b.typing[msg.nick] ?? 0) <= Date.now()) {
            const t = { ...b.typing }; delete t[msg.nick]; return { ...b, typing: t };
          }
          return b;
        }), 6200);
      }
    }

    // DM read receipts (Orbit ↔ Orbit): peer displayed our messages up to `ts`.
    const displayed = msg.tags['+entrenous/displayed'];
    if (displayed && !fromMe && !isChannelName(target) && !isChannelName(msg.nick) && !isService(msg.nick)) {
      const t = Number(displayed);
      if (Number.isFinite(t) && t > 0) {
        ensureBuffer(msg.nick);
        patchBuffer(msg.nick, (b) => ({ ...b, peerReadTs: Math.max(b.peerReadTs || 0, t) }));
      }
    }

    // reactions (draft/react on a draft/reply target)
    const reply = msg.tags['+draft/reply'];
    const react = msg.tags['+draft/react'];
    // A react tag is a short emoji; drop absurdly long values a server might send.
    if (reply && react && react.length <= 32) {
      patchBuffer(target, (b) => ({
        ...b,
        messages: b.messages.map((m) => {
          if (m.id !== reply) return m;
          const reactions = [...(m.reactions ?? [])];
          const i = reactions.findIndex((r) => r.emoji === react);
          if (i === -1) {
            if (reactions.length >= 50) return m; // cap distinct reactions per message
            reactions.push({ emoji: react, count: 1, mine: fromMe });
          } else if (fromMe && reactions[i].mine) {
            // my second identical react = toggle off
            reactions[i] = { ...reactions[i], count: reactions[i].count - 1, mine: false };
            if (reactions[i].count <= 0) reactions.splice(i, 1);
          } else {
            reactions[i] = { ...reactions[i], count: reactions[i].count + 1, mine: reactions[i].mine || fromMe };
          }
          return { ...m, reactions };
        }),
      }));
    }
    return true;
  }

  return { handleTagmsg };
}
