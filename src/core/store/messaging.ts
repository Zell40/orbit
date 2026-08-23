// PRIVMSG / NOTICE sub-handler — the messaging hot path.
//
// Turns an incoming message/notice into a chat line: server-notice + FILEHOST +
// Cloudflare-challenge special-casing, client-side ignore, plugin message
// filters, CTCP ACTION, host/status-mask routing, services routing (so a *Serv
// PM never opens a query), channel-context, chathistory/multiline batch
// collection, and mention/notify. Split out of handler.ts; the dispatcher calls
// handleMessaging(msg, me) before its command switch.
import i18n from '../i18n';
import { desktopNotify, blip } from '@/platform/notify';
import { usePluginRegistry } from '@/modules/registry';
import { getConfig } from '../config';
import { isService, isNickServ, maskSecret, routeMessage, hasServiceTag, shouldPopupNickServ } from '../services';
import { SERVER, newId, isupport, canon, isChannelName, historyCollect, multilineCollect, inHistoryBatch, inMultilineBatch } from './context';
import { resolveNoticeDest, noticeIsChannelEcho } from './notices';
import type { ChatMessage, IrcMessage, MessageKind } from '../irc/types';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

// Real networks have a handful of services; the cap only bites a server minting
// endless fake service-tagged nicks to grow the learned set without bound.
const KNOWN_SERVICES_CAP = 256;

/** Client tags plugins may read (skip tags already mapped to first-class fields). */
function clientTagsForPlugins(tags: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (!k.startsWith('+')) continue;
    if (k === '+draft/reply' || k === '+draft/channel-context') continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

interface MessagingDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  knownServices: Set<string>;
  filehost: { resolve: ((token: string) => void) | null; reject: ((err: Error) => void) | null; timer: ReturnType<typeof setTimeout> | null };
  helpers: StoreHelpers;
}

