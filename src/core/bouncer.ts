// Bouncer (ZNC / KiwiBNC) connection helpers.
//
// The bouncer password is a server PASS (`user:password`), not SASL.
// Network is omitted: ZNC uses its default. The WebSocket URL comes from config.

import type { ConnectOptions } from './irc/types';

const PREFS_KEY = 'orbit-bouncer-prefs';
const passKey = (url: string, nick: string) => `orbit-bouncer-pass:${url}|${nick}`;
const saslKey = (url: string, nick: string) => `orbit-bouncer-sasl:${url}|${nick}`;

export interface BouncerPrefs { url: string; nick: string; network?: string }

/** Build ZNC’s PASS token from the same three fields Kiwi asks for. */
export function zncPass(user: string, network: string, password: string): string {
  const u = user.trim();
  const n = network.trim();
  const p = password.trim();
  return n ? `${u}/${n}:${p}` : `${u}:${p}`;
}

export function saveBouncerSession(
  url: string,
  nick: string,
  serverPassword: string,
  saslPassword?: string,
  network?: string,
): void {
  try {
    sessionStorage.setItem(passKey(url, nick), serverPassword);
    if (saslPassword) sessionStorage.setItem(saslKey(url, nick), saslPassword);
    else sessionStorage.removeItem(saslKey(url, nick));
    const prefs: BouncerPrefs = { url, nick };
    if (network) prefs.network = network;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* storage blocked */ }
}

export function loadBouncerPass(url: string, nick: string): { serverPassword?: string; saslPassword?: string } {
  try {
    return {
      serverPassword: sessionStorage.getItem(passKey(url, nick)) || undefined,
      saslPassword: sessionStorage.getItem(saslKey(url, nick)) || undefined,
    };
  } catch { return {}; }
}

export function loadBouncerPrefs(): BouncerPrefs | null {
  try {
    const r = JSON.parse(localStorage.getItem(PREFS_KEY) || '') as BouncerPrefs;
    if (r && typeof r.url === 'string' && r.url && typeof r.nick === 'string') {
      if (typeof r.network !== 'string') delete r.network;
      return r;
    }
  } catch { /* ignore */ }
  return null;
}

export function bouncerConnectOpts(o: {
  url: string;
  nick: string;
  serverPassword: string;
  channels?: string[];
  saslPassword?: string;
  realname?: string;
}): ConnectOptions {
  return {
    url: o.url,
    nick: o.nick,
    serverPassword: o.serverPassword,
    password: o.saslPassword || undefined,
    channels: o.channels ?? [],
    realname: o.realname,
  };
}
