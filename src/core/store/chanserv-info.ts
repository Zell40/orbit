import { stripFormatting } from './text';

const CS_RPC = '/app/plugins/third/orbit-chanserv/chanserv-rpc.php';

export type ChanServPublicInfo = {
  chan?: string;
  founder?: string;
  description?: string;
  official?: boolean;
};

function fold(s: string): string {
  return String(s || '').toLowerCase()
    .replace(/[àáâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u').replace(/ç/g, 'c');
}

/** Anope "Options:" tokens — "Salon officiel" / Official / cs_official. */
export function optionsAreOfficial(blob: string): boolean {
  return String(blob || '').split(/\s*,\s*/).some((part) => {
    const t = fold(part).trim();
    return t === 'official' || t === 'officiel' || t === 'cs_official'
      || t === 'salon officiel' || /\bsalon officiel\b/.test(t)
      || /(^|\s)official(\s|$)/.test(t);
  });
}

const INFO_HEAD = /^(?:informations?\s+(?:à propos du salon|sur le salon|du salon|about(?: the)? channel|for|on)|info(?:rmation)?s?\s+(?:about|for|on))\s+(#\S+)/i;

/** ChanServ INFO blob (FR/EN Anope) → founder / description / official. */
export function parseChanServInfo(raw: string): ChanServPublicInfo {
  const out: ChanServPublicInfo = {};
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const head = s.match(INFO_HEAD);
    if (head) {
      out.chan = head[1].replace(/[.:]+$/, '');
      continue;
    }
    const m = s.match(/^([^:]{2,40}):\s*(.*)$/);
    if (!m) continue;
    const key = fold(m[1]).replace(/\s+/g, ' ').trim();
    const val = m[2].trim();
    if (/^(fondateur|fondateurice|founder)$/.test(key)) {
      out.founder = val.replace(/[.,;]+$/, '').split(/\s/)[0];
    } else if (/^(description|desc)$/.test(key)) {
      if (!/^(aucun|none|n\/a|vide|non definie|not set|-)$/i.test(fold(val))) out.description = val;
    } else if (/^options?$/.test(key)) {
      out.official = optionsAreOfficial(val);
    }
  }
  return out;
}

/** Silent Anope probe (same RPC as MLOCK). Empty when guest / RPC down. */
export async function fetchChanServPublic(account: string, nick: string, channel: string): Promise<ChanServPublicInfo> {
  if (!account || !channel) return {};
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(CS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ account, channel, action: 'probe', nick }),
      signal: ctrl.signal,
    });
    const data = await r.json() as { ok?: boolean; info?: unknown };
    if (!data?.ok || data.info == null) return {};
    const parsed = parseChanServInfo(String(data.info));
    if (!parsed.chan) parsed.chan = channel;
    return parsed;
  } catch {
    return {};
  } finally {
    window.clearTimeout(to);
  }
}
