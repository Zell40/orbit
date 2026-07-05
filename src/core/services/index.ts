// IRC services pseudo-clients (NickServ, ChanServ, HostServ, …): identity
// detection, credential masking, and mistyped-command leak detection. Split out
// from the general text helpers because these are the security-sensitive bits —
// they decide what counts as a service and keep passwords out of the message log.
// Pure functions, no state: safe to import anywhere.

// A services pseudo-client, by the conventional "*Serv" naming.
const SERVICE_RE = /^(nick|chan|host|oper|bot|memo|help|sasl|group|stat|game)serv$/i;
export function isService(name: string): boolean { return SERVICE_RE.test(name); }

// The server's authoritative "this came from a services pseudo-client" signal:
// server's m_services tags every message sourced from a U-lined server with it,
// delivered to any client holding the message-tags cap. Name-agnostic, so it also
// covers services that don't follow the *Serv convention (Global, Q, custom bots).
export const SERVICE_TAG = 'example.org/service';

// Where a one-to-one PRIVMSG/NOTICE belongs. Neither a NOTICE nor anything to/from
// a services pseudo-client is a real conversation, so it surfaces in whatever
// window is already open ('active') rather than spawning a private query. A
// channel target goes to the channel; the report service to the status window.
export type ServiceRoute = 'channel' | 'report' | 'active' | 'query';
export function routeMessage(o: {
  isChannel: boolean;
  reportService: boolean;
  serviceParty: boolean;
  isNotice: boolean;
}): ServiceRoute {
  if (o.isChannel) return 'channel';
  if (o.reportService) return 'report';
  if (o.isNotice || o.serviceParty) return 'active';
  return 'query';
}

const SECRET_MASK = '••••••••';
// Replace passwords in services auth commands so they never appear in clear
// text in the message log (IDENTIFY [account] pass, GHOST nick pass, REGISTER
// pass [email], SET PASSWORD pass, LOGIN account pass, …).
export function maskSecret(text: string): string {
  return text
    .replace(/\b(IDENTIFY|LOGIN)\s+(\S+)(?:\s+(\S+))?/i, (_m, c, a, b) => (b ? `${c} ${a} ${SECRET_MASK}` : `${c} ${SECRET_MASK}`))
    .replace(/\b(GHOST|RELEASE|RECOVER|REGAIN)\s+(\S+)\s+(\S+)/i, (_m, c, n) => `${c} ${n} ${SECRET_MASK}`)
    .replace(/\b(REGISTER)\s+(\S+)/i, (_m, c) => `${c} ${SECRET_MASK}`)
    .replace(/\b(SET\s+PASSWORD)\s+(\S+)/i, (_m, c) => `${c} ${SECRET_MASK}`)
    .replace(/\b(SASET\s+\S+\s+PASSWORD)\s+(\S+)/i, (_m, c) => `${c} ${SECRET_MASK}`);
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
