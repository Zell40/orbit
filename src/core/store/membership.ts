// Channel-membership sub-handler.
//
// The events that change who is in a channel: JOIN / PART / KICK / QUIT / NICK /
// CHGHOST / SETNAME. Each mutates the per-channel member maps (and, for our own
// JOIN/PART/KICK, the buffer + active window). Split out of handler.ts; the
// dispatcher calls handleMembership(msg, me) before its command switch.
import i18n from '../i18n';
import { desktopNotify, blip } from '@/platform/notify';
import { hostmask } from './text';
import { SERVER, canon, isChannelName, inQuietBatch } from './context';
import type { IrcMessage } from '../irc/types';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface MembershipDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  closedChannels: Set<string>;
  helpers: StoreHelpers;
}

export function makeMembership({ get, set, closedChannels, helpers }: MembershipDeps) {
  const { ensureBuffer, patchBuffer, dropBuffer, patchMemberEverywhere, patchWhois, sysLine } = helpers;

  // Handle a membership event (JOIN/PART/KICK/QUIT/NICK/CHGHOST/SETNAME) or a live
  // member-state notify (AWAY/ACCOUNT). Returns true when handled; `me` is the
  // client's current nick.
  function handleMembership(msg: IrcMessage, me: string): boolean {
    switch (msg.command) {
      case 'JOIN': {
        const ch = msg.params[0];
        if (msg.nick === me) closedChannels.delete(canon(ch)); // we're (re)joining → allow the buffer again
        ensureBuffer(ch);
        if (msg.nick === me) {
          patchBuffer(ch, (b) => ({ ...b, joined: true }));
          if (!isChannelName(get().active) || get().active === '') get().setActive(ch);
          // Pull full history (messages + JOIN/PART/KICK/MODE/TOPIC events via event-playback)
          // from m_ircv3_chathistory — the +H auto-replay only carries messages. Deduped by id.
          const cl = get().client;
          if (cl?.ircv3.hasCap('draft/chathistory')) cl.ircv3.chathistoryLatest(ch, 50);
        }
        // extended-join: ":nick JOIN #chan <account> :<realname>" — '*'/'0' = none.
        // Gives us account + realname up front, so no WHO needed for joiners.
        const joinAcct = msg.params[1] && msg.params[1] !== '*' && msg.params[1] !== '0' ? msg.params[1] : undefined;
        const joinReal = msg.params[2] || undefined;
        patchBuffer(ch, (b) => ({ ...b, members: { ...b.members, [msg.nick]: { nick: msg.nick, user: msg.user || undefined, host: msg.host || undefined, prefix: '', account: joinAcct, realname: joinReal } } }));
        if (msg.nick === me && joinReal) get().client?.setRealname(joinReal);
        // ZNC attach: no SASL 900 — our own extended-join carries the NickServ account.
        if (msg.nick === me && joinAcct) set({ account: joinAcct });
        if (!inQuietBatch(msg)) sysLine(ch, i18n.t('system.join', { nick: msg.nick }), 'join', msg.nick, hostmask(msg));
        return true;
      }
      case 'PART': {
        const ch = msg.params[0];
        patchBuffer(ch, (b) => {
          const members = { ...b.members }; delete members[msg.nick];
          // Self-part → no longer a member: clear `joined` so we stop firing
          // chathistory/typing on a channel we left (CHATHISTORY would FAIL).
          return { ...b, members, joined: msg.nick === me ? false : b.joined };
        });
        if (!inQuietBatch(msg)) sysLine(ch, i18n.t('system.part', { nick: msg.nick }), 'part', msg.nick, hostmask(msg));
        return true;
      }
      case 'KICK': {
        const ch = msg.params[0];
        const target = msg.params[1];
        const reason = msg.params[2] ?? '';
        if (target === me) {
          // We got kicked out. Tell the user, then close the salon and drop it
          // from the list (closedChannels stops a late stray line resurrecting it).
          const tail = reason ? ` (${reason})` : '';
          sysLine(SERVER, `${i18n.t('system.kickedFrom', { ch, by: msg.nick })}${tail}`, 'system');
          desktopNotify(i18n.t('system.kickedTitle', { ch }), `${i18n.t('system.kickedByNotif', { by: msg.nick })}${tail}`);
          if (get().prefs.sound) blip();
          closedChannels.add(canon(ch));
          dropBuffer(ch);
          set({ profileUser: '', kicked: { channel: ch, by: msg.nick, reason, kind: 'kick' } });
        } else {
          // Someone else was kicked — drop them from the member list + a notice.
          patchBuffer(ch, (b) => {
            const members = { ...b.members }; delete members[target];
            return { ...b, members };
          });
          sysLine(ch, i18n.t('system.kick', { target, by: msg.nick }) + (reason ? ` (${reason})` : ''), 'system');
        }
        return true;
      }
      case 'QUIT': {
        const s = get();
        for (const name of s.order) {
          if (s.buffers[name].members[msg.nick]) {
            patchBuffer(name, (b) => {
              const members = { ...b.members }; delete members[msg.nick];
              return { ...b, members };
            });
            if (!inQuietBatch(msg)) sysLine(name, i18n.t('system.quit', { nick: msg.nick }), 'quit', msg.nick, hostmask(msg));
          }
        }
        return true;
      }
      case 'NICK': {
        const nn = msg.params[0];
        if (msg.nick === me) set({ nick: nn });
        const s = get();
        for (const name of s.order) {
          const b = s.buffers[name];
          if (b.members[msg.nick]) {
            patchBuffer(name, (bb) => {
              const members = { ...bb.members };
              members[nn] = { ...members[msg.nick], nick: nn };
              delete members[msg.nick];
              return { ...bb, members };
            });
            sysLine(name, i18n.t('system.nick', { nick: msg.nick, newnick: nn }), 'nick');
          }
        }
        return true;
      }
      case 'CHGHOST': {
        // chghost: ":nick!olduser@oldhost CHGHOST <newuser> <newhost>" — the user's
        // ident/host changed. Update their user@host in every channel they share and
        // show an old→new system line (like MODE/TOPIC).
        const newUser = msg.params[0];
        const newHost = msg.params[1];
        const newId2 = `${newUser}@${newHost}`;
        const s = get();
        for (const name of s.order) {
          const m = s.buffers[name].members[msg.nick];
          if (!m) continue;
          // Prefer the member's tracked host as the "old" value; fall back to the
          // source prefix (which carries the pre-change user@host).
          const oldId = `${m.user || msg.user}@${m.host || msg.host}`;
          patchBuffer(name, (bb) => {
            const mm = bb.members[msg.nick];
            if (!mm) return bb;
            return { ...bb, members: { ...bb.members, [msg.nick]: { ...mm, user: newUser, host: newHost } } };
          });
          if (oldId !== newId2) sysLine(name, i18n.t('system.hostChange', { nick: msg.nick, old: oldId, new: newId2 }), 'system');
        }
        // Keep an open WHOIS/profile panel in sync.
        if (get().whois[msg.nick]) patchWhois(msg.nick, (w) => ({ ...w, user: newUser, host: newHost }));
        return true;
      }
      case 'SETNAME': {
        // setname: ":nick!user@host SETNAME :<new realname>" — live realname change.
        const newReal = msg.params[0] ?? '';
        const s = get();
        for (const name of s.order) {
          if (s.buffers[name].members[msg.nick]) {
            patchBuffer(name, (bb) => {
              const m = bb.members[msg.nick];
              if (!m) return bb;
              return { ...bb, members: { ...bb.members, [msg.nick]: { ...m, realname: newReal } } };
            });
          }
        }
        if (get().whois[msg.nick]) patchWhois(msg.nick, (w) => ({ ...w, realname: newReal }));
        // Keep connect opts in sync so the next WS reconnect's USER reuses ASL.
        if (msg.nick === me && newReal.trim()) get().client?.setRealname(newReal);
        return true;
      }
      case 'AWAY': {
        // away-notify: ":nick AWAY :<reason>" = away, ":nick AWAY" = back. Keeps
        // away state live in every common channel — no WHO poll needed.
        patchMemberEverywhere(msg.nick, { away: msg.params.length > 0 });
        return true;
      }
      case 'ACCOUNT': {
        // account-notify: ":nick ACCOUNT <account>" ('*' = logged out). Live account
        // = live avatar; no WHOX re-poll.
        const acct = msg.params[0];
        const account = acct && acct !== '*' ? acct : undefined;
        patchMemberEverywhere(msg.nick, { account });
        if (msg.nick === me) set({ account: account ?? '' });
        return true;
      }
      default:
        return false;
    }
  }

  return { handleMembership };
}
