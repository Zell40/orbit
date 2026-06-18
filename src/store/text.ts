// Pure text/IRC helpers used by the store (no state, no closure) — masking,
// services-leak detection, ban-mask matching, formatting-code stripping.
import type { IrcMessage } from '../irc/types';

// "user@host" for an event source, or '' when the server didn't give us one.
export function hostmask(msg: IrcMessage): string {
  return msg.user && msg.host ? `${msg.user}@${msg.host}` : '';
}

// Match an IRC ban mask (nick!user@host with * and ? wildcards) against `who`,
// so we can list which present members a +b/-b actually hits (like mIRC).
export function maskMatches(mask: string, who: string): boolean {
  if (!mask || !who) return false;
  const m = mask.includes('!') || mask.includes('@') ? mask : `${mask}!*@*`;
  const re = new RegExp(
    '^' + m.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i',
  );
  return re.test(who);
}

// --- credential safety -----------------------------------------------------
const SERVICE_RE = /^(nick|chan|host|oper|bot|memo)serv$/i;
export function isService(name: string): boolean { return SERVICE_RE.test(name); }

const SECRET_MASK = '••••••••';
// Replace passwords in services auth commands so they never appear in clear
// text in the message log (IDENTIFY [account] pass, GHOST nick pass, REGISTER
// pass [email], SET PASSWORD pass, LOGIN account pass, …).
export function maskSecret(text: string): string {
  return text
    .replace(/\b(IDENTIFY|LOGIN)\s+(\S+)(?:\s+(\S+))?/i, (_m, c, a, b) => (b ? `${c} ${a} ${SECRET_MASK}` : `${c} ${SECRET_MASK}`))
    .replace(/\b(GHOST|RELEASE|RECOVER|REGAIN)\s+(\S+)\s+(\S+)/i, (_m, c, n) => `${c} ${n} ${SECRET_MASK}`)
    .replace(/\b(REGISTER)\s+(\S+)/i, (_m, c) => `${c} ${SECRET_MASK}`)
    .replace(/\b(SET\s+PASSWORD)\s+(\S+)/i, (_m, c) => `${c} ${SECRET_MASK}`);
}

// Detect a services command typed WITHOUT the leading slash — the classic
// mistake that broadcasts your password to the whole room ("IDENTIFY nick pw",
// "msg nickserv identify …", "ns identify …"). Returns the service + command
// so we can route it privately instead of sending it to the channel.
export function detectServiceLeak(text: string): { service: string; command: string } | null {
  const t = text.trim();
  // Explicit, unambiguous: addressed to a service by name.
  const m = t.match(/^\/?(?:msg\s+)?(nickserv|ns|chanserv|cs)\s+(\S.*)$/i);
  if (m) return { service: /^c/i.test(m[1]) ? 'ChanServ' : 'NickServ', command: m[2].trim() };
  // Bare credential command (IDENTIFY [account] pass, etc.). Require 1–2 trailing
  // tokens AND that the last one LOOKS like a password (digit/symbol/uppercase or
  // long) so we don't hijack normal chat like "identify the killer".
  if (/^(identify|register|ghost|release|recover|regain)\s+\S+(\s+\S+)?$/i.test(t)) {
    const last = t.split(/\s+/).pop() || '';
    const looksSecret = /[\d\W]/.test(last) || /[A-Z]/.test(last) || last.length >= 8;
    if (looksSecret) return { service: 'NickServ', command: t };
  }
  return null;
}

// Strip IRC formatting control codes (bold/italic/underline/strike/mono/reverse/
// reset + mIRC colour). Needed so a line is still recognised as a /command even
// when "sticky" formatting (e.g. bold left on) prefixes it with a control byte.
// eslint-disable-next-line no-control-regex
const IRC_FMT_RE = /\x03\d{0,2}(?:,\d{1,2})?|\x04[0-9A-Fa-f]{0,6}|[\x02\x1d\x1f\x1e\x11\x16\x0f]/g;
export function stripFormatting(s: string): string { return s.replace(IRC_FMT_RE, ''); }
