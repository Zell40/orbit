// IRC services pseudo-clients (NickServ, ChanServ, HostServ, …): identity
// detection, credential masking, and mistyped-command leak detection. Split out
// from the general text helpers because these are the security-sensitive bits —
// they decide what counts as a service and keep passwords out of the message log.
// Pure functions, no state: safe to import anywhere.

// A services pseudo-client, by the conventional "*Serv" naming.
const SERVICE_RE = /^(nick|chan|host|oper|bot|memo|help|sasl|group|stat|game)serv$/i;
export function isService(name: string): boolean { return SERVICE_RE.test(name); }

export function isNickServ(name: string): boolean {
  return /^nickserv$/i.test(String(name || '').trim());
}

/** Routine IDENTIFY acks — log in Status only, no popup. */
export function shouldPopupNickServ(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  if (
    /password accepted|successfully identified|already identified|now recognized|d[eé]j[aà] identifi/i.test(t)
    || /n['']?est pas enregistr[eé]|isn't registered|not registered/i.test(t)
  ) return false;
  return true;
}

// True when the server flagged this message as coming from a services pseudo-client.
// Some servers add a vendor `<host>/service` tag to any message from a U-lined server
// (delivered on the message-tags cap). We accept any such tag, so servers without one
// simply fall back to the *Serv name rule below. Client (`+`-prefixed) tags are never
// a service marker.
export function hasServiceTag(tags: Record<string, string>): boolean {
  return Object.keys(tags).some((k) => !k.startsWith('+') && k.endsWith('/service'));
}

// Where a one-to-one PRIVMSG/NOTICE belongs. Neither a NOTICE nor anything to/from
// a services pseudo-client is a real conversation, so it surfaces in whatever
// window is already open ('active') rather than spawning a private query. A
// channel target goes to the channel; the report service to the status window.
export type ServiceRoute = 'channel' | 'report' | 'active' | 'query';
export function routeMessage(o: {
  isChannel: boolean;
  reportService: boolean;
  nickServParty: boolean;
  serviceParty: boolean;
  isNotice: boolean;
}): ServiceRoute {
  if (o.isChannel) return 'channel';
  if (o.reportService || o.nickServParty) return 'report';
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
