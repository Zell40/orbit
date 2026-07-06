// Outgoing command + input parser — the mirror of handler.ts (which handles
// INCOMING lines). `sendInput` takes whatever the user typed in the composer and
// turns it into IRC: slash-commands (/join, /msg, /me, /nick, /whois, /kick, …),
// the Console's raw-line convenience, a services-credential-leak guard, and the
// plain-message path (with reply + channel-context tags and the optimistic echo).
// Split out of store.ts; the store wires `sendInput: makeCommands(...).sendInput`.
import i18n from '../i18n';
import { getTheme } from '../../themes';
import { usePluginRegistry } from '../../modules/registry';
import { isService, maskSecret, detectServiceLeak } from '../services';
import { stripFormatting, tidyOutgoing } from './text';
import { SERVER, newId, canon, isChannelName } from './context';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface CommandsDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  helpers: StoreHelpers;
  resetTyping: () => void; // clear the per-store typing throttle after we send
}

export function makeCommands({ get, set, helpers, resetTyping }: CommandsDeps) {
  const { sysLine, addMessage, ensureBuffer } = helpers;

  function sendInput(text: string): void {
    const { client, active } = get();
    if (!client || !active || !text.trim()) return;

    // Detect /commands from the FORMATTING-STRIPPED text: "sticky" bold/italic
    // etc. can prefix the line with a control byte, which would otherwise hide
    // the leading '/' and send the command as a plain (formatted) message.
    const cmdline = stripFormatting(text).trimStart();

    // The Console: a bare line (no leading slash) is a raw IRC command line — the
    // classic mIRC status-window convenience. Slash-commands fall through to the
    // normal dispatch below so /whois, /msg, /join … actually behave (raw-sending
    // them would swallow /whois's reply and mangle /msg into an invalid command);
    // channel commands run from here have no active channel so they go raw too.
    if (active === SERVER && !cmdline.startsWith('/')) {
      const raw = cmdline.trim();
      if (!raw) return;
      sysLine(SERVER, `» ${raw}`, 'system');
      client.send(raw);
      return;
    }

    if (cmdline.startsWith('/')) {
      const [cmd, ...rest] = cmdline.slice(1).split(' ');
      const arg = rest.join(' ');
      // From the Console there's no active channel to act on: a channel command
      // (the user supplies #chan in the args, e.g. /kick #c nick) is sent raw and
      // its reply returns here. Returns true when it handled the line.
      const rawFromConsole = (): boolean => {
        if (active !== SERVER) return false;
        const raw = cmdline.slice(1);
        sysLine(SERVER, `» ${raw}`, 'system');
        client.send(raw);
        return true;
      };
      switch (cmd.toLowerCase()) {
        case 'me': if (active !== SERVER) client.action(active, arg); break;
        case 'join': client.join(arg); get().setActive(arg.split(' ')[0]); break;
        case 'part': if (!rawFromConsole()) client.part(active); break;
        case 'nick': client.setNick(arg); break;
        case 'whois': {
          const who = arg.trim().split(' ')[0] || (active === SERVER ? get().nick : active);
          if (!who) break;
          // yomirc mimics classic mIRC: print WHOIS to the active window as text.
          if (getTheme().startsWith('yomirc')) get().whoisText(who); else get().openUser(who);
          break;
        }
        case 'msg': {
          const [t, ...m] = rest; const body = m.join(' ');
          if (!t || !body) break;
          client.privmsg(t, body);
          // Optimistic echo (masked for services) so the user sees feedback.
          if (!client.ircv3.hasCap('echo-message')) {
            const dest = isChannelName(t) ? t : t;
            addMessage(dest, {
              id: newId(), bufferName: dest, from: get().nick,
              text: isService(t) ? maskSecret(body) : body,
              ts: Date.now(), kind: 'privmsg', self: true,
            });
          }
          break;
        }
        case 'notice': {
          const [t, ...m] = rest;
          const body = m.join(' ');
          if (!t || !body) break;
          client.send(`NOTICE ${t} :${body}`);
          // No optimistic echo if the server will echo it back to us.
          if (!client.ircv3.hasCap('echo-message')) {
            const dest = isChannelName(t) ? t : (active || SERVER);
            addMessage(dest, {
              id: newId(), bufferName: dest, from: get().nick,
              text: isChannelName(t) ? body : `→ ${t} : ${body}`,
              ts: Date.now(), kind: 'notice', self: true,
            });
          }
          break;
        }
        case 'topic': if (!rawFromConsole() && isChannelName(active)) client.setTopic(active, arg); break;
        case 'kick': { if (rawFromConsole()) break; const [t, ...r] = rest; if (isChannelName(active) && t) client.kick(active, t, r.join(' ')); break; }
        case 'op': if (isChannelName(active) && arg) client.setUserMode(active, 'o', true, arg.trim()); break;
        case 'deop': if (isChannelName(active) && arg) client.setUserMode(active, 'o', false, arg.trim()); break;
        case 'voice': if (isChannelName(active) && arg) client.setUserMode(active, 'v', true, arg.trim()); break;
        case 'ignore': if (arg.trim()) get().toggleIgnore(arg.trim()); break;
        case 'unignore': if (arg.trim()) get().toggleIgnore(arg.trim()); break;
        case 'list': get().refreshChannels(); get().setModal('explore'); break; // open the Explore window
        default: {
          const pc = usePluginRegistry.getState().commands.find((c) => c.name === cmd.toLowerCase());
          if (pc) { try { pc.run(rest, arg); } catch (e) { console.error(`[plugins] /${cmd} threw`, e); } }
          else { if (active === SERVER) sysLine(SERVER, `» ${cmdline.slice(1)}`, 'system'); client.send(cmdline.slice(1)); } // raw passthrough (formatting stripped)
        }
      }
      return;
    }
    // Credential safety: a services command typed without the leading slash
    // (e.g. "IDENTIFY nick pass" in a channel) would broadcast the password to
    // everyone. Catch it, send it to the service privately, and warn — unless
    // we're already in that service's window. Use the stripped text so sticky
    // formatting can't smuggle the password past the guard.
    const leak = detectServiceLeak(cmdline);
    if (leak && !isService(active)) {
      client.privmsg(leak.service, leak.command);
      sysLine(active,
        i18n.t('security.leakGuard', { channel: active, service: leak.service }),
        'warning');
      ensureBuffer(leak.service);
      if (!client.ircv3.hasCap('echo-message')) {
        addMessage(leak.service, {
          id: newId(), bufferName: leak.service, from: get().nick,
          text: maskSecret(leak.command), ts: Date.now(), kind: 'privmsg', self: true,
        });
      }
      return;
    }

    const reply = get().replyTarget;
    // Tidy channel/DM messages so they can't be padded/spammed with runs of
    // blank space; leave service messages byte-for-byte (never touch creds).
    const body = isService(active) ? text : tidyOutgoing(text);
    if (!body) return;
    // +draft/channel-context: on a DM that was started from a channel, tag it.
    const ctx = !isChannelName(active) ? get().pmContext[canon(active)] : undefined;
    if (reply) { client.privmsgReply(active, body, reply.id, ctx); set({ replyTarget: null }); }
    else client.privmsg(active, body, ctx);
    if (isChannelName(active)) { client.ircv3.sendTyping(active, 'done'); resetTyping(); }
    // Optimistic echo only if the server won't echo it back to us.
    if (!client.ircv3.hasCap('echo-message')) {
      addMessage(active, {
        id: newId(), bufferName: active, from: get().nick,
        text: isService(active) ? maskSecret(text) : body,
        ts: Date.now(), kind: 'privmsg', self: true, replyTo: reply?.id, channelContext: ctx,
      });
    }
  }

  return { sendInput };
}
