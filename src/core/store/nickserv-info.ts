import { stripFormatting } from './text';

const CS_RPC = '/app/plugins/third/orbit-chanserv/chanserv-rpc.php';

export type NickServInfoRow = {
  key: string;
  value: string;
  pills?: string[];
};

export type NickServInfo = {
  account: string;
  rows: NickServInfoRow[];
};

function isInfoHead(s: string): string | null {
  const m = s.match(
    /^(?:informations?\s+(?:pour|sur|du)\s+(?:le\s+)?(?:compte\s+|pseudo\s+|nick\s+)?|info(?:rmation)?s?\s+(?:about|for|on)\s+(?:account\s+|nick(?:name)?\s+)?)["«“]?\s*(\S+?)\s*["»”]?\s*:?\s*$/i,
  );
  return m ? m[1].replace(/[.:]+$/, '') : null;
}

function isEndLine(s: string): boolean {
  return /^(fin\s+de\s+l['’]?info|end of (?:info|information))/i.test(s);
}

/** NickServ INFO blob → labelled rows (FR/EN Anope). */
export function parseNickServInfo(raw: string, fallbackAccount = ''): NickServInfo {
  const rows: NickServInfoRow[] = [];
  let account = fallbackAccount;
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const head = isInfoHead(s);
    if (head) {
      account = head;
      continue;
    }
    if (isEndLine(s)) continue;
    const m = s.match(/^([^:]{2,60}):\s*(.*)$/);
    if (m) {
      const key = m[1].trim();
      const value = m[2].trim();
      const row: NickServInfoRow = { key, value };
      if (/^options?$/i.test(key)) {
        row.pills = value.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
      }
      rows.push(row);
      continue;
    }
    const prev = rows[rows.length - 1];
    if (prev) {
      prev.value = `${prev.value} ${s}`.trim();
      if (prev.pills) {
        prev.pills = prev.value.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
      }
    }
  }
  return { account, rows };
}

async function nickservRpc(
  account: string,
  nick: string,
  action: 'nsinfo' | 'nsalist' | 'nshelp' | 'nsglist' | 'nslist',
  extra?: { pattern?: string; flags?: string[] },
): Promise<string | null> {
  if (!account) return null;
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(CS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ account, nick, action, ...extra }),
      signal: ctrl.signal,
    });
    const data = await r.json() as { ok?: boolean; info?: unknown; list?: unknown; help?: unknown };
    if (!data?.ok) return null;
    const blob = action === 'nsinfo' ? data.info : action === 'nshelp' ? data.help : data.list;
    if (blob == null) return null;
    return String(blob);
  } catch {
    return null;
  } finally {
    window.clearTimeout(to);
  }
}

export type NickServAccess = {
  channel: string;
  access: string;
  description: string;
  noExpire: boolean;
};

