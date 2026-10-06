import { stripFormatting } from './text';
import type { IrcClient } from '@/core/irc/client';
import type { Buffer, MessageKind } from '../irc/types';
import { SERVER, newId } from './context';

const CS_RPC = '/app/plugins/third/orbit-chanserv/chanserv-rpc.php';

type NsKind = 'INFO' | 'ALIST' | 'GLIST' | 'AJOIN' | 'LIST';

type NsPending = {
  kind: NsKind;
  lines: string[];
  done: ((blob: string) => void) | null;
  idle: ReturnType<typeof setTimeout> | null;
  hard: ReturnType<typeof setTimeout> | null;
};

let nsPending: NsPending | null = null;
let nsManualUntil = 0;
let nsSwallowUntil = 0;
let nsRpcBusy = 0;

export const NS_ACCOUNT_WAIT_MS = 30_000;
const NS_RPC_MS = 15_000;
const NS_IRC_HARD_MS = 22_000;
const NS_IRC_IDLE_MS = 2_500;
const NS_IRC_GAP_MS = 800;
const nsIrcWaiters: Record<string, Promise<string>> = {};
const nsFetchWaiters: Partial<Record<string, Promise<unknown>>> = {};
let nsMarksInflight: Promise<void> | null = null;
let nsMarksAt = 0;
let nsMarksKey = '';
const NS_MARKS_COOLDOWN_MS = 15_000;

function foldAccount(s: string): string {
  return String(s || '').trim().toLowerCase();
}

function nsPreview(raw: string, n = 180): string {
  const t = stripFormatting(raw).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function nsStatus(text: string, kind: MessageKind = 'warning'): void {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line || line === '[Compte NickServ]') return;
  void import('@/core/networks').then(({ activeStore }) => {
    const store = activeStore();
    if (!store) return;
    const s = store.getState();
    const key = SERVER;
    const msg = {
      id: newId(),
      bufferName: SERVER,
      from: '',
      text: line,
      ts: Date.now(),
      kind,
      self: false,
    };
    const cur = s.buffers[key];
    if (!cur) {
      const buf: Buffer = {
        name: SERVER, isChannel: false, messages: [msg], members: {},
        topic: '', unread: 0, joined: false, readTs: 0, peerReadTs: 0, typing: {},
      };
      store.setState({
        buffers: { ...s.buffers, [key]: buf },
        order: s.order.includes(key) ? s.order : [...s.order, key],
      });
      return;
    }
    store.setState({
      buffers: { ...s.buffers, [key]: { ...cur, messages: [...cur.messages, msg] } },
    });
  }).catch(() => { /* store not ready */ });
}

/** Anope JSON-RPC identify can echo 900 / ACCOUNT — ignore those while a query is in flight. */
export function nickServSessionBusy(): boolean {
  return nsRpcBusy > 0;
}

/** Auto INFO/ALIST/GLIST/AJOIN in flight — hide those PRIVMSG/NOTICE from Status. */
export function nickServAutoQueryActive(): boolean {
  return !!nsPending || nsIrcQueue.length > 0 || Date.now() < nsSwallowUntil;
}

export function markNickServAutoQuery(ms = 3000): void {
  nsSwallowUntil = Math.max(nsSwallowUntil, Date.now() + ms);
}

function beginNickServRpc(): void {
  nsRpcBusy++;
}

function endNickServRpc(): void {
  nsRpcBusy = Math.max(0, nsRpcBusy - 1);
}

/** User typed `/ns info` (etc.) — let the dump appear in chat. */
export function noteManualNickServQuery(body: string): void {
  if (nsPending || nsIrcQueue.length) return;
  if (/^\s*(INFO|ALIST|GLIST|AJOIN|LIST)\b/i.test(String(body || ''))) {
    nsManualUntil = Date.now() + 15_000;
  }
}

