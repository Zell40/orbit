// IRCv3 BATCH sub-handler.
//
// Opens/closes server batches and merges what the other handlers collected into
// them: a `chathistory` batch's messages are prepended as older history (deduped
// against what's already shown), and a `draft/multiline` batch's lines become one
// message. netsplit/netjoin batches just drop a quiet marker. The per-batch
// collectors live in ./context (written by the PRIVMSG + event-playback paths);
// this handler drains them on BATCH close.
import i18n from '../i18n';
import { canon, openBatches, historyCollect, multilineCollect } from './context';
import type { ChatMessage, IrcMessage } from '../irc/types';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface BatchDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  helpers: StoreHelpers;
}

export function makeBatch({ get, set, helpers }: BatchDeps) {
  const { msgSig, sameReplayEvent, patchBuffer, addMessage, serverLine } = helpers;

  // Handle a BATCH open/close. Returns true when it was a BATCH.
  function handleBatch(msg: IrcMessage): boolean {
    if (msg.command !== 'BATCH') return false;
    // :src BATCH +<ref> <type> [params…]  /  :src BATCH -<ref>
    const ref = msg.params[0] || '';
    const id = ref.slice(1);
    if (ref[0] === '+') {
      if (Object.keys(openBatches).length >= 64) return true; // bound server-opened batches
      const type = msg.params[1] || '';
      // chathistory replays old messages → collect+prepend, don't append live.
      const quiet = type === 'netsplit' || type === 'netjoin';
      openBatches[id] = { type, quiet, target: msg.params[2] };
      if (type === 'chathistory') historyCollect[id] = [];
      else if (type === 'netsplit') serverLine(`📡 ${i18n.t('system.netsplit')}`, 'info');
      else if (type === 'netjoin') serverLine(`📡 ${i18n.t('system.netjoin')}`, 'info');
    } else if (ref[0] === '-') {
      const b = openBatches[id];
      if (b?.type === 'chathistory' && b.target) {
        const items = historyCollect[id] || [];
        const key = canon(b.target);
        // Prepend older messages, keep buffer ordered oldest→newest.
        // Dedup by id AND by a content signature: the legacy +H auto-replay and
        // our CHATHISTORY response deliver the SAME message with different ids
        // (+H carries no msgid → random id; CHATHISTORY carries the real msgid),
        // so id-only dedup would double every recent message. The signature
        // (kind+sender+second+text) matches them since both preserve the original
        // server-time and text.
        patchBuffer(b.target, (buf) => {
          const base = [...buf.messages];
          const sigIdx = new Map<string, number>();
          base.forEach((m, i) => sigIdx.set(msgSig(m), i));
          const haveId = new Set(base.map((m) => m.id));
          const seen = new Set<string>();
          const fresh: ChatMessage[] = [];
          for (const m of items) {
            const sig = msgSig(m);
            let at = sigIdx.get(sig);
            if (at === undefined) {
              const loose = base.findIndex((x) => sameReplayEvent(x, m));
              if (loose !== -1) at = loose;
            }
            if (at !== undefined) {
              // Same message already present (other replay source). Upgrade it to
              // the copy that carries the real msgid so REDACT/react target it.
              if (m.msgid && !base[at].msgid) base[at] = { ...base[at], id: m.id, msgid: m.msgid };
              else if (m.ts < base[at].ts) base[at] = { ...base[at], ts: m.ts };
              continue;
            }
            if (haveId.has(m.id) || seen.has(sig)) continue;
            seen.add(sig);
            fresh.push(m);
          }
          const merged = [...fresh, ...base].sort((a, z) => a.ts - z.ts);
          return { ...buf, messages: merged.slice(-1000) };
        });
        set({
          historyLoading: { ...get().historyLoading, [key]: false },
          historyDone: { ...get().historyDone, [key]: items.length === 0 },
        });
        delete historyCollect[id];
      } else if (b?.type === 'draft/multiline' && multilineCollect[id]) {
        // Merge the batch's lines into ONE message (concat = no newline).
        const { base, lines } = multilineCollect[id];
        if (lines.length) {
          let merged = lines[0].text;
          for (let i = 1; i < lines.length; i++) merged += (lines[i].concat ? '' : '\n') + lines[i].text;
          addMessage(base.bufferName, { ...base, text: merged });
        }
        delete multilineCollect[id];
      }
      delete openBatches[id];
    }
    return true;
  }

  return { handleBatch };
}
