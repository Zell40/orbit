import i18n from '../i18n';
import { desktopNotify, blip } from '../../platform/notify';
import { makeWhois } from './whois';
import { makeMembership } from './membership';
import { makeBatch } from './batch';
import { makeTagmsg } from './tagmsg';
import { makeMsgState } from './msgstate';
import { makeMessaging } from './messaging';
import type { IrcMessage, Member, MessageKind } from '../irc/types';
import { NUMERICS, ERROR_NUMERICS } from '../irc/numerics';
import { buildModeContext, parseModeChanges, applyChannelFlag, applyUserModes } from '../irc/modes';
import { hostmask, maskMatches } from './text';
import { SERVER, isupport, canon, isChannelName, openBatches, historyCollect, inHistoryBatch } from './context';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface HandlerCtx {
  set: StoreApi<ChatState>['setState'];
  get: StoreApi<ChatState>['getState'];
  helpers: StoreHelpers;
  closedChannels: Set<string>;
  knownServices: Set<string>;
  lastCantSend: Record<string, number>;
  lastAwayNotice: Record<string, number>;
  filehost: { resolve: ((token: string) => void) | null; reject: ((err: Error) => void) | null; timer: ReturnType<typeof setTimeout> | null };
}

const HANDLED_NUMERICS = new Set(['005', '332', '333', '353', '366', '396', '366', '900', '901', '321', '322', '323', '354']);

