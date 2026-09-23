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
      if (/^options?$/i.test(key) && value) {
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

async function nickservRpc(account: string, nick: string, action: 'nsinfo' | 'nsalist'): Promise<string | null> {
  if (!account) return null;
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(CS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ account, nick, action }),
      signal: ctrl.signal,
    });
    const data = await r.json() as { ok?: boolean; info?: unknown; list?: unknown };
    if (!data?.ok) return null;
    const blob = action === 'nsalist' ? data.list : data.info;
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

/** Read NickServ INFO via Anope JSON-RPC (same path as ChanServ). No IRC PM. */
export async function fetchNickServInfo(account: string, nick = ''): Promise<NickServInfo | null> {
  const blob = await nickservRpc(account, nick, 'nsinfo');
  if (blob == null) return null;
  const parsed = parseNickServInfo(blob, account);
  return parsed.rows.length ? parsed : null;
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
