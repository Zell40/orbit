// Channel-membership sub-handler.
//
// The events that change who is in a channel: JOIN / PART / KICK / QUIT / NICK /
// CHGHOST / SETNAME. Each mutates the per-channel member maps (and, for our own
// JOIN/PART/KICK, the buffer + active window). Split out of handler.ts; the
// dispatcher calls handleMembership(msg, me) before its command switch.
import i18n from '../i18n';
import { desktopNotify, blip } from '@/platform/notify';
import { getConfig } from '@/core/config';
import { hostmask } from './text';
import { SERVER, canon, isChannelName, inQuietBatch, trackBufferMuteSync } from './context';
import { getExpectedBootChannels, normChan } from '../../lib/boot-ready';
import { forgetHistoryPrefetch, prefetchLatestHistory } from './history-prefetch';
import { unregisterPushOnAccountLogout, refreshPush } from '@/platform/push';
import { nickServSessionBusy } from './nickserv-info';
import { announcePmOnline, markPmPeerOffline, queryBufferKey } from './pm-presence';
import { findMemberKey } from './helpers';
import type { IrcMessage } from '../irc/types';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface MembershipDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  closedChannels: Set<string>;
  helpers: StoreHelpers;
  historyAsked: Set<string>;
}

export function makeMembership({ get, set, closedChannels, helpers, historyAsked }: MembershipDeps) {
  const { ensureBuffer, patchBuffer, dropBuffer, patchMemberEverywhere, patchWhois, sysLine, tsOf } = helpers;

  // Handle a membership event (JOIN/PART/KICK/QUIT/NICK/CHGHOST/SETNAME) or a live
  // member-state notify (AWAY/ACCOUNT). Returns true when handled; `me` is the
  // client's current nick.
  function handleMembership(msg: IrcMessage, me: string): boolean {
    switch (msg.command) {
      case 'JOIN': {
        const ch = msg.params[0];
        const self = !!me && canon(msg.nick) === canon(me);
        if (self) closedChannels.delete(canon(ch)); // we're (re)joining → allow the buffer again
        ensureBuffer(ch);
        if (self) {
          patchBuffer(ch, (b) => ({ ...b, joined: true, joinDenied: undefined, sessionJoinedAt: tsOf(msg) || Date.now() }));
          const want = (getExpectedBootChannels()[0] || '').trim();
          const denied = get().buffers[get().active]?.joinDenied;
          // Redirect ban (+b d:#dest:…): we do land in the destination, but focus
          // stays on the refused channel so its panel can say why — it carries the
          // button to jump here. This outranks the boot-channel rule below, which
          // would otherwise pull focus when the destination IS the asked-for channel.
          const stayOnDenied = !!denied?.redirectTo && canon(denied.redirectTo) === canon(ch);
          if (!stayOnDenied) {
            if (want) {
              // First URL/startup channel is the one to display. Ignore the
              // network autojoin (#EntreNous.chat) so it doesn't steal focus.
              if (normChan(ch) === normChan(want)) get().setActive(ch);
            } else if (!isChannelName(get().active) || get().active === '') {
              get().setActive(ch);
            }
          }
          // Pull full history (messages + KICK/MODE/TOPIC events via event-playback)
          // from m_ircv3_chathistory — the +H auto-replay only carries messages. Deduped by id.
          // Server autojoin can race ahead of CAP ACK; 366 retries if this no-ops.
          prefetchLatestHistory(get, historyAsked, ch);
          // Restore per-channel mute from the server (soju.im/muted → Web Push).
          // Guests have no persisted buffer prefs — skip the GET (avoids Status noise).
          if (get().account && get().client?.ircv3.fetchBufferMuted(ch)) trackBufferMuteSync(ch, 'get');
        }
        // extended-join: ":nick JOIN #chan <account> :<realname>" — '*'/'0' = none.
        // Gives us account + realname up front, so no WHO needed for joiners.
        const joinAcct = msg.params[1] && msg.params[1] !== '*' && msg.params[1] !== '0' ? msg.params[1] : undefined;
        const joinReal = msg.params[2] || undefined;
        patchBuffer(ch, (b) => {
          const members = { ...b.members };
          // Drop a case-variant ghost so QUIT/PART always find the same key later.
          const prev = findMemberKey(members, msg.nick);
          if (prev && prev !== msg.nick) delete members[prev];
          members[msg.nick] = {
            nick: msg.nick, user: msg.user || undefined, host: msg.host || undefined,
            prefix: '', account: joinAcct, realname: joinReal,
          };
          return { ...b, members };
        });
        if (self && joinReal) get().client?.setRealname(joinReal);
        // ZNC attach: no SASL 900 — our own extended-join carries the NickServ account.
        if (self && joinAcct) set({ account: joinAcct });
        const joinTs = tsOf(msg);
        const joinedAt = get().buffers[canon(ch)]?.sessionJoinedAt;
        if (!inQuietBatch(msg) && !(joinedAt && joinTs < joinedAt - 2500)) {
          sysLine(ch, i18n.t('system.join', { nick: msg.nick }), 'join', msg.nick, hostmask(msg), joinTs);
        }
        // Peer back on IRC while their PM is still open → CONNEXION in that query.
        if (!self && !inQuietBatch(msg)) announcePmOnline(get().buffers, sysLine, msg.nick, joinTs);
        return true;
      }
      case 'PART': {
        const ch = msg.params[0];
        const selfPart = !!me && canon(msg.nick) === canon(me);
        if (selfPart) forgetHistoryPrefetch(historyAsked, ch);
        patchBuffer(ch, (b) => {
          const members = { ...b.members };
          const mk = findMemberKey(members, msg.nick);
          if (mk) delete members[mk];
          // Self-part → no longer a member: clear `joined` so we stop firing
          // chathistory/typing on a channel we left (CHATHISTORY would FAIL).
          return { ...b, members, joined: selfPart ? false : b.joined };
        });
        const partTs = tsOf(msg);
        const partSince = get().buffers[canon(ch)]?.sessionJoinedAt;
        if (!inQuietBatch(msg) && !(partSince && partTs < partSince - 2500)) {
          const why = (msg.params[1] || '').trim();
          sysLine(ch, why
            ? `${i18n.t('system.part', { nick: msg.nick })} (${why})`
            : i18n.t('system.part', { nick: msg.nick }), 'part', msg.nick, hostmask(msg), partTs);
        }
        return true;
      }
      case 'KICK': {
        const ch = msg.params[0];
        const target = msg.params[1];
        const reason = msg.params[2] ?? '';
        if (target === me || (!!me && canon(target) === canon(me))) {
          // We got kicked out. Tell the user, then close the salon and drop it
          // from the list (closedChannels stops a late stray line resurrecting it).
          const tail = reason ? ` (${reason})` : '';
          sysLine(SERVER, `${i18n.t('system.kickedFrom', { ch, by: msg.nick })}${tail}`, 'system');
          desktopNotify(i18n.t('system.kickedTitle', { ch }), `${i18n.t('system.kickedByNotif', { by: msg.nick })}${tail}`);
          if (get().prefs.sound) blip();
          forgetHistoryPrefetch(historyAsked, ch);
          closedChannels.add(canon(ch));
          dropBuffer(ch);
          set({ profileUser: '', kicked: { channel: ch, by: msg.nick, reason, kind: 'kick' } });
        } else {
          // Someone else was kicked — drop them from the member list + a notice.
          patchBuffer(ch, (b) => {
            const members = { ...b.members };
            const mk = findMemberKey(members, target);
            if (mk) delete members[mk];
            return { ...b, members };
          });
          sysLine(ch, reason ? `${target}\n${reason}` : target, 'kick', msg.nick, '', tsOf(msg));
        }
        return true;
      }
      case 'QUIT': {
        const s = get();
        const quitTs = tsOf(msg);
        const why = (msg.params[0] || '').trim();
        const quitText = why
          ? `${i18n.t('system.quit', { nick: msg.nick })} (${why})`
          : i18n.t('system.quit', { nick: msg.nick });
        let quitInQuery = false;
        for (const name of s.order) {
          const mk = findMemberKey(s.buffers[name].members, msg.nick);
          if (!mk) continue;
          patchBuffer(name, (b) => {
            const members = { ...b.members }; delete members[mk];
            return { ...b, members };
          });
          const quitSince = s.buffers[name]?.sessionJoinedAt;
          if (!inQuietBatch(msg) && !(quitSince && quitTs < quitSince - 2500)) {
            sysLine(name, quitText, 'quit', msg.nick, hostmask(msg), quitTs);
            if (!s.buffers[name].isChannel) quitInQuery = true;
          }
        }
        // Open PM without a cached member entry still gets the QUIT line.
        const qKey = queryBufferKey(s.buffers, msg.nick);
        if (qKey && !quitInQuery && !inQuietBatch(msg)) {
          sysLine(qKey, quitText, 'quit', msg.nick, hostmask(msg), quitTs);
        }
        if (qKey) {
          markPmPeerOffline(msg.nick);
          s.client?.ircv3.monitor('+', msg.nick);
        }
        return true;
      }
      case 'NICK': {
        const nn = msg.params[0];
        if (msg.nick === me) {
          set({ nick: nn, nickError: null });
          // Keep IrcClient.nick in sync — MODE/WHOIS/queryUserModes use it.
          // Without this, RECOVER /nick leaves setUserModes targeting the ghost nick
          // (silent no-op, no Status error).
          const client = get().client;
          if (client && nn) client.nick = nn;
          // Keep the server's webpush device nick in sync so offline pushes follow /nick.
          const account = get().account;
          if (account && client && getConfig().features.push)
            void refreshPush(client, account);
          get().refreshNickRecoverOffer?.();
        }
        const s = get();
        for (const name of s.order) {
          const b = s.buffers[name];
          const mk = findMemberKey(b.members, msg.nick);
          if (!mk) continue;
          patchBuffer(name, (bb) => {
            const members = { ...bb.members };
            members[nn] = { ...members[mk], nick: nn };
            delete members[mk];
            return { ...bb, members };
          });
          sysLine(name, nn, 'nick', msg.nick, '', tsOf(msg));
        }
        return true;
      }
      case 'CHGHOST': {
        // chghost: ":nick!olduser@oldhost CHGHOST <newuser> <newhost>" — the user's
        // ident/host changed. Update their user@host in every channel they share and
        // show an old→new HOST callout (like NICK / MODE).
        const newUser = msg.params[0];
        const newHost = msg.params[1];
        const newId2 = `${newUser}@${newHost}`;
        const s = get();
        for (const name of s.order) {
          const mk = findMemberKey(s.buffers[name].members, msg.nick);
          if (!mk) continue;
          const m = s.buffers[name].members[mk];
          // Prefer the member's tracked host as the "old" value; fall back to the
          // source prefix (which carries the pre-change user@host).
          const oldId = `${m.user || msg.user}@${m.host || msg.host}`;
          patchBuffer(name, (bb) => {
            const mm = bb.members[mk];
            if (!mm) return bb;
            return { ...bb, members: { ...bb.members, [mk]: { ...mm, user: newUser, host: newHost } } };
          });
          if (oldId !== newId2) sysLine(name, `${oldId}\n${newId2}`, 'host', msg.nick, '', tsOf(msg));
        }
        // Keep an open WHOIS/profile panel in sync.
        if (get().whois[msg.nick]) patchWhois(msg.nick, (w) => ({ ...w, user: newUser, host: newHost }));
        if (me && canon(msg.nick) === canon(me)) set({ displayedHost: newHost });
        return true;
      }
      case 'SETNAME': {
        // setname: ":nick!user@host SETNAME :<new realname>" — live realname change.
        const newReal = msg.params[0] ?? '';
        const s = get();
        for (const name of s.order) {
          const mk = findMemberKey(s.buffers[name].members, msg.nick);
          if (!mk) continue;
          patchBuffer(name, (bb) => {
            const m = bb.members[mk];
            if (!m) return bb;
            return { ...bb, members: { ...bb.members, [mk]: { ...m, realname: newReal } } };
          });
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
        if (msg.nick === me) {
          const prev = get().account;
          const next = account ?? '';
          if (nickServSessionBusy()) {
            // anope.identify (JSON-RPC) can echo ACCOUNT * then ACCOUNT nick — do
            // not drop the session mid-login.
            if (next && next.toLowerCase() !== String(prev || '').toLowerCase()) {
              set({ account: next });
              get().refreshNickRecoverOffer?.();
            }
            return true;
          }
          if (prev && !next && get().client) void unregisterPushOnAccountLogout(get().client!, prev);
          if (prev && !next) void import('../resume').then((m) => m.clearSaslResume());
          set({ account: next });
          get().refreshNickRecoverOffer?.();
        }
        return true;
      }
      default:
        return false;
    }
  }

  return { handleMembership };
}
