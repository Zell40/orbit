import { stripFormatting } from './text';

const CS_RPC = '/app/plugins/third/orbit-chanserv/chanserv-rpc.php';

export type ChanServPublicInfo = {
  chan?: string;
  founder?: string;
  description?: string;
  official?: boolean;
  /** ChanServ TOPICLOCK (Options) — not the same as MLOCK +t. */
  topicLock?: boolean;
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

/** Anope "Options:" — TOPICLOCK / « Verrouillage du topic ». */
export function optionsHaveTopicLock(blob: string): boolean {
  return String(blob || '').split(/\s*,\s*/).some((part) => {
    const t = fold(part).trim();
    return t === 'topiclock'
      || /verrouillage du (topic|sujet)/.test(t)
      || /(^|\s)topic lock(\s|$)/.test(t);
  });
}

const INFO_HEAD = /^(?:informations?\s+(?:à propos du salon|sur le salon|du salon|about(?: the)? channel|for|on)|info(?:rmation)?s?\s+(?:about|for|on))\s+(#\S+)/i;

/** Anope INFO field keys (one NOTICE per line) — used to hide auto-probes in chat. */
const INFO_FIELD = /^(fondateurice|fondateur|founder|description|desc|options?|enregistr[ée]e?(?:\s+le)?|registered(?:\s+on)?|derni[eè]re utilisation|last (?:used|use)|url|dernier (?:topic|sujet)|last topic|mode lock|mlock|verrouillage (?:des modes|du (?:sujet|topic))|bot|entr[ée]e|entry(?: msg|message)?|ban(nish)? type|type de ban|successor|success(?:eur|or)|email|e-mail|temps d'inactivit[ée]|inactivity|nombre de|number of|utilisateurs?|users?|topic|sujet)\s*:/i;

const INFO_TAIL = /^(fin de|end of)\b/i;

/** Window after a user-typed ChanServ INFO during which dumps may appear in chat. */
let csInfoRevealUntil = 0;
/** Sticky swallow after INFO header until Fin de / timeout (odd/unknown field labels). */
let csInfoDumpUntil = 0;

/** Call when the user explicitly asks ChanServ for INFO (`/cs info`, `/msg ChanServ INFO`, …). */
export function noteManualChanServInfoCommand(body: string): void {
  if (!/^\s*INFO\b/i.test(String(body || ''))) return;
  csInfoRevealUntil = Date.now() + 15_000;
  csInfoDumpUntil = 0;
}

export function chanServInfoRevealActive(): boolean {
  return Date.now() <= csInfoRevealUntil;
}

/** Test helper — reset sticky / reveal windows between cases. */
export function resetChanServInfoNoticeState(): void {
  csInfoRevealUntil = 0;
  csInfoDumpUntil = 0;
}

/** True for ChanServ INFO dump lines (header, fields, end) — not STATUS/OP replies. */
export function isChanServInfoNotice(raw: string): boolean {
  const s = stripFormatting(raw).replace(/\s+/g, ' ').trim();
  if (!s) return false;
  if (INFO_HEAD.test(s)) {
    // Keep swallowing following field lines even if a label is slightly off.
    csInfoDumpUntil = Date.now() + 8_000;
    return true;
  }
  if (INFO_TAIL.test(s)) {
    csInfoDumpUntil = 0;
    return true;
  }
  if (INFO_FIELD.test(s)) return true;
  if (Date.now() <= csInfoDumpUntil) {
    // Unknown Anope field labels (Key : value), not free-form STATUS/OP replies.
    if (/^[A-Za-zÀ-ÿ][^:]{1,46}:\s+\S/.test(s)
      && !/^(syntaxe|syntax|aide|help|status)\b/i.test(s)) {
      return true;
    }
  }
  // Continuation / wrapped description without a new key.
  if (/^[-–—•]\s+\S/.test(s) && s.length > 20) return true;
  return false;
}

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
      out.topicLock = optionsHaveTopicLock(val);
    } else if (/^(verrouillage du sujet|topic lock|sujet verrouille)$/.test(key)) {
      const v = fold(val);
      if (/\b(inactif|off|disabled|no|non)\b/.test(v)) out.topicLock = false;
      else if (/\b(actif|on|enabled|yes|oui)\b/.test(v)) out.topicLock = true;
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