function nsDumpEnded(kind: NsKind, s: string): boolean {
  if (/^(fin de|end of)\b/i.test(s)) return true;
  if (kind === 'GLIST' && /\d+\s+pseudos?\s+(dans|in|on|apparten)/i.test(s)) return true;
  if (kind === 'AJOIN' && /fin de la liste d['’]?auto-?join|end of ajoin|liste de join automatiques/i.test(s)
    && /fin de|end of/i.test(s)) return true;
  if (kind === 'LIST' && /correspondances?\s+affich/i.test(s)) return true;
  return false;
}

function finishNickServQuery(): void {
  const p = nsPending;
  if (!p) return;
  nsPending = null;
  if (p.idle) globalThis.clearTimeout(p.idle);
  if (p.hard) globalThis.clearTimeout(p.hard);
  const done = p.done;
  p.done = null;
  done?.(p.lines.join('\n'));
}

/** Collect + optionally swallow NickServ NOTICE dumps from INFO / ALIST / GLIST / AJOIN. */
export function ingestNickServNotice(raw: string): boolean {
  const s = stripFormatting(raw).replace(/\s+/g, ' ').trim();
  if (!s) return !!nsPending || Date.now() < nsSwallowUntil;
  if (nsPending) {
    nsPending.lines.push(raw);
    if (nsPending.idle) globalThis.clearTimeout(nsPending.idle);
    if (nsDumpEnded(nsPending.kind, s)) finishNickServQuery();
    else nsPending.idle = globalThis.setTimeout(finishNickServQuery, NS_IRC_IDLE_MS);
  }
  if (Date.now() <= nsManualUntil) return false;
  return !!nsPending || Date.now() < nsSwallowUntil;
}

type NsIrcJob = {
  client: IrcClient;
  cmd: string;
  kind: NsKind;
  hardMs: number;
  resolve: (blob: string) => void;
};

const nsIrcQueue: NsIrcJob[] = [];

function pumpNickServIrc(): void {
  if (nsPending) return;
  const job = nsIrcQueue.shift();
  if (!job) return;
  nsSwallowUntil = Date.now() + job.hardMs + 2_000;
  nsPending = {
    kind: job.kind,
    lines: [],
    done: (blob) => {
      nsSwallowUntil = Date.now() + 2_000;
      job.resolve(blob);
      globalThis.setTimeout(pumpNickServIrc, NS_IRC_GAP_MS);
    },
    idle: null,
    hard: globalThis.setTimeout(finishNickServQuery, job.hardMs),
  };
  job.client.privmsg('NickServ', job.cmd);
}

function queryNickServIrc(client: IrcClient, cmd: string, kind: NsKind, hardMs = NS_IRC_HARD_MS): Promise<string> {
  const key = `${kind}:${cmd.trim().toUpperCase()}`;
  const existing = nsIrcWaiters[key];
  if (existing) return existing;
  const p = new Promise<string>((resolve) => {
    nsIrcQueue.push({ client, cmd, kind, hardMs, resolve });
    pumpNickServIrc();
  }).finally(() => {
    delete nsIrcWaiters[key];
  });
  nsIrcWaiters[key] = p;
  return p;
}

async function ircFallback(cmd: string, kind: NsKind, deadline?: number): Promise<string | null> {
  const remain = deadline != null ? deadline - Date.now() : NS_IRC_HARD_MS;
  if (remain < 800) {
    nsStatus(`[Compte NickServ] IRC ${kind} ignoré (plus assez de temps).`);
    return null;
  }
  try {
    const { activeStore } = await import('@/core/networks');
    const client = activeStore()?.getState?.()?.client;
    if (!client?.privmsg) {
      nsStatus(`[Compte NickServ] IRC ${kind} impossible : pas de connexion.`);
      return null;
    }
    nsStatus(`[Compte NickServ] fallback IRC /ns ${cmd}`, 'info');
    const blob = await queryNickServIrc(client, cmd, kind, Math.min(NS_IRC_HARD_MS, remain));
    const preview = nsPreview(blob || '');
    if (preview) nsStatus(`[Compte NickServ] IRC ${kind} : ${preview}`, 'info');
    else nsStatus(`[Compte NickServ] IRC ${kind} : aucune notice.`);
    return blob;
  } catch (e) {
    nsStatus(`[Compte NickServ] IRC ${kind} erreur : ${e instanceof Error ? e.message : 'inconnue'}`);
    return null;
  }
}

type NsFetchOpts = { skipIrc?: boolean; skipRpc?: boolean; deadline?: number };

function rpcLooksDenied(blob: string): boolean {
  const fold = stripFormatting(blob).replace(/\s+/g, ' ').trim();
  if (!fold) return true;
  const help = /syntaxe:|syntax:|acc[eè]s refus|access denied|permission denied|pas identifi|not identified|must be identified|information.{0,40}priv/i.test(fold);
  if (!help) return false;
  if (/\d+\s*[:.)]?\s+!?[#&]/.test(fold)) return false;
  const withoutHelp = fold.replace(/(?:syntaxe|syntax)\s*:\s*\S+/gi, '');
  return !/^[^:]{2,60}:\s+\S/m.test(withoutHelp);
}

const markListeners = new Set<() => void>();
let markRev = 0;
const ajoinMarks = new Set<string>();
const accessMarks = new Set<string>();

function bumpMarks(): void {
  markRev++;
  markListeners.forEach((l) => l());
}

function setAjoinMarks(chans: string[]): void {
  ajoinMarks.clear();
  for (const c of chans) ajoinMarks.add(c.toLowerCase());
  bumpMarks();
}

function setAccessMarks(chans: string[]): void {
  accessMarks.clear();
  for (const c of chans) accessMarks.add(c.toLowerCase());
  bumpMarks();
}

export function subscribeNickServMarks(cb: () => void): () => void {
  markListeners.add(cb);
  return () => { markListeners.delete(cb); };
}

export function getNickServMarksRev(): number {
  return markRev;
}

export function nickServMarksFor(chan: string): { ajoin: boolean; access: boolean } {
  const k = String(chan || '').toLowerCase();
  return { ajoin: ajoinMarks.has(k), access: accessMarks.has(k) };
}

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
    /^(?:informations?\s+(?:à propos (?:du|de|des)|a propos (?:du|de|des)|pour|sur|du)\s+(?:le\s+)?(?:compte\s+|pseudo\s+|nick\s+)?|info(?:rmation)?s?\s+(?:about|for|on)\s+(?:account\s+|nick(?:name)?\s+)?)["«“]?\s*(\S+?)\s*["»”]?\s*:?\s*$/i,
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
    if (/^(fin de|end of)\b/i.test(s)) continue;
    if (/auto-?join|liste de join automatiques|salons auxquels|canaux auxquels|liste d['’]acc[eè]s/i.test(s)) continue;
    if (/^\d+\s*[:.)]?\s*[#&]/.test(s) || /^[#&]\S+$/.test(s)) continue;
    if (/^(syntaxe|syntax)\s*:/i.test(s)) continue;
    if (/op[eé]rateur des services|operat(?:eu)?r of services|services? (?:root|oper)/i.test(s)
      && !s.includes(':')) {
      rows.push({ key: 'Statut', value: s });
      continue;
    }
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
  action: 'nsinfo' | 'nsalist' | 'nshelp' | 'nsglist' | 'nslist' | 'nsajoin',
  extra?: { pattern?: string; flags?: string[]; op?: string; channel?: string; key?: string },
): Promise<string | null> {
  if (!account) return null;
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), NS_RPC_MS);
  beginNickServRpc();
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
    endNickServRpc();
  }
}

type NsAccountRpc = {
  info: string;
  glist: string;
  alist: string;
  ajoin: string;
  http: number;
  error: string;
  notes: string[];
  source: string;
};

/** One identify + INFO/GLIST/ALIST/AJOIN — same fast path as a services root. */
async function nickservAccountRpc(account: string, nick: string): Promise<NsAccountRpc | null> {
  if (!account) return null;
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 10_000);
  beginNickServRpc();
  const empty = (http: number, error: string): NsAccountRpc => ({
    info: '', glist: '', alist: '', ajoin: '', http, error, notes: [], source: nick || account,
  });
  try {
    const r = await fetch(CS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ account, nick, action: 'nsaccount' }),
      signal: ctrl.signal,
    });
    const raw = await r.text();
    let data: {
      ok?: boolean;
      error?: unknown;
      detail?: unknown;
      file?: unknown;
      info?: unknown;
      glist?: unknown;
      alist?: unknown;
      ajoin?: unknown;
      debug?: { source?: unknown; notes?: unknown };
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      nsStatus(`[Compte NickServ] RPC HTTP ${r.status} : réponse non JSON ${nsPreview(raw)}`);
      return empty(r.status, 'non_json');
    }
    const notes = Array.isArray(data.debug?.notes)
      ? data.debug.notes.map((n) => String(n || '')).filter(Boolean)
      : [];
    const source = String(data.debug?.source || nick || account);
    const error = data?.ok ? '' : String(data.error || `http_${r.status}`);
    if (!data?.ok) {
      const detail = String(data.detail || '');
      const hint = error === 'bad_action'
        ? ' — déploie chanserv-rpc.php (action nsaccount absente)'
        : error === 'not_configured'
          ? (detail === 'loaded'
            ? ' — jeton vide ou encore CHANGE_ME dans chanserv-rpc.local.php'
            : ' — chanserv-rpc.local.php absent du webroot (même jeton que wp_anope_sync)')
          : '';
      nsStatus(`[Compte NickServ] RPC HTTP ${r.status} ${error}${detail ? ` (${detail})` : ''}${hint}`);
      for (const n of notes) nsStatus(`[Compte NickServ] ${n}`);
      return { info: '', glist: '', alist: '', ajoin: '', http: r.status, error, notes, source };
    }
    return {
      info: data.info == null ? '' : String(data.info),
      glist: data.glist == null ? '' : String(data.glist),
      alist: data.alist == null ? '' : String(data.alist),
      ajoin: data.ajoin == null ? '' : String(data.ajoin),
      http: r.status,
      error: '',
      notes,
      source,
    };
  } catch (e) {
    const abort = e instanceof DOMException && e.name === 'AbortError';
    const error = abort ? 'timeout_10s' : (e instanceof Error ? e.message : 'fetch');
    nsStatus(`[Compte NickServ] RPC ${abort ? 'coupé après 10 s' : `échec ${error}`}`);
    return empty(0, error);
  } finally {
    window.clearTimeout(to);
    endNickServRpc();
  }
}

