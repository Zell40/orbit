import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bouncerConnectOpts, loadBouncerPass, loadBouncerPrefs, saveBouncerSession, zncPass } from './bouncer';

describe('zncPass', () => {
  it('builds user/network:password like Kiwi’s three fields', () => {
    expect(zncPass('alice', 'EntreNous', 's3cret')).toBe('alice/EntreNous:s3cret');
  });
  it('omits the network when it is empty (ZNC default network)', () => {
    expect(zncPass('alice', '  ', 's3cret')).toBe('alice:s3cret');
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