function isAlistNoise(s: string): boolean {
  return /^(fin\s+de|end of|num[eé]ro|number\s+channel|n[°º]\b)/i.test(s)
    || /a acc[eè]s|has access on|access list|liste d['’]acc[eè]s|salons auxquels|canaux auxquels/i.test(s);
}

function isAlistEmpty(s: string): boolean {
  return /aucun salon|n['’]a acc[eè]s [àa] aucun|has no access|no access (?:on|to) any/i.test(s);
}

function splitAccessDesc(rest: string): { access: string; description: string } {
  const closed = rest.match(/^(.*?)\s+\((.*)\)\s*$/);
  if (closed) return { access: closed[1].trim(), description: closed[2].trim() };
  const open = rest.match(/^(.*?)\s+\((.*)$/);
  if (open) return { access: open[1].trim(), description: open[2].trim() };
  return { access: rest.replace(/[,.;]+$/, '').trim(), description: '' };
}

function splitChanFlag(raw: string): { channel: string; noExpire: boolean } {
  const noExpire = raw.startsWith('!');
  return { channel: raw.replace(/^!+/, ''), noExpire };
}

function pushAlistRow(rows: NickServAccess[], seen: Set<string>, rawChan: string, rest: string): void {
  const { channel, noExpire } = splitChanFlag(rawChan);
  if (!channel) return;
  const key = channel.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  const { access, description } = splitAccessDesc(rest);
  rows.push({ channel, access, description, noExpire });
}

/** NickServ ALIST blob → channel / level / description. */
export function parseNickServAlist(raw: string): NickServAccess[] {
  const rows: NickServAccess[] = [];
  const seen = new Set<string>();
  const text = String(raw || '').replace(/\r\n?/g, '\n');
  for (const line of text.split('\n')) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s || isAlistNoise(s) || isAlistEmpty(s)) continue;
    // Entre Nous / Anope FR:  2: !#Aide.chat = Fondateurice, QOP (desc)
    const eq = s.match(/^\d+\s*[:.)]\s+(!?[#&][^\s=]*)\s*=\s*(.+)$/);
    if (eq) {
      pushAlistRow(rows, seen, eq[1], eq[2]);
      continue;
    }
    const numbered = s.match(/^\d+\s+(!?[#&]\S+)\s+(\S+)(?:\s+(.*))?$/);
    const simple = numbered ? null : s.match(/^(!?[#&]\S+)\s+(\S+)(?:\s+(.*))?$/);
    const m = numbered || simple;
    if (!m) {
      if (rows.length && !/^\d+/.test(s) && !/^(syntaxe|syntax)\b/i.test(s)) {
        const prev = rows[rows.length - 1];
        prev.description = `${prev.description} ${s.replace(/^[()]|[()]$/g, '')}`.trim();
      }
      continue;
    }
    const { channel, noExpire } = splitChanFlag(m[1]);
    const key = channel.toLowerCase();
    if (!channel || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      channel,
      access: m[2].replace(/[,.;]+$/, ''),
      description: (m[3] || '').trim(),
      noExpire,
    });
  }
  return rows;
}

export type AlistAccessInfo = {
  code: string;
  prefix: string;
  labelKey: string;
};

const ACCESS_LABEL: { re: RegExp; prefix: string; labelKey: string }[] = [
  { re: /fondat|founder/i, prefix: '~', labelKey: 'founder' },
  { re: /successeur|successor|^qop$|^owner$/i, prefix: '&', labelKey: 'successor' },
  { re: /^sop$|^10$/i, prefix: '&', labelKey: 'sop' },
  { re: /^aop$|^5$/i, prefix: '@', labelKey: 'aop' },
  { re: /^hop$|^4$/i, prefix: '%', labelKey: 'hop' },
  { re: /^vop$|^3$/i, prefix: '+', labelKey: 'vop' },
];

/** Map an Anope ALIST access token (AOP, Fondateurice, 5, …) to a role + prefix. */
export function describeAlistAccess(raw: string): AlistAccessInfo {
  const code = String(raw || '').replace(/[,.;]+$/g, '').trim();
  const hit = ACCESS_LABEL.find((r) => r.re.test(code));
  if (hit) return { code, prefix: hit.prefix, labelKey: hit.labelKey };
  return { code, prefix: '', labelKey: '' };
}

/** ChanServ INVITE is typically HOP+ / ACCESS 4+. VOP cannot invite. */
export function alistCanInvite(raw: string): boolean {
  const { labelKey, code } = describeAlistAccess(raw);
  if (labelKey === 'founder' || labelKey === 'successor' || labelKey === 'sop'
    || labelKey === 'aop' || labelKey === 'hop') return true;
  if (/\bqop\b/i.test(code)) return true;
  const n = parseInt(code, 10);
  return Number.isFinite(n) && n >= 4;
}

/** Ask ChanServ to INVITE us, then JOIN once the invite is likely in place. */
export function sendChanServInvite(
  client: { privmsg: (t: string, m: string) => void; join: (c: string) => void } | null,
  chan: string,
): void {
  const name = String(chan || '').trim();
  if (!client || !name) return;
  client.privmsg('ChanServ', `INVITE ${name}`);
  globalThis.setTimeout(() => client.join(name), 700);
}

export type NickServSetOpt = {
  set: string;
  key: string;
  match: RegExp;
  /** Services-oper only — show if present, never toggle. */
  locked?: boolean;
};

/** NickServ SET flags we expose as switches in Compte. NOEXPIRE stays read-only. */
export const NICKSERV_SET_TOGGLES: NickServSetOpt[] = [
  { set: 'AUTOOP', key: 'autoop', match: /auto-?op/i },
  { set: 'CHANSTATS', key: 'chanstats', match: /chanstats|statistiques(\s+nickserv)?/i },
  { set: 'FLEXIBLE', key: 'flexible', match: /flex/i },
  { set: 'KILL', key: 'kill', match: /^(kill|protection)$/i },
  { set: 'SECURE', key: 'secure', match: /secure|securis/i },
  { set: 'PRIVATE', key: 'private', match: /private|priv[eé]/i },
  { set: 'HIDEMAIL', key: 'hidemail', match: /hidemail|hide\s*e-?mail|masquer\s*(l['’]\s*)?e-?mail/i },
  { set: 'KEEPMODES', key: 'keepmodes', match: /keepmodes|conserver les modes/i },
];

export function foldNickServToken(s: string): string {
  return String(s || '').toLowerCase()
    .replace(/[àáâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
    .replace(/['’]/g, "'").trim();
}

/** Map NickServ INFO "Options:" pills to SET names that are currently ON. */
export function parseNickServOptionPills(pills: string[]): Set<string> {
  const on = new Set<string>();
  for (const raw of pills || []) {
    const t = foldNickServToken(raw);
    if (!t) continue;
    if (/noexpire|sans expiration|pas d[' ]expir/.test(t)) {
      on.add('NOEXPIRE');
      continue;
    }
    const hit = NICKSERV_SET_TOGGLES.find((opt) => opt.match.test(t));
    if (hit) on.add(hit.set);
  }
  return on;
}

/** Read NickServ INFO via Anope JSON-RPC (same path as ChanServ). No IRC PM. */
export async function fetchNickServInfo(account: string, nick = ''): Promise<NickServInfo | null> {
  const blob = await nickservRpc(account, nick, 'nsinfo');
  if (blob == null) return null;
  const parsed = parseNickServInfo(blob, account);
  return parsed.rows.length ? parsed : null;
}

export function isNickServNicksRow(key: string): boolean {
  return /^(nicks?|pseudos?(?:\s+enregistr[ée]s?)?)$/i.test(String(key || '').trim());
}

const GLIST_SKIP = /^(liste des pseudos|nicknames registered|fin de|end of|syntaxe:|syntax:|num[eé]ro|pseudo|nick(?:name)?s?|compte|account)\b/i;
const NICK_TOKEN = /^[A-Za-z\[\]\\^{|}`][A-Za-z0-9_\[\]\\^{|}`-]{0,31}$/;

/** NickServ GLIST blob → grouped nicknames on the account. */
export function parseNickServGlist(raw: string): string[] {
  const nicks: string[] = [];
  const seen = new Set<string>();
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s || GLIST_SKIP.test(s)) continue;
    const m = s.match(/^(?:\d+\s*[.)]\s*)?(\S+?)(?:\s+\([^)]*\))?$/);
    const nick = m?.[1]?.replace(/[,.;:]+$/, '') || '';
    if (!NICK_TOKEN.test(nick)) continue;
    const fold = nick.toLowerCase();
    if (seen.has(fold)) continue;
    seen.add(fold);
    nicks.push(nick);
  }
  return nicks;
}

export async function fetchNickServGlist(account: string, nick = ''): Promise<string[] | null> {
  const blob = await nickservRpc(account, nick, 'nsglist');
  if (blob == null) return null;
  const nicks = parseNickServGlist(blob);
  const fold = stripFormatting(blob).replace(/\s+/g, ' ').trim();
  if (!nicks.length && /syntaxe:|syntax:/i.test(fold)) return null;
  return nicks;
}

/** NickServ LIST blob → matching nicknames (search). */
export function parseNickServList(raw: string): { nicks: string[]; denied: boolean } {
  const fold = stripFormatting(raw).replace(/\s+/g, ' ').trim();
  if (/syntaxe:|syntax:|acc[eè]s refus|access denied|permission/i.test(fold)
    && !/\d+\s*[.)]\s+\S+/.test(fold)) {
    return { nicks: [], denied: /syntaxe:|syntax:|acc[eè]s refus|access denied|permission/i.test(fold) };
  }
  const nicks: string[] = [];
  const seen = new Set<string>();
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s || GLIST_SKIP.test(s)) continue;
    if (/^(liste des|list of|matching)/i.test(s)) continue;
    const m = s.match(/^(?:\d+\s*[.)]?\s+|[-•]\s*)(\S+)/) || s.match(/^(\S+)$/);
    const nick = m?.[1]?.replace(/[,.;:]+$/, '') || '';
    if (!NICK_TOKEN.test(nick)) continue;
    const key = nick.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    nicks.push(nick);
  }
  return { nicks, denied: false };
}

export const NICKSERV_LIST_FLAGS = ['DISPLAY', 'NOEXPIRE', 'SUSPENDED', 'UNCONFIRMED'] as const;

export async function fetchNickServList(
  account: string,
  nick: string,
  pattern: string,
  flags: string[] = [],
): Promise<{ nicks: string[]; denied: boolean } | null> {
  const blob = await nickservRpc(account, nick, 'nslist', { pattern, flags });
  if (blob == null) return null;
  return parseNickServList(blob);
}

/** Read NickServ ALIST via Anope JSON-RPC. No IRC PM. `[]` = none; `null` = failed. */
export async function fetchNickServAlist(account: string, nick = ''): Promise<NickServAccess[] | null> {
  const blob = await nickservRpc(account, nick, 'nsalist');
  if (blob == null) return null;
  const rows = parseNickServAlist(blob);
  if (rows.length) return rows;
  const fold = stripFormatting(blob).replace(/\s+/g, ' ').trim();
  if (/syntaxe:|syntax:/i.test(fold)) return null;
  return [];
}

/** Commands from NickServ HELP (privilege-aware on Anope). */
export function parseNickServHelp(raw: string): Set<string> {
  const out = new Set<string>();
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const m = s.match(/^([A-Z][A-Z0-9]{1,20})\s*[:：—–-]\s+/);
    if (m) out.add(m[1].toUpperCase());
  }
  return out;
}

export async function fetchNickServHelp(account: string, nick = ''): Promise<Set<string> | null> {
  const blob = await nickservRpc(account, nick, 'nshelp');
  if (blob == null) return null;
  const cmds = parseNickServHelp(blob);
  return cmds.size ? cmds : null;
}

/** UI catalog — `hide` = never surface (noise for end users). */
export type NickServManageCmd = {
  cmd: string;
  /** i18n key suffix under settings.account.nsCmd.* */
  key: string;
  /** Needs a free-text argument field. */
  args?: boolean;
  /** Confirm before sending. */
  danger?: boolean;
  /** Never show in the manage block. */
  hide?: boolean;
  /** Only useful when not yet identified (kept for completeness). */
  guestOnly?: boolean;
};

export const NICKSERV_MANAGE_CMDS: NickServManageCmd[] = [
  { cmd: 'UPDATE', key: 'update' },
  { cmd: 'SET', key: 'set', args: true, hide: true },
  { cmd: 'AJOIN', key: 'ajoin', args: true },
  { cmd: 'GLIST', key: 'glist' },
  { cmd: 'GROUP', key: 'group', args: true },
  { cmd: 'UNGROUP', key: 'ungroup', args: true },
  { cmd: 'RECOVER', key: 'recover', args: true },
  { cmd: 'RESETPASS', key: 'resetpass', args: true },
  { cmd: 'DROP', key: 'drop', args: true, danger: true },
  { cmd: 'SASET', key: 'saset', args: true },
  { cmd: 'SAREGISTER', key: 'saregister', args: true },
  { cmd: 'SUSPEND', key: 'suspend', args: true, danger: true },
  { cmd: 'UNSUSPEND', key: 'unsuspend', args: true },
  { cmd: 'MASSSET', key: 'massset', args: true, danger: true },
  { cmd: 'GETEMAIL', key: 'getemail', args: true },
  { cmd: 'LIST', key: 'list', args: true },
  // Noise / covered elsewhere — kept for HELP filtering reference only.
  { cmd: 'AIDE', key: 'aide', hide: true },
  { cmd: 'HELP', key: 'help', hide: true },
  { cmd: 'CERT', key: 'cert', hide: true },
  { cmd: 'CONFIRM', key: 'confirm', hide: true },
  { cmd: 'IDENTIFY', key: 'identify', hide: true, guestOnly: true },
  { cmd: 'REGISTER', key: 'register', hide: true, guestOnly: true },
  { cmd: 'RESEND', key: 'resend', hide: true, guestOnly: true },
  { cmd: 'INFO', key: 'info', hide: true },
  { cmd: 'ALIST', key: 'alist', hide: true },
  { cmd: 'LOGOUT', key: 'logout', hide: true },
];

/** Fallback when HELP RPC is unavailable — safe end-user set (no SA tools). */
export const NICKSERV_MANAGE_FALLBACK = new Set([
  'UPDATE', 'AJOIN', 'GLIST', 'GROUP', 'UNGROUP', 'RECOVER', 'RESETPASS', 'DROP',
]);