export function makeMessaging({ get, set, knownServices, filehost, helpers }: MessagingDeps) {
  const { addMessage, patchBuffer, serverLine, tsOf } = helpers;

  // Handle a PRIVMSG/NOTICE. Returns true when it was one (and handled). `me` is
  // the client's current nick.
  function handleMessaging(msg: IrcMessage, me: string): boolean {
    if (msg.command !== 'PRIVMSG' && msg.command !== 'NOTICE') return false;
    const target = msg.params[0];
    let text = msg.params[1] ?? '';
    const self = msg.nick === me;

    // FILEHOST token / help — may arrive as a bare server NOTICE *or* from a
    // services-looking nick!user@host. Always intercept before normal routing so
    // an in-flight upload never times out waiting for a swallowed/misrouted line.
    if (msg.command === 'NOTICE' && /FILEHOST|file hosting|\/upload\?[^ \t]*token=/i.test(text)) {
      if (filehost.resolve) {
        const tok = text.match(/[?&]token=([A-Za-z0-9._\-]+)/);
        if (tok) {
          if (filehost.timer) clearTimeout(filehost.timer);
          const r = filehost.resolve; filehost.resolve = null; filehost.reject = null;
          r(tok[1]);
        } else if (/must be logged in|not (logged|identif|authentic)/i.test(text)) {
          if (filehost.timer) clearTimeout(filehost.timer);
          const rj = filehost.reject; filehost.resolve = null; filehost.reject = null;
          rj?.(new Error('not_identified'));
        }
      }
      return true; // swallow all FILEHOST service notices
    }

    // Server-originated NOTICE (no user@host, or to "*") → Server console,
    // styled as an info callout.
    if (msg.command === 'NOTICE' && (target === '*' || !msg.user)) {
      // Cloudflare/Turnstile anti-bot gate during REGISTER → surface it in the
      // account UI instead of dumping the raw challenge link in the console.
      const inReg = get().reg.busy || !!get().reg.challengeUrl;
      const challenge = text.match(/(https?:\/\/\S+\/cloudflare\/verify\/\S+)/i);
      if (challenge && /ctx=register/i.test(challenge[1])) {
        set({ reg: { ...get().reg, step: 'code', busy: false, error: '', challengeUrl: challenge[1],
          info: i18n.t('reg.antibotInfo') } });
        return true; // swallow — shown as a button in the Connexion tab
      }
      if (inReg && /défi anti-robot|code de vérification vous sera envoyé/i.test(text)) {
        return true; // swallow the companion turnstile lines
      }
      serverLine(text, 'info');
      return true;
    }
    // Client-side ignore: drop messages from ignored nicks (not our own).
    if (!self && msg.nick) {
      const lc = msg.nick.toLowerCase();
      if (get().ignored.some((n) => n.toLowerCase() === lc)) return true;
    }
    // Plugin message filters: a plugin can hide a message from the chat
    // display (e.g. a service's machine-readable control lines). The plugin
    // still receives it via on('raw').
    const mfilters = usePluginRegistry.getState().messageFilters;
    // A plugin filter that throws must not abort handling of the message.
    const filtered = mfilters.some((f) => {
      try { return f.fn({ nick: msg.nick || '', command: msg.command, target, text, tags: clientTagsForPlugins(msg.tags) }); }
      catch (e) { console.error('[plugins] message filter threw', e); return false; }
    });
    if (filtered) return true;
    let kind: MessageKind = msg.command === 'NOTICE' ? 'notice' : 'privmsg';
    // CTCP ACTION
    if (text.startsWith('\x01ACTION ') && text.endsWith('\x01')) {
      text = text.slice(8, -1);
      kind = 'action';
    } else if (text.startsWith('\x01') && text.endsWith('\x01')) {
      return true; // other CTCP — ignore for now
    }
    // Host/server-mask broadcast ("$$host" / "$#server", oper-only on send):
    // we may RECEIVE one if it matches us. Show it on the console as a clear
    // server-wide broadcast rather than a confusing private message.
    if (target && target[0] === '$') {
      serverLine(`📢 Diffusion de ${msg.nick} (${target}) : ${text}`, 'info');
      return true;
    }
    // STATUSMSG: a target like "@#chan" / "+#chan" addresses only members at
    // that status. Strip the prefix, route to the channel, and tag the line.
    let chanTarget = target;
    let statusTag = '';
    if (target && isupport.statusPrefixes.includes(target[0]) && isChannelName(target.slice(1))) {
      const lvl = target[0];
      chanTarget = target.slice(1);
      statusTag = lvl === '+' ? '🔉 voix+ · ' : lvl === '%' ? '🛡 halfops+ · ' : '🔒 ops · ';
    }
    // The report service (ReportServ) is not a conversation: route both our own
    // "REPORT …" command echo and its replies to the Status window, so filing a
    // report never spawns a ReportServ PM buffer.
    const reportSvc = (getConfig().report.service || '').toLowerCase();
    const otherParty = (self ? chanTarget : msg.nick) || '';
    const isChan = isChannelName(chanTarget);
    const toReportSvc = !!reportSvc && !isChan && otherParty.toLowerCase() === reportSvc;
    // Some ircds tag anything from a U-lined services pseudo-client,
    // delivered on the message-tags cap — authoritative and name-agnostic. Remember
    // the nick so our own later messages to it (which carry no tag) route the same,
    // and fall back to the *Serv name convention when neither tag nor memory apply.
    if (!self && hasServiceTag(msg.tags) && msg.nick && knownServices.size < KNOWN_SERVICES_CAP) knownServices.add(canon(msg.nick));
    const svcParty = !isChan && !!otherParty &&
      (hasServiceTag(msg.tags) || isService(otherParty) || knownServices.has(canon(otherParty)));
    const nickServParty = !isChan && isNickServ(self ? chanTarget : (msg.nick || ''));
    // Neither a NOTICE nor any message exchanged with a services pseudo-client is a
    // real conversation, so it must never open a PM query. Incoming notices land in
    // a channel we share with the sender, or in the Notices buffer — never in a
    // random window just because it happens to be open.
    const route = routeMessage({
      isChannel: isChan, reportService: toReportSvc, nickServParty, serviceParty: svcParty, isNotice: kind === 'notice',
    });
    const toActive = route === 'active';
    const chanCtx = !isChan ? msg.tags['+draft/channel-context'] : undefined;
    let bufferName = route === 'channel'
      ? chanTarget
      : route === 'report'
        ? SERVER
        : route === 'active'
          ? (get().active || SERVER)
          : (self ? chanTarget : msg.nick);
    if (kind === 'notice' && !self && !isChan && route === 'active') {
      const s = get();
      const echoOpts = {
        sender: msg.nick || '',
        text,
        ts: tsOf(msg),
        buffers: s.buffers || {},
        order: s.order || [],
      };
      // Bac (and similar bots) PRIVMSG the channel AND NOTICE the player the same
      // lines. Don't paste the NOTICE copy into the salon — that splits one intro
      // into privmsg + notice bubbles.
      if (noticeIsChannelEcho(echoOpts)) return true;
      bufferName = resolveNoticeDest({
        sender: echoOpts.sender,
        active: s.active || '',
        channelContext: chanCtx,
        buffers: echoOpts.buffers,
        order: echoOpts.order,
      });
    }
    // One we send shows the recipient; one we receive shows the sender.
    const noticeText = toActive && self ? `→ ${chanTarget} : ${text}` : statusTag + text;
    const cm: ChatMessage = {
      id: msg.tags['msgid'] || newId(),
      msgid: msg.tags['msgid'] || undefined,
      bufferName, from: msg.nick, account: msg.tags['account'],
      // Mask passwords in our own services-auth commands even now that they land in
      // the active window rather than a dedicated services buffer.
      text: self && (svcParty || isService(bufferName)) ? maskSecret(noticeText) : noticeText, ts: tsOf(msg), kind, self,
      replyTo: msg.tags['+draft/reply'],
      channelContext: chanCtx,
      tags: clientTagsForPlugins(msg.tags),
    };
    // Remember an incoming PM's channel context so our replies carry it back
    // (a one-off notice isn't a thread we reply into, so it doesn't seed this).
    if (chanCtx && !self && kind !== 'notice' && isChannelName(chanCtx)) {
      const s = get();
      if (s.pmContext[canon(msg.nick)] !== chanCtx)
        set({ pmContext: { ...s.pmContext, [canon(msg.nick)]: chanCtx } });
    }
    // chathistory replay: collect into the batch (prepended on BATCH close),
    // don't append live or notify.
    const histRef = inHistoryBatch(msg);
    if (histRef) { (historyCollect[histRef] ||= []).push(cm); return true; }
    // draft/multiline: gather the lines to render as one message at batch close.
    const mlRef = inMultilineBatch(msg);
    if (mlRef) {
      const concat = msg.tags['draft/multiline-concat'] !== undefined;
      const slot = (multilineCollect[mlRef] ||= { base: cm, lines: [] });
      slot.lines.push({ text, concat });
      return true;
    }
    addMessage(bufferName, cm);
    if (nickServParty && !self && shouldPopupNickServ(text)) {
      set({ nickServAlert: { from: msg.nick || 'NickServ', text: statusTag + text, ts: Date.now() } });
    }
    // Notifications honour the per-channel level: 'all' alerts on every line,
    // 'mentions' (default) only on your nick / a highlight word, 'mute' never.
    // A mention = your nick OR any of your highlight words; PMs always alert.
    if (!self && kind !== 'notice') {
      const isPM = !isChannelName(chanTarget) && !svcParty;
      const level = isPM ? 'all' : (get().notifyLevel[canon(bufferName)] || 'mentions');
      const lc = text.toLowerCase();
      const mention = (me.length > 1 && lc.includes(me.toLowerCase()))
        || get().highlightWords.some((w) => lc.includes(w.toLowerCase()));
      const inactive = document.hidden || !get().isActive || canon(bufferName) !== get().active;
      if (mention && level !== 'mute') patchBuffer(bufferName, (b) => ({ ...b, highlight: true }));
      const wants = level === 'all' || (level === 'mentions' && mention);
      if (inactive && wants) {
        desktopNotify(isPM ? i18n.t('system.pmNotif', { nick: msg.nick }) : `${msg.nick} · ${bufferName}`, text.slice(0, 120));
        if (get().prefs.sound) blip();
      }
    }
    return true;
  }

  return { handleMessaging };
}
