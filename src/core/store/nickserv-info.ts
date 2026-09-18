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
};

function isAlistNoise(s: string): boolean {
  return /^(fin\s+de|end of|num[eé]ro|number\s+channel|n[°º]\b)/i.test(s)
    || /a acc[eè]s|has access on|access list|liste d['’]acc[eè]s|salons auxquels/i.test(s);
}

function isAlistEmpty(s: string): boolean {
  return /aucun salon|n['’]a acc[eè]s [àa] aucun|has no access|no access (?:on|to) any/i.test(s);
}

/** NickServ ALIST blob → channel / level / description. */
export function parseNickServAlist(raw: string): NickServAccess[] {
  const rows: NickServAccess[] = [];
  const seen = new Set<string>();
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s || isAlistNoise(s) || isAlistEmpty(s)) continue;
    const numbered = s.match(/^\d+\s+([#&+!]\S+)\s+(\S+)(?:\s+(.*))?$/);
    const simple = numbered ? null : s.match(/^([#&+!]\S+)\s+(\S+)(?:\s+(.*))?$/);
    const m = numbered || simple;
    if (!m) continue;
    const channel = m[1];
    const key = channel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ channel, access: m[2], description: (m[3] || '').trim() });
  }
  return rows;
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