// The IRC event -> state message handler, extracted from store.ts. Returns the
// `handle` function; the store wires it to client.on('message', handle).
export function makeHandler(ctx: HandlerCtx) {
  const { set, get, helpers, closedChannels, knownServices, lastCantSend, lastAwayNotice, filehost } = ctx;
  const { ensureBuffer, patchBuffer, dropBuffer, patchMemberEverywhere, tsOf, sysLine, serverLine, patchWhois } = helpers;

  // WHOIS/WHOWAS → the profile panel (and yomirc text WHOIS). See ./whois.
  const { handleWhois, clearWhois } = makeWhois({ get, set, patchWhois, sysLine });
  // Channel-membership events (JOIN/PART/KICK/QUIT/NICK/CHGHOST/SETNAME). See ./membership.
  const { handleMembership } = makeMembership({ get, set, closedChannels, helpers });
  // IRCv3 BATCH open/close (chathistory + multiline merge). See ./batch.
  const { handleBatch } = makeBatch({ get, set, helpers });
  // TAGMSG: typing indicators + reactions. See ./tagmsg.
  const { handleTagmsg } = makeTagmsg({ ensureBuffer, patchBuffer });
  // REDACT + MARKREAD: message redaction + read markers. See ./msgstate.
  const { handleMsgState } = makeMsgState({ ensureBuffer, patchBuffer });
  // PRIVMSG/NOTICE hot path (routing, services, notify, batch collection). See ./messaging.
  const { handleMessaging } = makeMessaging({ get, set, knownServices, filehost, helpers });

  // ---- IRC event -> state ------------------------------------------------
  function handle(msg: IrcMessage): void {
    const me = get().nick;
    // Keep CHANTYPES/CASEMAPPING/STATUSMSG current from the negotiated ISUPPORT.
    const cl = get().client;
    if (cl) { isupport.chanTypes = cl.server.chantypes; isupport.casemapping = cl.server.casemapping; isupport.statusPrefixes = cl.server.isupport['STATUSMSG'] || ''; }

    // draft/event-playback: a JOIN/PART/QUIT/KICK/NICK/TOPIC inside a chathistory
    // batch is HISTORICAL — collect it as a system line (prepended with the rest of
    // the history); never let it mutate live channel/member state.
    const epRef = inHistoryBatch(msg);
    if (epRef && ['JOIN', 'PART', 'QUIT', 'KICK', 'NICK', 'TOPIC', 'MODE'].includes(msg.command)) {
      const chan = openBatches[epRef].target;
      if (chan) {
        let text = '', kind: MessageKind = 'system';
        if (msg.command === 'JOIN') { text = i18n.t('system.join', { nick: msg.nick }); kind = 'join'; }
        else if (msg.command === 'PART') { text = i18n.t('system.part', { nick: msg.nick }); kind = 'part'; }
        else if (msg.command === 'QUIT') { text = i18n.t('system.quit', { nick: msg.nick }); kind = 'quit'; }
        else if (msg.command === 'KICK') { text = i18n.t('system.kick', { target: msg.params[1], by: msg.nick }); kind = 'system'; }
        else if (msg.command === 'NICK') { text = i18n.t('system.nick', { nick: msg.nick, newnick: msg.params[0] }); kind = 'nick'; }
        else if (msg.command === 'TOPIC') { text = msg.params[1] || ''; kind = 'topic'; }
        else if (msg.command === 'MODE') {
          const modestr = [msg.params[1], ...msg.params.slice(2)].filter(Boolean).join(' ');
          text = i18n.t('system.modes', { nick: msg.nick, modes: modestr }); kind = 'system';
        }
        // Deterministic id so the same historical event dedups across re-fetches
        // (events carry no msgid, so newId() would duplicate them on every reconnect).
        const evId = msg.tags['msgid'] || `evt:${msg.command}:${tsOf(msg)}:${msg.nick}:${msg.params.join(',')}`;
        const evMask = ['JOIN', 'PART', 'QUIT'].includes(msg.command) ? hostmask(msg) : '';
        (historyCollect[epRef] ||= []).push({
          id: evId, bufferName: chan, from: msg.nick, text,
          ts: tsOf(msg), kind, self: false, mask: evMask || undefined,
        });
      }
      return;
    }

    // WHOIS/WHOWAS numerics build the profile panel (see ./whois). RPL_AWAY (301)
    // stays below because it also drives the "user is away" query notice.
    if (handleWhois(msg)) return;

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
        return;
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
        return;
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
        return;
      }
      case '315': // RPL_ENDOFWHO
        return;
      case '366': { // RPL_ENDOFNAMES → pull WHO (oper/away flags) + the channel modes
        const chan = msg.params[1];
        if (isChannelName(chan)) { get().client?.who(chan); get().client?.send(`MODE ${chan}`); }
        return;
      }
      case '324': { // RPL_CHANNELMODEIS: <me> <chan> <modes> [params…]
        const chan = msg.params[1];
        if (!isChannelName(chan)) return;
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
        return;
      }
      case '329': { // RPL_CREATIONTIME: <me> <chan> <unixtime> — store it, don't spam the console
        const chan = msg.params[1];
        const ts = Number(msg.params[2]) || 0;
        if (isChannelName(chan)) { ensureBuffer(chan); patchBuffer(chan, (b) => ({ ...b, createdAt: ts })); }
        return;
      }
      case '321': // RPL_LISTSTART
        set({ channels: [], listLoading: true });
        return;
      case '322': { // RPL_LIST: <me> <channel> <#users> :<topic>
        const name = msg.params[1];
        if (isChannelName(name)) {
          const entry = { name, users: Number(msg.params[2]) || 0, topic: (msg.params[3] || '').replace(/^\[\+[^\]]*\]\s*/, '') };
          const cur = get().channels;
          if (cur.length < 50000) set({ channels: [...cur, entry] }); // covers the largest real networks; caps a hostile stream
        }
        return;
      }
      case '323': // RPL_LISTEND
        set({ listLoading: false });
        return;
      case '900': // RPL_LOGGEDIN: <me> <nick!user@host> <account> :You are now logged in as …
        set({ account: msg.params[2] || '' });
        return;
      case '901': // RPL_LOGGEDOUT
        set({ account: '' });
        return;
      case '221': // RPL_UMODEIS: <me> <modestring> — our current user modes
        set({ umodes: applyUserModes('', msg.params[1] ?? '') });
        return;
      case '004': // RPL_MYINFO: <me> <servername> … — the ircd's own hostname
        set({ serverName: msg.params[1] || get().serverName });
        return;
      case '331': { // RPL_NOTOPIC
        const ch = msg.params[1];
        if (isChannelName(ch)) { ensureBuffer(ch); patchBuffer(ch, (b) => ({ ...b, topic: '' })); }
        return;
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
        return;
      }
      case '348': // RPL_EXCEPTLIST
      case '346': { // RPL_INVEXLIST
        const ch = msg.params[1];
        const mask = msg.params[2];
        const tag = msg.command === '348' ? 'Exception' : 'Invitation';
        const who = msg.params[3] ? ` — par ${msg.params[3].split('!')[0]}` : '';
        if (isChannelName(ch) && mask) sysLine(ch, `📋 ${tag} : ${mask}${who}`, 'info');
        return;
      }
      case '368': // RPL_ENDOFBANLIST
      case '349': // RPL_ENDOFEXCEPTLIST
      case '347': // RPL_ENDOFINVEXLIST
      case '337': // RPL_ENDOFINVITELIST
        return; // list terminators — nothing to show
      case '336': // RPL_INVITELIST (a channel you're invited to)
        if (msg.params[1]) serverLine(i18n.t('system.invitePending', { chan: msg.params[1] }));
        return;
      case '341': // RPL_INVITING: <me> <nick> <channel> — confirm our invite was sent
        serverLine(i18n.t('system.inviteSent', { nick: msg.params[1], chan: msg.params[2] }));
        return;
      case '305': // RPL_UNAWAY
        set({ away: false }); serverLine(i18n.t('system.awayOff'));
        return;
      case '306': // RPL_NOWAWAY
        set({ away: true }); serverLine(i18n.t('system.awayOn'));
        return;
      case '730': { // RPL_MONONLINE: <me> :<target>[,<target>…] came online
        const targets = (msg.params[1] || '').split(',').map((t) => t.split('!')[0]).filter(Boolean);
        if (!targets.length) return;
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
        return;
      }
      case '731': { // RPL_MONOFFLINE
        const targets = (msg.params[1] || '').split(',').map((t) => t.split('!')[0]).filter(Boolean);
        if (!targets.length) return;
        const online = { ...get().friendsOnline };
        for (const t of targets) online[t.toLowerCase()] = false;
        set({ friendsOnline: online });
        return;
      }
      case '732': // RPL_MONLIST
      case '733': // RPL_ENDOFMONLIST
        return;
      case '401': { // ERR_NOSUCHNICK
        const nk = msg.params[1];
        const w = get().whois[nk];
        if (w) {
          // yomirc text WHOIS: print the miss to its window and drop the entry.
          if (w.printTo) { sysLine(w.printTo, `${nk} No such nick/channel`, 'info'); clearWhois(nk); return; }
          // The user is offline — fall back to WHOWAS for their last-known info.
          if (get().profileUser === nk) { get().client?.whowas(nk); return; }
          patchWhois(nk, (ww) => ({ ...ww, loading: false }));
          return;
        }
        break;
      }
      case '404': { // ERR_CANNOTSENDTOCHAN: we tried to talk but we're banned / channel is moderated
        const ch = msg.params[1];
        if (!isChannelName(ch)) return;
        const now = Date.now();
        if (now - (lastCantSend[ch] || 0) < 12000) return; // already told them recently — don't spam
        lastCantSend[ch] = now;
        sysLine(ch, `⛔ ${i18n.t('system.cantWriteHere')}`, 'system');
        desktopNotify(i18n.t('system.cantWriteTitle', { ch }), i18n.t('system.cantWriteBody'));
        if (get().prefs.sound) blip();
        set({ kicked: { channel: ch, by: '', reason: '', kind: 'mute' } });
        return;
      }
      case '474': { // ERR_BANNEDFROMCHAN: join refused — we're banned from the channel
        const ch = msg.params[1];
        if (!isChannelName(ch)) return;
        sysLine(SERVER, i18n.t('system.bannedFrom', { ch }), 'system');
        desktopNotify(i18n.t('system.bannedTitle', { ch }), i18n.t('system.bannedBody'));
        if (get().prefs.sound) blip();
        closedChannels.add(canon(ch)); // a failed join may have opened a buffer — drop it
        dropBuffer(ch);
        set({ kicked: { channel: ch, by: '', reason: '', kind: 'ban' } });
        return;
      }
    }

    // Every remaining numeric is recognised (see irc/numerics.ts) and routed:
    // errors → a visible ⚠ line where the user is looking; everything else →
    // the server console. Nothing is ever dumped unlabelled.
    if (/^\d{3}$/.test(msg.command) && !HANDLED_NUMERICS.has(msg.command)) {
      const code = msg.command;
      const serverText = msg.params.length > 1 ? msg.params[msg.params.length - 1] : '';
      if (ERROR_NUMERICS.has(code)) {
        const ctx = msg.params[1];
        const dest = ctx && isChannelName(ctx) && get().buffers[canon(ctx)] ? ctx
          : isChannelName(get().active) ? get().active : SERVER;
        sysLine(dest, `⚠️ ${i18n.t(`numerics.${code}`, '') || serverText}`, 'system');
        if (get().prefs.sound) blip();
        return;
      }
      // Informational numeric → console. Tag unknown ones with their RPL name so
      // it's recognised rather than a bare number.
      const label = NUMERICS[code];
      serverLine(label && !serverText ? `[${label}]` : msg.params.slice(1).join(' '));
      return;
    }

    // Channel-membership events, BATCH, TAGMSG and REDACT/MARKREAD are handled first.
    if (handleMembership(msg, me)) return;
    if (handleBatch(msg)) return;
    if (handleTagmsg(msg, me)) return;
    if (handleMsgState(msg)) return;
    if (handleMessaging(msg, me)) return;

    switch (msg.command) {
      case 'CAP': {
        // Only reached for a manual `cap ls` / `cap list` typed in the console
        // (client.ts forwards those post-registration) → list the caps in Status.
        const sub = (msg.params[1] || '').toUpperCase();
        const list = msg.params[msg.params[2] === '*' ? 3 : 2] ?? '';
        serverLine(`[CAP ${sub}] ${list}`);
        return;
      }
      case 'ERROR': { // server is closing the link — show why
        const reason = msg.params[msg.params.length - 1] || i18n.t('system.serverErrorDefault');
        sysLine(SERVER, `⛔ ${i18n.t('system.serverError', { reason })}`, 'system');
        set({ serverError: reason });
        break;
      }
      case 'WALLOPS': { // :src WALLOPS :message — network-wide oper broadcast
        sysLine(SERVER, `📣 ${i18n.t('system.wallops', { nick: msg.nick, msg: msg.params[0] ?? '' })}`, 'info');
        if (get().prefs.sound) blip();
        break;
      }
      case 'KILL': { // :src KILL <target> :reason
        if (msg.params[0] === me) {
          const reason = msg.params[1] || '';
          sysLine(SERVER, `⛔ ${i18n.t('system.killed', { nick: msg.nick })}${reason ? ` : ${reason}` : ''}`, 'system');
          desktopNotify(i18n.t('system.killedTitle'), i18n.t('system.killedBody', { nick: msg.nick }));
        }
        break;
      }
      case 'INVITE': {
        // :<nick> INVITE <target> <channel>
        const target = msg.params[0];
        const chan = msg.params[1] ?? '';
        if (target === me) {
          sysLine(SERVER, `📨 ${i18n.t('system.inviteYou', { nick: msg.nick, chan })}`, 'info');
          if (isChannelName(get().active)) sysLine(get().active, `📨 ${i18n.t('system.inviteYou', { nick: msg.nick, chan })}`, 'info');
          desktopNotify(i18n.t('system.inviteTitle'), i18n.t('system.inviteYou', { nick: msg.nick, chan }));
          if (get().prefs.sound) blip();
        } else if (isChannelName(chan) && get().buffers[canon(chan)]) {
          // invite-notify: someone invited another user to a channel we're in.
          sysLine(chan, `📨 ${i18n.t('system.inviteOther', { nick: msg.nick, target })}`, 'info');
        }
        break;
      }
      case 'AWAY': {
        // away-notify: ":nick AWAY :<reason>" = away, ":nick AWAY" = back. Keeps
        // away state live in every common channel — no WHO poll needed.
        patchMemberEverywhere(msg.nick, { away: msg.params.length > 0 });
        break;
      }
      case 'ACCOUNT': {
        // account-notify: ":nick ACCOUNT <account>" ('*' = logged out). Live account
        // = live avatar; no WHOX re-poll.
        const acct = msg.params[0];
        const account = acct && acct !== '*' ? acct : undefined;
        patchMemberEverywhere(msg.nick, { account });
        if (msg.nick === me) set({ account: account ?? '' });
        break;
      }
      case 'TOPIC': { // :<nick> TOPIC <channel> :<new topic>
        const ch = msg.params[0];
        const topic = msg.params[1] ?? '';
        patchBuffer(ch, (b) => ({ ...b, topic }));
        // text = the new topic ('' = removed); from = who changed it. Rendered as
        // a tagged "sujet" line (like the MODE line) by MsgList.
        sysLine(ch, topic, 'topic', msg.nick);
        break;
      }
      case 'MODE': {
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
              : i18n.t('system.yourModes', { modes: next, change }));
          }
          break;
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
        break;
      }
      case '332': // RPL_TOPIC
        ensureBuffer(msg.params[1]);
        patchBuffer(msg.params[1], (b) => ({ ...b, topic: msg.params[2] ?? '' }));
        break;
      case '353': { // RPL_NAMREPLY
        const ch = msg.params[2];
        ensureBuffer(ch);
        const prefixChars = get().client?.server.prefixModes ?? '@+';
        const adds: Record<string, Member> = {};
        for (const raw of (msg.params[3] ?? '').split(' ').filter(Boolean)) {
          let i = 0;
          while (i < raw.length && prefixChars.includes(raw[i])) i++;
          // userhost-in-names → token is prefix+nick!user@host; keep nick + user@host
          // (the user@host lets us tell who a ban mask hits).
          const full = raw.slice(i);
          const nick = full.split('!')[0];
          const bang = full.indexOf('!'), at = full.indexOf('@');
          const user = bang > -1 && at > bang ? full.slice(bang + 1, at) : undefined;
          const host = at > -1 ? full.slice(at + 1) : undefined;
          const prefixes = raw.slice(0, i); // all prefix symbols (multi-prefix), strongest-first
          adds[nick] = { nick, user, host, prefixes, prefix: prefixes[0] ?? '' };
        }
        patchBuffer(ch, (b) => ({ ...b, members: { ...b.members, ...adds } }));
        break;
      }
      // ---- draft/account-registration structured replies ----
      case 'REGISTER': { // :server REGISTER <sub> <account> :<message>
        const sub = msg.params[0];
        const message = msg.params[msg.params.length - 1] ?? '';
        if (sub === 'VERIFICATION_REQUIRED') {
          set({ reg: { step: 'code', account: get().reg.account || msg.params[1] || '', busy: false, error: '', info: message, challengeUrl: '' } });
        } else if (sub === 'SUCCESS') {
          set({ reg: { ...get().reg, step: 'done', busy: false, error: '', info: message } });
        }
        break;
      }
      case 'VERIFY': { // :server VERIFY <sub> <account> :<message>
        const sub = msg.params[0];
        const message = msg.params[msg.params.length - 1] ?? '';
        if (sub === 'SUCCESS') {
          set({ reg: { ...get().reg, step: 'done', busy: false, error: '', info: message } });
        }
        break;
      }
      // IRCv3 standard-replies: "<FAIL|WARN|NOTE> <command> <code> [<context>…] :<description>"
      case 'FAIL':
      case 'WARN':
      case 'NOTE': {
        const cmd = msg.params[0];
        const code = msg.params[1] || '';
        const desc = msg.params.length > 2 ? msg.params[msg.params.length - 1] : '';
        // REGISTER/VERIFY failures drive the account UI (not a console line).
        if (msg.command === 'FAIL' && (cmd === 'REGISTER' || cmd === 'VERIFY')) {
          set({ reg: { ...get().reg, busy: false, error: desc || 'Échec.' } });
          break;
        }
        // CHATHISTORY is an automatic client request (on-join replay / scroll-back),
        // never a user command — its failures (e.g. INVALID_TARGET after parting a
        // channel) are benign races, so don't surface them as a scary Status line.
        if (msg.command === 'FAIL' && cmd === 'CHATHISTORY') break;
        // Otherwise surface it where the user is looking: FAIL/WARN as a ⚠ line,
        // NOTE as an info callout. Label with the command + code when present.
        const tag = cmd && cmd !== '*' ? `${cmd}${code && code !== '*' ? ` (${code})` : ''} — ` : '';
        const dest = isChannelName(get().active) ? get().active : SERVER;
        if (msg.command === 'NOTE') {
          sysLine(dest, `ℹ️ ${tag}${desc}`, 'info');
        } else {
          sysLine(dest, `⚠️ ${tag}${desc}`, 'system');
          if (msg.command === 'FAIL' && get().prefs.sound) blip();
        }
        break;
      }
    }
  }
  return handle;
}
