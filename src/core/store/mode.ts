// MODE sub-handler — user- and channel-mode changes.
//
// User modes: track our own umode string. Channel modes: apply membership grants
// (+o/+v/… → a member's held prefixes), keep the channel mode string current for
// flag/param modes, and render +b/-b as their own mIRC-style ban lines (with the
// present members each ban hits). Split out of handler.ts; the dispatcher calls
// handleMode(msg, me) before its command switch.
import i18n from '../i18n';
import { canon, isChannelName } from './context';
import { maskMatches } from './text';
import { buildModeContext, parseModeChanges, applyChannelFlag, applyUserModes } from '../irc/modes';
import type { IrcMessage } from '../irc/types';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface ModeDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  helpers: StoreHelpers;
}

export function makeMode({ get, set, helpers }: ModeDeps) {
  const { patchBuffer, sysLine, serverLine } = helpers;

  // Handle a MODE change. Returns true when it was one; `me` is our current nick.
  function handleMode(msg: IrcMessage, me: string): boolean {
    if (msg.command !== 'MODE') return false;
    const chan = msg.params[0];
    if (!isChannelName(chan)) {
      // User mode change. User modes are global per-user and take no params;
      // we only track our own (target === our nick).
      if (chan === me) {
        const change = msg.params[1] ?? '';
        const next = applyUserModes(get().umodes, change);
        set({ umodes: next });
        const named = change.replace(/[+-]/g, '').split('').map((c) => i18n.t(`umodes.${c}`, '')).filter(Boolean);
        serverLine(named.length
          ? i18n.t('system.yourModesNamed', { modes: next, change, names: named.join(', ') })
          : i18n.t('system.yourModes', { modes: next, change }), 'umode');
      }
      return true;
    }
    const client = get().client;
    const order = client?.server.prefixModes ?? '~&@%+';
    const ctx = buildModeContext(client?.server.isupport ?? {}, client?.server.prefixModeToChar ?? {});
    const changes = parseModeChanges(msg.params[1] ?? '', msg.params.slice(2), ctx);

    const banLines: string[] = []; // +b/-b shown as their own clear lines (like mIRC)
    let showCombined = false;      // any prefix/flag/param change → show the mode line

    for (const c of changes) {
      if (c.kind === 'prefix' && c.param && c.prefix) {
        // membership grant (+o/+v/…) → update that member's held prefixes
        showCombined = true;
        const sym = c.prefix;
        patchBuffer(chan, (b) => {
          const m = b.members[c.param!];
          if (!m) return b;
          const held = (m.prefixes ?? m.prefix ?? '').split('').filter((x) => x !== sym);
          if (c.add) held.push(sym);
          held.sort((a, z) => order.indexOf(a) - order.indexOf(z));
          const prefixes = held.join('');
          return { ...b, members: { ...b.members, [c.param!]: { ...m, prefixes, prefix: prefixes[0] ?? '' } } };
        });
      } else if (c.kind === 'list') {
        // type A list mode. A ban (+b/-b) gets its own clear lines + who it hits;
        // other list modes (+e/+I) ride along in the combined line.
        if (c.mode === 'b' && c.param) {
          const mask = c.param;
          banLines.push(c.add ? `🔨 ${i18n.t('system.banned', { nick: msg.nick, mask })}` : `♻️ ${i18n.t('system.unbanned', { nick: msg.nick, mask })}`);
          const members = get().buffers[canon(chan)]?.members ?? {};
          const hit = Object.values(members)
            .filter((m) => maskMatches(mask, `${m.nick}!${m.user || '*'}@${m.host || '*'}`))
            .map((m) => m.nick);
          if (hit.length) banLines.push(i18n.t(c.add ? 'system.bansAdded' : 'system.bansRemoved', { list: hit.join(', ') }));
        } else showCombined = true;
      } else {
        // type B/C param mode or type D flag → maintain the channel mode string
        showCombined = true;
        patchBuffer(chan, (b) => ({ ...b, ...applyChannelFlag(b.modes || '', b.modeParams || {}, c) }));
      }
    }

    for (const line of banLines) sysLine(chan, line, 'ban');
    // The combined mode line is shown for everything except a pure ban change
    // (those are already covered by the dedicated ban lines above).
    if (showCombined) {
      const argStr = msg.params.length > 2 ? ' ' + msg.params.slice(2).join(' ') : '';
      sysLine(chan, `${msg.params[1] ?? ''}${argStr}`, 'mode', msg.nick);
    }
    return true;
  }

  return { handleMode };
}
