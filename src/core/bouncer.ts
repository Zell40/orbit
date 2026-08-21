// Bouncer (ZNC / KiwiBNC) connection helpers.
//
// The bouncer password is a server PASS (`user/network:password`), not SASL.
// It lives in sessionStorage (same-tab reload) and is never written to
// localStorage. Only the last URL + nick are remembered across visits.

import type { ConnectOptions } from './irc/types';

const PREFS_KEY = 'orbit-bouncer-prefs';
const passKey = (url: string, nick: string) => `orbit-bouncer-pass:${url}|${nick}`;
const saslKey = (url: string, nick: string) => `orbit-bouncer-sasl:${url}|${nick}`;

export interface BouncerPrefs { url: string; nick: string }

export function saveBouncerSession(
  url: string,
  nick: string,
  serverPassword: string,
  saslPassword?: string,
): void {
  try {
    sessionStorage.setItem(passKey(url, nick), serverPassword);
    if (saslPassword) sessionStorage.setItem(saslKey(url, nick), saslPassword);
    else sessionStorage.removeItem(saslKey(url, nick));
    localStorage.setItem(PREFS_KEY, JSON.stringify({ url, nick } as BouncerPrefs));
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
    if (r && typeof r.url === 'string' && r.url && typeof r.nick === 'string') return r;
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
