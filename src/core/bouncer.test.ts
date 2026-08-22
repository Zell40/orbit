import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bouncerConnectOpts, loadBouncerPass, loadBouncerPrefs, saveBouncerSession, zncPass, bouncerAuthFailHref } from './bouncer';

describe('zncPass', () => {
  it('builds user/network:password like Kiwi’s three fields', () => {
    expect(zncPass('alice', 'EntreNous', 's3cret')).toBe('alice/EntreNous:s3cret');
  });
  it('omits the network when it is empty (ZNC default network)', () => {
    expect(zncPass('alice', '  ', 's3cret')).toBe('alice:s3cret');
  });
  it('keeps ZNC username case (zell ≠ Zell)', () => {
    expect(zncPass('zell', '', 's3cret')).toBe('zell:s3cret');
    expect(zncPass('Zell', '', 's3cret')).toBe('Zell:s3cret');
  });
});

describe('bouncerAuthFailHref', () => {
  it('sends the user back to MonIdentité with the attempted ZNC user', () => {
    expect(bouncerAuthFailHref('https://www.reseau-entrenous.fr/mon-entrenous/identite/', {
      nick: 'Zell',
      zncUser: 'Zell',
    })).toBe('https://www.reseau-entrenous.fr/mon-entrenous/identite/?erreur=znc_auth&znc_user=Zell&nick=Zell');
  });
});

describe('bouncerConnectOpts', () => {
  it('sends the bouncer secret as PASS, not SASL', () => {
    const o = bouncerConnectOpts({
      url: 'wss://bnc.example/ws',
      nick: 'bob',
      serverPassword: 'bob/entrenous:secret',
      channels: ['#x'],
    });
    expect(o.serverPassword).toBe('bob/entrenous:secret');
    expect(o.password).toBeUndefined();
    expect(o.channels).toEqual(['#x']);
  });

  it('keeps an optional NickServ password as SASL', () => {
    const o = bouncerConnectOpts({
      url: 'wss://bnc.example/ws',
      nick: 'bob',
      serverPassword: 'bob/net:znc',
      saslPassword: 'nickserv',
    });
    expect(o.serverPassword).toBe('bob/net:znc');
    expect(o.password).toBe('nickserv');
    expect(o.channels).toEqual([]);
  });
});

describe('bouncer session storage', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    const stub = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    };
    (globalThis as unknown as { sessionStorage: typeof stub }).sessionStorage = stub;
    (globalThis as unknown as { localStorage: typeof stub }).localStorage = stub;
  });
  afterEach(() => {
    delete (globalThis as unknown as { sessionStorage?: unknown }).sessionStorage;
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it('remembers URL+nick in localStorage and the PASS in sessionStorage', () => {
    saveBouncerSession('wss://bnc/x', 'bob', 'bob/net:pw', 'sasl');
    expect(loadBouncerPrefs()).toEqual({ url: 'wss://bnc/x', nick: 'bob' });
    expect(loadBouncerPass('wss://bnc/x', 'bob')).toEqual({
      serverPassword: 'bob/net:pw',
      saslPassword: 'sasl',
    });
  });
});