function onceFetch<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = nsFetchWaiters[key] as Promise<T> | undefined;
  if (hit) return hit;
  const p = run().finally(() => {
    if (nsFetchWaiters[key] === p) delete nsFetchWaiters[key];
  });
  nsFetchWaiters[key] = p;
  return p;
}

export type NickServAccess = {
  channel: string;
  access: string;
  description: string;
  noExpire: boolean;
};

function isAlistNoise(s: string): boolean {
  return /^(fin\s+de|end of|num[eé]ro|number\s+channel|n[°º]\b)/i.test(s)
    || /a acc[eè]s|has access on|access list|liste d['’]acc[eè]s|salons auxquels|canaux auxquels/i.test(s)
    || /^(syntaxe|syntax)\s*:/i.test(s)
    || /acc[eè]s refus|access denied|permission denied/i.test(s);
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
    const numberedBare = s.match(/^\d+\s*[:.)]?\s+(!?[#&]\S+)\s*$/);
    if (numberedBare) {
      pushAlistRow(rows, seen, numberedBare[1], '');
      continue;
    }
    const numbered = s.match(/^\d+\s+(!?[#&]\S+)\s+(\S+)(?:\s+(.*))?$/);
    const simple = numbered ? null : s.match(/^(!?[#&]\S+)\s+(\S+)(?:\s+(.*))?$/);
    const m = numbered || simple;
    if (!m) {
      if (rows.length && !/^\d+/.test(s) && !/^(syntaxe|syntax)\b/i.test(s)) {
        const prev = rows[rows.length - 1];
        const leftover = s.replace(/^[()]|[()]$/g, '').trim();
        if (!prev.access) {
          const acc = leftover.match(
            /^(Fondateur(?:ice)?|Successeur(?:\(e\))?|QOP|SOP|AOP|HOP|VOP|Founder|Successor|Owner)\b[,\s]*(.*)$/i,
          );
          if (acc) {
            prev.access = acc[1];
            const rest = acc[2].trim();
            if (rest) prev.description = `${prev.description} ${rest}`.trim();
            continue;
          }
        }
        prev.description = `${prev.description} ${leftover}`.trim();
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

const INFO_KEY_OK = /^(compte|account|enregistr|registered|options?|e-?mail|adresse|vhost|pseudo|nicks?|langue|language|protection|url|statut|derni[eè]re|vu pour|last |hide|id\b)/i;

function infoLooksPlausible(info: NickServInfo): boolean {
  if (!info.rows.length) return false;
  if (info.rows.some((r) => /auto-?join|ajoin|liste d['’]acc[eè]s|salons auxquels/i.test(r.key))) return false;
  return info.rows.some((r) => INFO_KEY_OK.test(r.key));
}

/** Read NickServ INFO — JSON-RPC as the user, else `/ns info` notices. */
export async function fetchNickServInfo(account: string, nick = '', opts?: NsFetchOpts): Promise<NickServInfo | null> {
  const parse = (blob: string | null) => {
    if (!blob || rpcLooksDenied(blob)) return null;
    const parsed = parseNickServInfo(blob, account);
    return parsed.rows.length && infoLooksPlausible(parsed) ? parsed : null;
  };
  let fromRpc: NickServInfo | null = null;
  if (!opts?.skipRpc) {
    fromRpc = parse(await nickservRpc(account, nick, 'nsinfo'));
    if (fromRpc) return fromRpc;
  }
  if (opts?.skipIrc) return fromRpc;
  return parse(await ircFallback('INFO', 'INFO', opts?.deadline));
}

export function isNickServNicksRow(key: string): boolean {
  return /^(nicks?|pseudos?(?:\s+enregistr[ée]s?)?)$/i.test(String(key || '').trim());
}

const GLIST_SKIP = /^(liste des pseudos|nicknames registered|pseudos appartenant|fin de|end of|syntaxe:|syntax:|num[eé]ro|pseudo\s+enregistr|nicks?\s+registered|\d+\s+pseudos?|compte|account)\b/i;
const NICK_TOKEN = /^[A-Za-z\[\]\\^{|}`][A-Za-z0-9_\[\]\\^{|}`-]{0,31}$/;

/** NickServ GLIST blob → grouped nicknames on the account. */
export function parseNickServGlist(raw: string): string[] {
  const nicks: string[] = [];
  const seen = new Set<string>();
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s || GLIST_SKIP.test(s)) continue;
    const m = s.match(/^(?:\d+\s*[.)]\s*)?(\S+)/);
    const nick = m?.[1]?.replace(/[,.;:]+$/, '') || '';
    if (!NICK_TOKEN.test(nick)) continue;
    if (/^(pseudo|nick(?:name)?s?|expire|enregistr|informations?|adresse|vhost|url|protection|options?|num[eé]ro|salon|langue|language|compte|account|derni[eè]re|e-?mail)$/i.test(nick)) continue;
    const fold = nick.toLowerCase();
    if (seen.has(fold)) continue;
    seen.add(fold);
    nicks.push(nick);
  }
  return nicks;
}

function glistLooksPlausible(nicks: string[]): boolean {
  return nicks.every((n) => !/^(informations?|adresse|vhost|url|protection|options?|num[eé]ro|salon|enregistr|langue|language|compte|account|derni[eè]re)$/i.test(n));
}

export async function fetchNickServGlist(account: string, nick = '', opts?: NsFetchOpts): Promise<string[] | null> {
  const parse = (blob: string | null) => {
    if (blob == null) return null;
    if (rpcLooksDenied(blob)) return null;
    const nicks = parseNickServGlist(blob);
    return glistLooksPlausible(nicks) ? nicks : null;
  };
  let fromRpc: string[] | null = null;
  if (!opts?.skipRpc) {
    fromRpc = parse(await nickservRpc(account, nick, 'nsglist'));
    if (fromRpc && fromRpc.length) return fromRpc;
  }
  if (opts?.skipIrc) return fromRpc;
  const fromIrc = parse(await ircFallback('GLIST', 'GLIST', opts?.deadline));
  if (fromIrc) return fromIrc;
  return fromRpc;
}

/** NickServ LIST blob → matching nicknames (search). */
export function parseNickServList(raw: string): { nicks: string[]; denied: boolean } {
  const fold = stripFormatting(raw).replace(/\s+/g, ' ').trim();
  const looksDenied = /syntaxe:|syntax:|acc[eè]s refus|access denied|permission/i.test(fold);
  const looksHits = /\(\s*(?:compte|account)\s*:/i.test(fold) || /\d+\s*[.)]\s+\S+/.test(fold);
  if (looksDenied && !looksHits) {
    return { nicks: [], denied: true };
  }
  const nicks: string[] = [];
  const seen = new Set<string>();
  const push = (rawNick: string) => {
    const nick = String(rawNick || '').replace(/[,.;:]+$/, '');
    if (!NICK_TOKEN.test(nick)) return;
    if (/^(pseudo|nick(?:name)?s?|expire|enregistr|compte|account|liste|list|fin)$/i.test(nick)) return;
    const key = nick.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    nicks.push(nick);
  };
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s || /^(liste des|list of|matching|fin de|end of|syntaxe:|syntax:|num[eé]ro)/i.test(s)) continue;
    const withAcct = [...s.matchAll(/([A-Za-z\[\]\\^{|}`][A-Za-z0-9_\[\]\\^{|}`-]{0,31})\s*\(\s*(?:compte|account)\s*:/gi)];
    if (withAcct.length) {
      for (const m of withAcct) push(m[1]);
      continue;
    }
    const m = s.match(/^(?:\d+\s*[.)]?\s+|[-•]\s*)(\S+)/) || s.match(/^(\S+)$/);
    if (m) push(m[1]);
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
  const q = String(pattern || '').trim();
  if (!q) return { nicks: [], denied: false };
  const extra = flags.map((f) => String(f || '').toUpperCase()).filter(Boolean);
  const parse = (blob: string | null) => (blob == null ? null : parseNickServList(blob));
  const rpc = await nickservRpc(account, nick, 'nslist', { pattern: q, flags: extra });
  const fromRpc = parse(rpc);
  if (fromRpc && !fromRpc.denied && fromRpc.nicks.length) return fromRpc;
  const cmd = ['LIST', q, ...extra].join(' ');
  const fromIrc = parse(await ircFallback(cmd, 'LIST'));
  if (fromIrc && !fromIrc.denied) return fromIrc;
  return fromIrc ?? fromRpc;
}

/** Read NickServ ALIST — JSON-RPC as the user, else `/ns alist` notices. */
export async function fetchNickServAlist(account: string, nick = '', force = false, opts?: NsFetchOpts): Promise<NickServAccess[] | null> {
  const run = async () => {
    const fromBlob = (blob: string | null): NickServAccess[] | null => {
      if (blob == null) return null;
      const rows = parseNickServAlist(blob);
      if (rows.length) return rows;
      if (rpcLooksDenied(blob)) return null;
      return isAlistEmpty(stripFormatting(blob).replace(/\s+/g, ' ').trim()) ? [] : [];
    };
    let fromRpc: NickServAccess[] | null = null;
    if (!opts?.skipRpc) {
      fromRpc = fromBlob(await nickservRpc(account, nick, 'nsalist'));
      if (fromRpc && fromRpc.length) {
        setAccessMarks(fromRpc.map((r) => r.channel));
        return fromRpc;
      }
    }
    if (opts?.skipIrc) return fromRpc;
    const fromIrc = fromBlob(await ircFallback('ALIST', 'ALIST', opts?.deadline));
    const rows = fromIrc ?? fromRpc;
    if (rows == null) return null;
    setAccessMarks(rows.map((r) => r.channel));
    return rows;
  };
  if (force || opts?.skipIrc || opts?.skipRpc) return run();
  return onceFetch(`alist:${foldAccount(account)}:${foldAccount(nick)}`, run);
}

function isAjoinNoise(s: string): boolean {
  return /^(fin de|end of|syntaxe|syntax|num[eé]ro|liste d(?:es|['’])\s*auto-?joins?|ajoins?\s+for|auto-?joins?\s+(for|de))\b/i.test(s)
    || /acc[eè]s refus|access denied/i.test(s)
    || /cette commande g[eè]re|g[eè]re votre liste d['’]?auto/i.test(s)
    || /op[eé]rateurs? des services peuvent|tapez\s+\/?ns\b/i.test(s);
}

function isAjoinEmpty(s: string): boolean {
  return /aucun auto-?join|no auto-?join|liste d['’]auto-?join (est )?vide/i.test(s);
}

/** NickServ AJOIN LIST blob → channel names. */
export function parseNickServAjoin(raw: string): string[] {
  const chans: string[] = [];
  const seen = new Set<string>();
  for (const line of String(raw || '').split(/\n/)) {
    const s = stripFormatting(line).replace(/\s+/g, ' ').trim();
    if (!s || isAjoinNoise(s) || isAjoinEmpty(s)) continue;
    const m = s.match(/^(?:\d+\s*[:.)]\s*)?([#&][^\s,]+)/);
    if (!m) continue;
    const channel = m[1].replace(/[,.;:]+$/, '');
    const key = channel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chans.push(channel);
  }
  return chans;
}

export async function fetchNickServAjoin(account: string, nick = '', force = false, opts?: NsFetchOpts): Promise<string[] | null> {
  const run = async () => {
    const fromBlob = (blob: string | null): string[] | null => {
      if (blob == null) return null;
      const chans = parseNickServAjoin(blob);
      if (chans.length) return chans;
      if (rpcLooksDenied(blob) && !isAjoinEmpty(stripFormatting(blob).replace(/\s+/g, ' ').trim())) return null;
      return [];
    };
    let fromRpc: string[] | null = null;
    if (!opts?.skipRpc) {
      fromRpc = fromBlob(await nickservRpc(account, nick, 'nsajoin'));
      if (fromRpc && fromRpc.length) {
        setAjoinMarks(fromRpc);
        return fromRpc;
      }
    }
    if (opts?.skipIrc) return fromRpc;
    const fromIrc = fromBlob(await ircFallback('AJOIN LIST', 'AJOIN', opts?.deadline));
    const chans = fromIrc ?? fromRpc;
    if (chans == null) return null;
    setAjoinMarks(chans);
    return chans;
  };
  if (force || opts?.skipIrc || opts?.skipRpc) return run();
  return onceFetch(`ajoin:${foldAccount(account)}:${foldAccount(nick)}`, run);
}

export type NickServAccountSnapshot = {
  info: NickServInfo | null;
  glist: string[];
  alist: NickServAccess[] | null;
  ajoin: string[] | null;
};

let nsSnapInflight: Promise<NickServAccountSnapshot> | null = null;
let nsSnapCache: { key: string; at: number; data: NickServAccountSnapshot } | null = null;
const NS_SNAP_TTL_MS = 90_000;

/** RPC in parallel, then IRC fallbacks (INFO first) until the 30s Compte deadline. */
export async function loadNickServAccountSnapshot(
  account: string,
  nick = '',
  opts?: { force?: boolean },
): Promise<NickServAccountSnapshot> {
  const empty: NickServAccountSnapshot = { info: null, glist: [], alist: null, ajoin: null };
  if (!account) return empty;
  const key = `${foldAccount(account)}:${foldAccount(nick)}`;
  if (!opts?.force && nsSnapCache && nsSnapCache.key === key && Date.now() - nsSnapCache.at < NS_SNAP_TTL_MS) {
    return nsSnapCache.data;
  }
  if (nsSnapInflight) {
    const data = await nsSnapInflight;
    if (!opts?.force) return data;
  }
  let partial: NickServAccountSnapshot = empty;
  const work = (async (): Promise<NickServAccountSnapshot> => {
    const deadline = Date.now() + NS_ACCOUNT_WAIT_MS;
    const bundle = await nickservAccountRpc(account, nick);
    const rpcFailed = !!(bundle?.error);
    if (bundle && !rpcFailed) {
      nsStatus(
        `[Compte NickServ] RPC HTTP ${bundle.http} source=${bundle.source} compte=${account}`,
        'info',
      );
      for (const n of bundle.notes) nsStatus(`[Compte NickServ] ${n}`, /fail|vide|rpc /i.test(n) ? 'warning' : 'info');
    } else if (!bundle) {
      nsStatus('[Compte NickServ] RPC nsaccount : pas de réponse');
    }
    const infoR = bundle && !rpcFailed ? (() => {
      if (!bundle.info || rpcLooksDenied(bundle.info)) {
        if (bundle.info) nsStatus(`[Compte NickServ] INFO RPC refusé : ${nsPreview(bundle.info)}`);
        else if (!bundle.error) nsStatus('[Compte NickServ] INFO RPC vide');
        return null;
      }
      const parsed = parseNickServInfo(bundle.info, account);
      if (!parsed.rows.length || !infoLooksPlausible(parsed)) {
        nsStatus(`[Compte NickServ] INFO RPC illisible : ${nsPreview(bundle.info)}`);
        return null;
      }
      nsStatus(`[Compte NickServ] INFO RPC ok (${parsed.rows.length} champs)`, 'info');
      return parsed;
    })() : null;
    const glistR = bundle && !rpcFailed ? (() => {
      if (!bundle.glist || rpcLooksDenied(bundle.glist)) {
        if (bundle.glist) nsStatus(`[Compte NickServ] GLIST RPC refusé : ${nsPreview(bundle.glist)}`);
        return null;
      }
      const nicks = parseNickServGlist(bundle.glist);
      if (!glistLooksPlausible(nicks)) {
        nsStatus(`[Compte NickServ] GLIST RPC illisible : ${nsPreview(bundle.glist)}`);
        return null;
      }
      nsStatus(`[Compte NickServ] GLIST RPC ok (${nicks.length})`, 'info');
      return nicks;
    })() : null;
    const alistR = bundle && !rpcFailed ? (() => {
      if (!bundle.alist) {
        nsStatus('[Compte NickServ] ALIST RPC vide');
        return null;
      }
      const rows = parseNickServAlist(bundle.alist);
      if (rows.length) {
        nsStatus(`[Compte NickServ] ALIST RPC ok (${rows.length} salons)`, 'info');
        return rows;
      }
      if (rpcLooksDenied(bundle.alist)) {
        nsStatus(`[Compte NickServ] ALIST RPC refusé : ${nsPreview(bundle.alist)}`);
        return null;
      }
      nsStatus('[Compte NickServ] ALIST RPC : aucun salon', 'info');
      return isAlistEmpty(stripFormatting(bundle.alist).replace(/\s+/g, ' ').trim()) ? [] : [];
    })() : null;
    const ajoinR = bundle && !rpcFailed ? (() => {
      if (!bundle.ajoin) {
        nsStatus('[Compte NickServ] AJOIN RPC vide');
        return null;
      }
      const chans = parseNickServAjoin(bundle.ajoin);
      if (chans.length) {
        nsStatus(`[Compte NickServ] AJOIN RPC ok (${chans.length})`, 'info');
        return chans;
      }
      const fold = stripFormatting(bundle.ajoin).replace(/\s+/g, ' ').trim();
      if (rpcLooksDenied(bundle.ajoin) && !isAjoinEmpty(fold)) {
        nsStatus(`[Compte NickServ] AJOIN RPC refusé : ${nsPreview(bundle.ajoin)}`);
        return null;
      }
      nsStatus('[Compte NickServ] AJOIN RPC : liste vide', 'info');
      return [];
    })() : null;
    if (alistR) setAccessMarks(alistR.map((r) => r.channel));
    if (ajoinR) setAjoinMarks(ajoinR);
    partial = { info: infoR, glist: glistR ?? [], alist: alistR, ajoin: ajoinR };
    const irc = { skipRpc: true as const, deadline };
    if (!partial.info) {
      const info = await fetchNickServInfo(account, nick, irc);
      if (info) partial = { ...partial, info };
    }
    if (glistR == null) {
      const glist = await fetchNickServGlist(account, nick, irc);
      if (glist && glist.length) partial = { ...partial, glist };
    }
    if (partial.alist == null) {
      const alist = await fetchNickServAlist(account, nick, true, irc);
      if (alist != null) partial = { ...partial, alist };
    }
    if (partial.ajoin == null) {
      const ajoin = await fetchNickServAjoin(account, nick, true, irc);
      if (ajoin != null) partial = { ...partial, ajoin };
    }
    nsSnapCache = { key, at: Date.now(), data: partial };
    nsMarksKey = foldAccount(account);
    nsMarksAt = Date.now();
    return partial;
  })();
  nsSnapInflight = work;
  void work.finally(() => {
    if (nsSnapInflight === work) nsSnapInflight = null;
  });
  const timed = new Promise<NickServAccountSnapshot>((resolve) => {
    globalThis.setTimeout(() => {
      nsStatus('[Compte NickServ] délai 30 s — affichage de ce qui a pu être chargé');
      resolve(partial);
    }, NS_ACCOUNT_WAIT_MS);
  });
  return await Promise.race([work, timed]);
}

export async function refreshNickServMarks(account: string, nick = ''): Promise<void> {
  const key = foldAccount(account);
  if (!key) {
    setAjoinMarks([]);
    setAccessMarks([]);
    nsMarksKey = '';
    nsMarksAt = 0;
    return;
  }
  if (nsMarksInflight) return nsMarksInflight;
  if (key === nsMarksKey && Date.now() - nsMarksAt < NS_MARKS_COOLDOWN_MS) return;
  nsMarksInflight = (async () => {
    try {
      await fetchNickServAlist(account, nick);
      await fetchNickServAjoin(account, nick);
      nsMarksKey = key;
      nsMarksAt = Date.now();
    } catch {
      /* RPC / IRC unavailable — badges stay as last known. */
    } finally {
      nsMarksInflight = null;
    }
  })();
  return nsMarksInflight;
}

function normChan(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return /^[#&]/.test(s) ? s : `#${s}`;
}

async function nickServAjoinMutate(
  account: string,
  nick: string,
  op: 'ADD' | 'DEL',
  chan: string,
  key = '',
): Promise<boolean> {
  const name = normChan(chan);
  if (!name) return false;
  const rpc = await nickservRpc(account, nick, 'nsajoin', {
    op, channel: name, ...(key ? { key } : {}),
  });
  if (rpc == null || rpcLooksDenied(rpc)) {
    const cmd = op === 'DEL' ? `AJOIN DEL ${name}` : `AJOIN ADD ${name}${key ? ` ${key}` : ''}`;
    await ircFallback(cmd, 'AJOIN');
  }
  nsSnapCache = null;
  const list = await fetchNickServAjoin(account, nick, true);
  const has = (list || []).some((c) => c.toLowerCase() === name.toLowerCase());
  return op === 'DEL' ? !has : has;
}

export async function nickServAjoinAdd(account: string, nick: string, chan: string, key = ''): Promise<boolean> {
  return nickServAjoinMutate(account, nick, 'ADD', chan, key);
}

export async function nickServAjoinDel(account: string, nick: string, chan: string): Promise<boolean> {
  return nickServAjoinMutate(account, nick, 'DEL', chan);
}

export type NickServAccessRow = NickServAccess & { ajoin: boolean };

/** Merge ALIST + AJOIN: auto-join is a badge, not an access level. */
export function mergeAlistAndAjoin(alist: NickServAccess[], ajoin: string[]): NickServAccessRow[] {
  const map = new Map<string, NickServAccessRow>();
  for (const row of alist) {
    const channel = String(row.channel || '').trim();
    if (!channel) continue;
    map.set(channel.toLowerCase(), { ...row, channel, ajoin: false });
  }
  for (const raw of ajoin) {
    const channel = String(raw || '').trim();
    if (!channel) continue;
    const key = channel.toLowerCase();
    const prev = map.get(key);
    if (prev) prev.ajoin = true;
    else map.set(key, { channel, access: '', description: '', noExpire: false, ajoin: true });
  }
  return [...map.values()].sort((a, b) => a.channel.localeCompare(b.channel, undefined, { sensitivity: 'base' }));
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

const NS_OPER_HELP = ['SASET', 'SAREGISTER', 'SUSPEND', 'UNSUSPEND', 'MASSSET', 'GETEMAIL'];

/** NickServ HELP lists SA* / GETEMAIL only for services operators. */
export function nickServHelpIsOper(cmds: Set<string> | null | undefined): boolean {
  if (!cmds) return false;
  return NS_OPER_HELP.some((c) => cmds.has(c));
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
  { cmd: 'AJOIN', key: 'ajoin', args: true, hide: true },
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
