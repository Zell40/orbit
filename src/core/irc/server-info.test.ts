import { describe, it, expect } from 'vitest';
import { ServerInfo } from './server-info';
import { parseLine } from './parser';

describe('ServerInfo — ISUPPORT (005)', () => {
  it('parses tokens and derives the limits + prefix map', () => {
    const s = new ServerInfo();
    s.applyISupport(parseLine(
      ':srv 005 me CHANTYPES=# PREFIX=(qaohv)~&@%+ NICKLEN=25 CHANNELLEN=64 NETWORK=IRC4Fun CASEMAPPING=ascii SAFELIST :are supported by this server',
    ));
    expect(s.chantypes).toBe('#');
    expect(s.casemapping).toBe('ascii');
    expect(s.network).toBe('IRC4Fun');
    expect(s.nicklen).toBe(25);
    expect(s.channellen).toBe(64);
    expect(s.prefixModes).toBe('~&@%+');
    expect(s.prefixModeToChar).toEqual({ q: '~', a: '&', o: '@', h: '%', v: '+' });
    expect(s.isupport['CHANTYPES']).toBe('#');
    expect(s.isupport['SAFELIST']).toBe(''); // valueless token
  });

  it('merges tokens across multiple 005 lines', () => {
    const s = new ServerInfo();
    s.applyISupport(parseLine(':srv 005 me NICKLEN=30 :are supported'));
    s.applyISupport(parseLine(':srv 005 me TOPICLEN=307 VAPID=abc123 :are supported'));
    expect(s.nicklen).toBe(30);
    expect(s.topiclen).toBe(307);
    expect(s.vapid).toBe('abc123');
  });

  it('keeps sane defaults when a numeric token is garbage', () => {
    const s = new ServerInfo();
    s.applyISupport(parseLine(':srv 005 me NICKLEN=oops :are supported'));
    expect(s.nicklen).toBe(30); // fell back to the default
  });
});

describe('ServerInfo — server info + user counts', () => {
  it('takes name + version from RPL_MYINFO (004)', () => {
    const s = new ServerInfo();
    s.applyMyInfo(parseLine(':srv 004 me irc.example.net server-4 iowx bklet'));
    expect(s.serverName).toBe('irc.example.net');
    expect(s.serverVersion).toBe('server-4');
  });

  it('falls back to RPL_YOURHOST (002) for the version only when unset', () => {
    const s = new ServerInfo();
    s.applyYourHost(parseLine(':srv 002 me :Your host is irc.x, running version Ergo-2.14'));
    expect(s.serverVersion).toBe('Ergo-2.14');
    s.applyYourHost(parseLine(':srv 002 me :Your host is irc.x, running version OTHER'));
    expect(s.serverVersion).toBe('Ergo-2.14'); // not overwritten
  });

  it('sums users + invisible from RPL_LUSERCLIENT (251)', () => {
    const s = new ServerInfo();
    s.applyLuserClient(parseLine(':srv 251 me :There are 42 users and 5 invisible on 3 servers'));
    expect(s.users).toBe(47);
  });

  it('prefers the explicit RPL_GLOBALUSERS (266) count', () => {
    const s = new ServerInfo();
    s.applyGlobalUsers(parseLine(':srv 266 me 128 200 :Current global users 128, max 200'));
    expect(s.users).toBe(128);
  });
});
