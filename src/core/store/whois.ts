// WHOIS/WHOWAS sub-handler.
//
// Builds up the WhoisInfo for the profile panel from the stream of RPL_WHOIS*
// numerics (they're suppressed from the console), and — for the yomirc theme —
// prints the finished WHOIS to a window as classic mIRC text lines. Split out of
// handler.ts as the first cohesive sub-handler: the dispatcher calls
// `handleWhois()` before its main switch and uses `clearWhois()` for the 401
// (no-such-nick) fallback. RPL_AWAY (301) intentionally stays in the dispatcher —
// it also drives the "user is away" query notice.
import { fmtDuration, formatUserModes } from '@/lib/format-text';
import type { IrcMessage, WhoisInfo } from '../irc/types';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

interface WhoisDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
  patchWhois: StoreHelpers['patchWhois'];
  sysLine: StoreHelpers['sysLine'];
}

export function makeWhois({ get, set, patchWhois, sysLine }: WhoisDeps) {
  function clearWhois(nick: string): void {
    const rest = { ...get().whois }; delete rest[nick]; set({ whois: rest });
  }

  // yomirc /whois: print the collected WHOIS to its origin window as classic mIRC
  // text lines (WhoisInfo.printTo) instead of opening the profile panel.
  function printWhois(w: WhoisInfo): void {
    const to = w.printTo!;
    const n = w.nick;
    const p = (text: string) => sysLine(to, text, 'info');
    if (w.user || w.host) p(`${n} is ${w.user ?? '?'}@${w.host ?? '?'}${w.realname ? ` * ${w.realname}` : ''}`);
    if (w.account) p(`${n} is logged in as ${w.account}`);
    if (w.channels) p(`${n} is on ${w.channels}`);
    if (w.server) p(`${n} is using ${w.server}${w.serverInfo ? ` (${w.serverInfo})` : ''}`);
    if (w.oper) p(`${n} is an IRC operator`);
    if (w.bot) p(`${n} is a bot`);
    if (w.modes) p(`${n} is using modes ${formatUserModes(w.modes)}`);
    if (w.secure) p(`${n} is using a secure connection (TLS)`);
    if (w.certfp) p(`${n} has client certificate ${w.certfp}`);
    if (w.actualHost) p(`${n} is actually using ${w.actualHost}`);
    for (const sp of w.special ?? []) p(`${n} ${sp}`);
    if (w.away) p(`${n} is away: ${w.away}`);
    if (w.idle != null || w.signon) {
      const idle = w.idle != null ? `has been idle ${fmtDuration(w.idle)}` : '';
      const signon = w.signon ? `signed on ${new Date(w.signon * 1000).toLocaleString()}` : '';
      p(`${n} ${[idle, signon].filter(Boolean).join(', ')}`);
    }
    p(`${n} End of /WHOIS list.`);
    clearWhois(n);
  }

  // Store one draft/metadata-2 key for a user; an empty/absent value clears it.
  function applyMeta(target: string, key: string, value: string | undefined): void {
    if (!target || !key) return;
    patchWhois(target, (w) => {
      const meta = { ...(w.meta ?? {}) };
      if (value) meta[key] = value; else delete meta[key];
      return { ...w, meta };
    });
  }

  // Handle a RPL_WHOIS*/WHOWAS numeric. Returns true when it was one of ours (so
  // the dispatcher stops and doesn't echo it to the console).
  function handleWhois(msg: IrcMessage): boolean {
    switch (msg.command) {
      case '311': // RPL_WHOISUSER: <me> <nick> <user> <host> * :<realname>
        patchWhois(msg.params[1], (w) => ({ ...w, user: msg.params[2], host: msg.params[3], realname: msg.params[5] }));
        return true;
      case '312': // RPL_WHOISSERVER: <me> <nick> <server> :<info>
        patchWhois(msg.params[1], (w) => ({ ...w, server: msg.params[2], serverInfo: msg.params[3] }));
        return true;
      case '313': // RPL_WHOISOPERATOR
        patchWhois(msg.params[1], (w) => ({ ...w, oper: true }));
        return true;
      case '317': // RPL_WHOISIDLE: <me> <nick> <idle> <signon> :seconds idle, signon time
        patchWhois(msg.params[1], (w) => ({ ...w, idle: Number(msg.params[2]) || 0, signon: Number(msg.params[3]) || 0 }));
        return true;
      case '319': { // RPL_WHOISCHANNELS (can arrive across multiple lines)
        const add = (msg.params[2] ?? '').split(' ').filter(Boolean);
        patchWhois(msg.params[1], (w) => {
          const seen = new Set((w.channels ? w.channels.split(' ') : []).filter(Boolean));
          for (const c of add) { if (seen.size >= 300) break; seen.add(c); } // bound server-streamed 319s
          return { ...w, channels: [...seen].join(' ') };
        });
        return true;
      }
      case '330': // RPL_WHOISACCOUNT: <me> <nick> <account> :is logged in as
        patchWhois(msg.params[1], (w) => ({ ...w, account: msg.params[2] }));
        return true;
      case '335': // RPL_WHOISBOT
        patchWhois(msg.params[1], (w) => ({ ...w, bot: true }));
        return true;
      case '338': // RPL_WHOISACTUALLY
      case '378': // RPL_WHOISHOST
        patchWhois(msg.params[1], (w) => ({ ...w, actualHost: msg.params[2] }));
        return true;
      case '671': // RPL_WHOISSECURE
        patchWhois(msg.params[1], (w) => ({ ...w, secure: true }));
        return true;
      case '276': // RPL_WHOISCERTFP: <me> <nick> :has client cert fingerprint <fp>
        patchWhois(msg.params[1], (w) => ({ ...w, certfp: (msg.params[2] || '').replace(/^.*fingerprint\s*/i, '') }));
        return true;
      case '307': // RPL_WHOISREGNICK: nick is a registered/identified account
        patchWhois(msg.params[1], (w) => ({ ...w, regnick: true }));
        return true;
      case '320': // RPL_WHOISSPECIAL: free-form extra whois line
        patchWhois(msg.params[1], (w) => ({ ...w, special: [...(w.special ?? []).slice(-49), msg.params[2]] }));
        return true;
      case '379': // RPL_WHOISMODES: <me> <nick> :is using modes <modes>
        patchWhois(msg.params[1], (w) => ({ ...w, modes: (msg.params[2] || '').replace(/^.*modes\s*/i, '') }));
        return true;
      case '314': // RPL_WHOWASUSER: <me> <nick> <user> <host> * :<realname>
        patchWhois(msg.params[1], (w) => ({ ...w, user: msg.params[2], host: msg.params[3], realname: msg.params[5], offline: true }));
        return true;
      case '369': // RPL_ENDOFWHOWAS
        patchWhois(msg.params[1], (w) => ({
          ...w,
          loading: false,
          notFound: w.notFound || (!w.user && !w.host),
        }));
        return true;
      case '318': { // RPL_ENDOFWHOIS
        const nk = msg.params[1];
        patchWhois(nk, (w) => ({ ...w, loading: false }));
        const w = get().whois[nk];
        if (w?.printTo) printWhois(w); // yomirc: dump it to the active window as text
        return true;
      }
      // draft/metadata-2 account profile (avatar/bio/pronouns/timezone/url), pushed
      // live as we share visibility with a user and streamed on WHOIS. An absent
      // value means the key was cleared.
      case 'METADATA': // :src METADATA <target> <key> <visibility> [:<value>]
        applyMeta(msg.params[0], msg.params[1], msg.params[3]);
        return true;
      case '761': // RPL_KEYVALUE: <me> <target> <key> <visibility> [:<value>]
        applyMeta(msg.params[1], msg.params[2], msg.params[4]);
        return true;
      case '766': // RPL_KEYNOTSET: <me> <target> <key> :key not set — clear it
        applyMeta(msg.params[1], msg.params[2], undefined);
        return true;
      case '762': // RPL_METADATAEND
        return true;
      default:
        return false;
    }
  }

  return { handleWhois, clearWhois };
}
