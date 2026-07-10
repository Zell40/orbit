import i18n from '../i18n';
import { desktopNotify, blip } from '@/platform/notify';
import type { IrcMessage } from '../irc/types';
import { buildModeContext, parseModeChanges, applyChannelFlag, applyUserModes } from '../irc/modes';
import { SERVER, canon, isChannelName } from './context';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface NumericsDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  helpers: StoreHelpers;
  closedChannels: Set<string>;
  lastCantSend: Record<string, number>;
  lastAwayNotice: Record<string, number>;
  clearWhois: (nick: string) => void;
}

// Numerics that are handled elsewhere (this switch, switch-2 in handler.ts, or the
// client/server-info layer) and so must NOT be dumped by the generic fallback below.
const HANDLED_NUMERICS = new Set(['005', '332', '333', '353', '366', '396', '900', '901', '321', '322', '323', '354']);

// Numeric replies (RPL_*/ERR_*), split out of handler.ts. Returns true when the
// numeric was consumed. Every 3-digit reply is either handled by name here or
// routed by the generic fallback (errors → a ⚠ line where the user is looking,
// info → the server console), so nothing is ever dumped unlabelled.
export function makeNumerics({ get, set, helpers, closedChannels, lastCantSend, lastAwayNotice, clearWhois }: NumericsDeps) {
  const { ensureBuffer, patchBuffer, dropBuffer, sysLine, serverLine, patchWhois } = helpers;

  function handleNumerics(msg: IrcMessage): boolean {
    switch (msg.command) {
      case '301': { // RPL_AWAY: <me> <nick> :<away message>
        const who = msg.params[1];
        const reason = msg.params[2] || '';
        patchWhois(who, (w) => ({ ...w, away: reason }));
        // If we have a query open with them (i.e. we just messaged them), tell us
        // they're away — throttled so it isn't repeated on every line.
        const key = canon(who);
        if (get().buffers[key] && Date.now() - (lastAwayNotice[key] || 0) > 60000) {
          lastAwayNotice[key] = Date.now();
          sysLine(who, i18n.t('system.userAway', { who, reason: reason ? `: ${reason}` : '' }), 'info');
        }
        return true;
      }
      case '352': { // RPL_WHOREPLY: <me> <chan> <user> <host> <server> <nick> <flags> :<hop> <real>
        const chan = msg.params[1];
        const who = msg.params[5];
        const flags = msg.params[6] ?? '';
        if (isChannelName(chan)) {
          patchBuffer(chan, (b) => {
            const m = b.members[who];
            if (!m) return b;
            return { ...b, members: { ...b.members, [who]: { ...m, user: msg.params[2] || m.user, host: msg.params[3] || m.host, oper: flags.includes('*'), bot: flags.includes('B'), away: flags.startsWith('G') } } };
          });
        }
        return true;
      }
      case '354': { // RPL_WHOSPCRPL (WHOX): <me> <token> <chan> <nick> <flags> <account>
        if (msg.params[1] !== '152') break; // not our query
        const chan = msg.params[2];
        const who = msg.params[3];
        const flags = msg.params[4] ?? '';
        const account = msg.params[5] && msg.params[5] !== '0' ? msg.params[5] : undefined;
        if (isChannelName(chan)) {
          patchBuffer(chan, (b) => {
            const m = b.members[who];
            if (!m) return b;
            return { ...b, members: { ...b.members, [who]: { ...m, oper: flags.includes('*'), bot: flags.includes('B'), away: flags.startsWith('G'), account } } };
          });
        }
        return true;
      }
      case '315': // RPL_ENDOFWHO
        return true;
      case '366': { // RPL_ENDOFNAMES → pull WHO (oper/away flags) + the channel modes
        const chan = msg.params[1];
        if (isChannelName(chan)) { get().client?.who(chan); get().client?.send(`MODE ${chan}`); }
        return true;
      }
      case '324': { // RPL_CHANNELMODEIS: <me> <chan> <modes> [params…]
        const chan = msg.params[1];
        if (!isChannelName(chan)) return true;
        ensureBuffer(chan);
        // Parse the modes + their params (key/limit) the same way as a live MODE.
        const client = get().client;
        const ctx = buildModeContext(client?.server.isupport ?? {}, client?.server.prefixModeToChar ?? {});
        const changes = parseModeChanges(msg.params[2] ?? '', msg.params.slice(3), ctx);
        let modes = '', modeParams: Record<string, string> = {};
        for (const c of changes) {
          if (c.kind === 'param' || c.kind === 'flag') ({ modes, modeParams } = applyChannelFlag(modes, modeParams, c));
        }
        patchBuffer(chan, (b) => ({ ...b, modes, modeParams }));
        return true;
      }
      case '329': { // RPL_CREATIONTIME: <me> <chan> <unixtime> — store it, don't spam the console
        const chan = msg.params[1];
        const ts = Number(msg.params[2]) || 0;
        if (isChannelName(chan)) { ensureBuffer(chan); patchBuffer(chan, (b) => ({ ...b, createdAt: ts })); }
        return true;
      }
      case '321': // RPL_LISTSTART
        set({ channels: [], listLoading: true });
        return true;
      case '322': { // RPL_LIST: <me> <channel> <#users> :<topic>
        const name = msg.params[1];
        if (isChannelName(name)) {
          const entry = { name, users: Number(msg.params[2]) || 0, topic: (msg.params[3] || '').replace(/^\[\+[^\]]*\]\s*/, '') };
          const cur = get().channels;
          if (cur.length < 50000) set({ channels: [...cur, entry] }); // covers the largest real networks; caps a hostile stream
        }
        return true;
      }
      case '323': // RPL_LISTEND
        set({ listLoading: false });
        return true;
      case '900': // RPL_LOGGEDIN: <me> <nick!user@host> <account> :You are now logged in as …
        set({ account: msg.params[2] || '' });
        return true;
      case '901': // RPL_LOGGEDOUT
        set({ account: '' });
        return true;
      case '221': // RPL_UMODEIS: <me> <modestring> — our current user modes
        set({ umodes: applyUserModes('', msg.params[1] ?? '') });
        return true;
      case '004': // RPL_MYINFO: <me> <servername> … — the ircd's own hostname
        set({ serverName: msg.params[1] || get().serverName });
        return true;
      case '331': { // RPL_NOTOPIC
        const ch = msg.params[1];
        if (isChannelName(ch)) { ensureBuffer(ch); patchBuffer(ch, (b) => ({ ...b, topic: '' })); }
        return true;
      }
      case '333': { // RPL_TOPICWHOTIME: <me> <chan> <setter> <settime> — who set the topic + when
        const ch = msg.params[1];
        if (isChannelName(ch)) {
          ensureBuffer(ch);
          const by = msg.params[2] || ''; // nick!user@host on servers that record the full mask
          const at = Number(msg.params[3]) * 1000 || 0;
          patchBuffer(ch, (b) => ({ ...b, topicBy: by, topicAt: at }));
        }
        return true;
      }
      case '367': { // RPL_BANLIST: <me> <chan> <mask> [<who> <ts>] — collect into state
        const ch = msg.params[1];
        const mask = msg.params[2];
        if (isChannelName(ch) && mask) {
          const key = canon(ch);
          const entry = { mask, by: (msg.params[3] || '').split('!')[0], ts: Number(msg.params[4]) * 1000 || 0 };
          const cur = get().banlists[key] || [];
          if (cur.length < 5000) set({ banlists: { ...get().banlists, [key]: [...cur, entry] } }); // bound a flood of 367s
        }
        return true;
      }
      case '348':   // RPL_EXCEPTLIST (+e)
      case '346': { // RPL_INVEXLIST (+I) — collect into state for the channel panel
        const ch = msg.params[1];
        const mask = msg.params[2];
        if (isChannelName(ch) && mask) {
          const key = canon(ch);
          const entry = { mask, by: (msg.params[3] || '').split('!')[0], ts: Number(msg.params[4]) * 1000 || 0 };
          if (msg.command === '348') {
            const cur = get().exceptlists[key] || [];
            if (cur.length < 5000) set({ exceptlists: { ...get().exceptlists, [key]: [...cur, entry] } });
          } else {
            const cur = get().invexlists[key] || [];
            if (cur.length < 5000) set({ invexlists: { ...get().invexlists, [key]: [...cur, entry] } });
          }
        }
        return true;
      }
      case '368': // RPL_ENDOFBANLIST
      case '349': // RPL_ENDOFEXCEPTLIST
      case '347': // RPL_ENDOFINVEXLIST
      case '337': // RPL_ENDOFINVITELIST
        return true; // list terminators — nothing to show
      case '336': // RPL_INVITELIST (a channel you're invited to)
        if (msg.params[1]) serverLine(i18n.t('system.invitePending', { chan: msg.params[1] }));
        return true;
      case '341': // RPL_INVITING: <me> <nick> <channel> — confirm our invite was sent
        serverLine(i18n.t('system.inviteSent', { nick: msg.params[1], chan: msg.params[2] }));
        return true;
      case '305': // RPL_UNAWAY
        set({ away: false }); serverLine(i18n.t('system.awayOff'));
        return true;
      case '306': // RPL_NOWAWAY
        set({ away: true }); serverLine(i18n.t('system.awayOn'));
        return true;
      case '730': { // RPL_MONONLINE: <me> :<target>[,<target>…] came online
        const targets = (msg.params[1] || '').split(',').map((t) => t.split('!')[0]).filter(Boolean);
        if (!targets.length) return true;
        const online = { ...get().friendsOnline };
        for (const t of targets) {
          const wasOff = !online[t.toLowerCase()];
          online[t.toLowerCase()] = true;
          if (wasOff && get().friends.some((f) => f.toLowerCase() === t.toLowerCase())) {
            desktopNotify('Ami en ligne', `${t} vient de se connecter`);
            if (get().prefs.sound) blip();
          }
        }
        set({ friendsOnline: online });
        return true;
      }
      case '731': { // RPL_MONOFFLINE
        const targets = (msg.params[1] || '').split(',').map((t) => t.split('!')[0]).filter(Boolean);
        if (!targets.length) return true;
        const online = { ...get().friendsOnline };
        for (const t of targets) online[t.toLowerCase()] = false;
        set({ friendsOnline: online });
        return true;
      }
      case '732': // RPL_MONLIST
      case '733': // RPL_ENDOFMONLIST
        return true;
      case '401': { // ERR_NOSUCHNICK
        const nk = msg.params[1];
        const w = get().whois[nk];
        if (w) {
          // yomirc text WHOIS: print the miss to its window and drop the entry.
          if (w.printTo) { sysLine(w.printTo, `${nk} No such nick/channel`, 'info'); clearWhois(nk); return true; }
          // The user is offline — fall back to WHOWAS for their last-known info.
          if (get().profileUser === nk) { get().client?.whowas(nk); return true; }
          patchWhois(nk, (ww) => ({ ...ww, loading: false }));
          return true;
        }
        break;
      }
      case '404': { // ERR_CANNOTSENDTOCHAN: we tried to talk but we're banned / channel is moderated
        const ch = msg.params[1];
        if (!isChannelName(ch)) return true;
        const now = Date.now();
        if (now - (lastCantSend[ch] || 0) < 12000) return true; // already told them recently — don't spam
        lastCantSend[ch] = now;
        sysLine(ch, `⛔ ${i18n.t('system.cantWriteHere')}`, 'system');
        desktopNotify(i18n.t('system.cantWriteTitle', { ch }), i18n.t('system.cantWriteBody'));
        if (get().prefs.sound) blip();
        set({ kicked: { channel: ch, by: '', reason: '', kind: 'mute' } });
        return true;
      }
      case '474': { // ERR_BANNEDFROMCHAN: join refused — we're banned from the channel
        const ch = msg.params[1];
        if (!isChannelName(ch)) return true;
        sysLine(SERVER, i18n.t('system.bannedFrom', { ch }), 'system');
        desktopNotify(i18n.t('system.bannedTitle', { ch }), i18n.t('system.bannedBody'));
        if (get().prefs.sound) blip();
        closedChannels.add(canon(ch)); // a failed join may have opened a buffer — drop it
        dropBuffer(ch);
        set({ kicked: { channel: ch, by: '', reason: '', kind: 'ban' } });
        return true;
      }
    }

    // Every remaining numeric is recognised (see irc/numerics.ts) and routed:
    // errors → a visible ⚠ line where the user is looking; everything else →
    // the server console. Nothing is ever dumped unlabelled.
    if (/^\d{3}$/.test(msg.command) && !HANDLED_NUMERICS.has(msg.command)) {
      const code = msg.command;
      const numerics = get().client?.numerics;
      const serverText = msg.params.length > 1 ? msg.params[msg.params.length - 1] : '';
      if (numerics?.isError(code)) {
        const ctx = msg.params[1];
        const dest = ctx && isChannelName(ctx) && get().buffers[canon(ctx)] ? ctx
          : isChannelName(get().active) ? get().active : SERVER;
        sysLine(dest, `⚠️ ${i18n.t(`numerics.${code}`, '') || serverText}`, 'system');
        if (get().prefs.sound) blip();
        return true;
      }
      // Informational numeric → console. Tag unknown ones with their RPL name so
      // it's recognised rather than a bare number.
      const label = numerics?.name(code);
      serverLine(label && !serverText ? `[${label}]` : msg.params.slice(1).join(' '));
      return true;
    }

    return false;
  }

  return { handleNumerics };
}
