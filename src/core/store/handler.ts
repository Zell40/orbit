import i18n from '../i18n';
import { desktopNotify, blip } from '@/platform/notify';
import { makeWhois } from './whois';
import { makeMembership } from './membership';
import { makeBatch } from './batch';
import { makeTagmsg } from './tagmsg';
import { makeMsgState } from './msgstate';
import { makeMessaging } from './messaging';
import { makeMode } from './mode';
import { makeNumerics } from './numerics';
import type { IrcMessage, Member, MessageKind } from '../irc/types';
import { hostmask } from './text';
import { modeStringWithoutBans, splitModeAndBans } from '@/lib/format-text';
import { SERVER, isupport, canon, isChannelName, openBatches, historyCollect, inHistoryBatch, takeBufferMuteSync, takeAnyPendingBufferMuteSync } from './context';
import { handleWebPushListMessage, failPushDeviceList, isPushDeviceListLoading, onWebPushServerAck } from '@/platform/push';
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
  namesInFlight: Set<string>;
  historyAsked: Set<string>;
  profileCache: Map<string, { realname?: string; account?: string }>;
  persistNs?: string;
}

// The IRC event -> state message handler, extracted from store.ts. Returns the
// `handle` function; the store wires it to client.on('message', handle).
export function makeHandler(ctx: HandlerCtx) {
  const { set, get, helpers, closedChannels, knownServices, lastCantSend, lastAwayNotice, filehost, namesInFlight, historyAsked, profileCache, persistNs = '' } = ctx;
  const { ensureBuffer, patchBuffer, tsOf, sysLine, serverLine, patchWhois } = helpers;

  // WHOIS/WHOWAS → the profile panel (and yomirc text WHOIS). See ./whois.
  const { handleWhois, clearWhois } = makeWhois({ get, set, patchWhois, sysLine, serverLine, persistNs });
  // Channel-membership events (JOIN/PART/KICK/QUIT/NICK/CHGHOST/SETNAME). See ./membership.
  const { handleMembership } = makeMembership({ get, set, closedChannels, helpers, historyAsked });
  // IRCv3 BATCH open/close (chathistory + multiline merge). See ./batch.
  const { handleBatch } = makeBatch({ get, set, helpers });
  // TAGMSG: typing indicators + reactions. See ./tagmsg.
  const { handleTagmsg } = makeTagmsg({ ensureBuffer, patchBuffer });
  // REDACT + MARKREAD: message redaction + read markers. See ./msgstate.
  const { handleMsgState } = makeMsgState({ ensureBuffer, patchBuffer });
  // PRIVMSG/NOTICE hot path (routing, services, notify, batch collection). See ./messaging.
  const { handleMessaging } = makeMessaging({ get, set, knownServices, filehost, helpers });
  // MODE changes (user + channel modes, prefixes, ban lists). See ./mode.
  const { handleMode } = makeMode({ get, set, helpers });
  // Numeric replies (RPL_*/ERR_*) + the generic error/console fallback. See ./numerics.
  const { handleNumerics } = makeNumerics({ get, set, helpers, closedChannels, lastCantSend, lastAwayNotice, clearWhois, namesInFlight, historyAsked, profileCache });

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
        else if (msg.command === 'KICK') { text = msg.params[2] ? `${msg.params[1]}\n${msg.params[2]}` : (msg.params[1] || ''); kind = 'kick'; }
        else if (msg.command === 'NICK') { text = msg.params[0] || ''; kind = 'nick'; }
        else if (msg.command === 'TOPIC') { text = msg.params[1] || ''; kind = 'topic'; }
        else if (msg.command === 'MODE') {
          // Split +b/-b out of historical MODE so they replay as BAN callouts,
          // matching live MODE handling (pure ban → no MODE line).
          const modes = msg.params[1] ?? '';
          const margs = msg.params.slice(2);
          const leftover = modeStringWithoutBans(modes, margs);
          const { bans } = splitModeAndBans(modes, margs);
          const ts = tsOf(msg);
          const batch = (historyCollect[epRef] ||= []);
          for (const g of bans) {
            const mask = g.target || '';
            batch.push({
              id: `${msg.tags['msgid'] || `evt:MODE:${ts}:${msg.nick}`}:b:${mask}`,
              bufferName: chan, from: msg.nick, text: `${g.add ? '+' : '-'} ${mask}`,
              ts, kind: 'ban', self: false,
            });
          }
          if (leftover) {
            batch.push({
              id: msg.tags['msgid'] || `evt:MODE:${ts}:${msg.nick}:${leftover}`,
              bufferName: chan, from: msg.nick, text: leftover,
              ts, kind: 'mode', self: false,
            });
          } else if (!bans.length) {
            const argStr = margs.length ? ' ' + margs.join(' ') : '';
            text = `${modes}${argStr}`; kind = 'mode';
          }
        }
        if (msg.command !== 'MODE' || text) {
          // Deterministic id so the same historical event dedups across re-fetches
          // (events carry no msgid, so newId() would duplicate them on every reconnect).
          const evId = msg.tags['msgid'] || `evt:${msg.command}:${tsOf(msg)}:${msg.nick}:${msg.params.join(',')}`;
          const evMask = ['JOIN', 'PART', 'QUIT'].includes(msg.command) ? hostmask(msg) : '';
          (historyCollect[epRef] ||= []).push({
            id: evId, bufferName: chan, from: msg.nick, text,
            ts: tsOf(msg), kind, self: false, mask: evMask || undefined,
          });
        }
      }
      return;
    }

    // WHOIS/WHOWAS numerics build the profile panel (see ./whois); every other
    // numeric reply (incl. the generic error/console fallback) is handled by
    // ./numerics. RPL_TOPIC (332) / RPL_NAMREPLY (353) are the exception — they
    // stay in the command switch below, after the membership/message handlers.
    if (handleWhois(msg)) return;
    if (handleNumerics(msg)) return;

    // Channel-membership events, BATCH, TAGMSG and REDACT/MARKREAD are handled first.
    if (handleMembership(msg, me)) return;
    if (handleBatch(msg)) return;
    if (handleTagmsg(msg, me)) return;
    if (handleMsgState(msg)) return;
    if (handleMessaging(msg, me)) return;
    if (handleMode(msg, me)) return;

    switch (msg.command) {
      case 'CAP': {
        // Only reached for a manual `cap ls` / `cap list` typed in the console
        // (client.ts forwards those post-registration) → list the caps in Status.
        const sub = (msg.params[1] || '').toUpperCase();
        const list = msg.params[msg.params[2] === '*' ? 3 : 2] ?? '';
        serverLine(`[CAP ${sub}] ${list}`, 'info');
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
      case 'WEBPUSH': {
        const sub = (msg.params[0] || '').toUpperCase();
        if (sub === 'DEVICE' || sub === 'END') handleWebPushListMessage(sub, msg.params.slice(1));
        // REGISTER is often async (test push first) — refresh the list when the server confirms.
        else if (sub === 'REGISTER' || sub === 'UNREGISTER') onWebPushServerAck(get().client);
        break;
      }
      case 'INVITE': {
        // :<nick> INVITE <target> <channel>
        const target = msg.params[0];
        const chan = msg.params[1] ?? '';
        if (target === me) {
          sysLine(SERVER, `\n${chan}`, 'invite', msg.nick);
          desktopNotify(i18n.t('system.inviteTitle'), i18n.t('system.inviteYou', { nick: msg.nick, chan }));
          if (get().prefs.sound) blip();
        } else if (isChannelName(chan) && get().buffers[canon(chan)]) {
          // invite-notify: someone invited another user to a channel we're in.
          sysLine(chan, target, 'invite', msg.nick);
        }
        break;
      }
      case 'TOPIC': { // :<nick> TOPIC <channel> :<new topic>
        const ch = msg.params[0];
        const topic = msg.params[1] ?? '';
        const setter = msg.host ? `${msg.nick}!${msg.user}@${msg.host}` : msg.nick;
        patchBuffer(ch, (b) => ({ ...b, topic, topicBy: setter, topicAt: Date.now() }));
        // text = the new topic ('' = removed); from = who changed it. Rendered as
        // a tagged "sujet" line (like the MODE line) by MsgList.
        sysLine(ch, topic, 'topic', msg.nick);
        break;
      }
      case '332': // RPL_TOPIC
        ensureBuffer(msg.params[1]);
        patchBuffer(msg.params[1], (b) => ({ ...b, topic: msg.params[2] ?? '' }));
        break;
      case '353': { // RPL_NAMREPLY
        const ch = msg.params[2];
        ensureBuffer(ch);
        const key = canon(ch);
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
          const cached = profileCache.get(canon(nick));
          adds[nick] = {
            nick, user, host, prefixes, prefix: prefixes[0] ?? '',
            ...(cached?.realname ? { realname: cached.realname } : {}),
            ...(cached?.account ? { account: cached.account } : {}),
          };
        }
        // First reply of a NAMES burst replaces (reconnect / /names); later lines merge.
        const replace = !namesInFlight.has(key);
        namesInFlight.add(key);
        patchBuffer(ch, (b) => ({ ...b, members: replace ? adds : { ...b.members, ...adds } }));
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
        // METADATA (SUB/GET/SYNC) failures are usually benign — except soju.im/muted
        // sync (Web Push sourdine), which we surface in Status.
        if (msg.command === 'FAIL' && cmd === 'METADATA') {
          const muteKey = msg.params.find((p) => p === 'soju.im/muted');
          if (muteKey) {
            let target = msg.params.find((p) => p.startsWith('#') || p.startsWith('&'));
            if (target) {
              takeBufferMuteSync(target);
            } else {
              const pending = takeAnyPendingBufferMuteSync();
              if (pending) {
                target = get().buffers[pending.canonKey]?.name ?? pending.canonKey;
              }
            }
            const reason = desc || code || 'FAIL';
            serverLine(i18n.t('metadata.muteSyncFail', {
              target: target || '?',
              reason,
            }), 'warning');
            if (code === 'KEY_INVALID' || code === 'INVALID_KEY' || code === 'KEY_NO_PERMISSION') {
              serverLine(i18n.t('metadata.muteSyncFailHint'), 'warning');
            }
          }
          break;
        }
        // MARKREAD / WEBPUSH are automatic and keyed to the NickServ account.
        // Guests (and the window before 900) get FAIL INTERNAL_ERROR / FORBIDDEN
        // — don't dump those into the channel the user is looking at.
        if (msg.command === 'FAIL' && (cmd === 'MARKREAD' || cmd === 'WEBPUSH')) {
          if (cmd === 'WEBPUSH') failPushDeviceList();
          break;
        }
        if (msg.command === 'NOTE' && (cmd === 'WEBPUSH' || (isPushDeviceListLoading() && desc.includes('WEBPUSH')))) {
          failPushDeviceList();
          break;
        }
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
