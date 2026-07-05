import { describe, it, expect } from 'vitest';
import { isService, maskSecret, detectServiceLeak, routeMessage } from './index';

describe('isService', () => {
  it('recognises the standard services (case-insensitive)', () => {
    for (const s of ['NickServ', 'chanserv', 'HostServ', 'MemoServ', 'BotServ', 'OperServ', 'HelpServ', 'GameServ'])
      expect(isService(s)).toBe(true);
  });
  it('does not treat ordinary nicks as services', () => {
    for (const n of ['alice', 'observer', 'server', 'conservative', 'nick'])
      expect(isService(n)).toBe(false);
  });
});

describe('maskSecret', () => {
  it('masks the password but keeps the account in IDENTIFY <acct> <pw>', () => {
    expect(maskSecret('IDENTIFY Mik hunter2!')).toBe('IDENTIFY Mik ••••••••');
  });
  it('masks the single-arg IDENTIFY <pw>', () => {
    expect(maskSecret('IDENTIFY hunter2!')).toBe('IDENTIFY ••••••••');
  });
  it('masks GHOST nick pass (keeps the nick)', () => {
    expect(maskSecret('GHOST Mik secret9')).toBe('GHOST Mik ••••••••');
  });
  it('masks REGISTER pass and SET PASSWORD pass', () => {
    expect(maskSecret('REGISTER s3cret me@x.fr')).toBe('REGISTER •••••••• me@x.fr');
    expect(maskSecret('SET PASSWORD s3cret')).toBe('SET PASSWORD ••••••••');
  });
  it('masks an oper SASET <nick> PASSWORD <pw> (keeps the nick)', () => {
    expect(maskSecret('SASET Mik PASSWORD s3cret')).toBe('SASET Mik PASSWORD ••••••••');
  });
  it('leaves non-credential text untouched', () => {
    expect(maskSecret('hello world')).toBe('hello world');
  });
});

describe('routeMessage', () => {
  const base = { isChannel: false, reportService: false, serviceParty: false, isNotice: false };
  it('sends channel targets to the channel', () => {
    expect(routeMessage({ ...base, isChannel: true })).toBe('channel');
  });
  it('sends the report service to the status window', () => {
    expect(routeMessage({ ...base, reportService: true })).toBe('report');
  });
  it('keeps notices and services traffic in the active window', () => {
    expect(routeMessage({ ...base, isNotice: true })).toBe('active');
    expect(routeMessage({ ...base, serviceParty: true })).toBe('active');
    expect(routeMessage({ ...base, serviceParty: true, isNotice: false })).toBe('active');
  });
  it('opens a query only for a genuine user PRIVMSG', () => {
    expect(routeMessage(base)).toBe('query');
  });
});

describe('detectServiceLeak', () => {
  it('catches a credential-shaped IDENTIFY typed without a slash', () => {
    expect(detectServiceLeak('IDENTIFY Mik avaava2020@!!'))
      .toEqual({ service: 'NickServ', command: 'IDENTIFY Mik avaava2020@!!' });
  });
  it('does NOT hijack normal chat that starts with "identify"', () => {
    expect(detectServiceLeak('identify the killer')).toBeNull();
  });
  it('routes an explicit "ns identify …" to NickServ', () => {
    const r = detectServiceLeak('ns identify hunter2');
    expect(r?.service).toBe('NickServ');
    expect(r?.command).toBe('identify hunter2');
  });
  it('routes "cs …" and "chanserv …" to ChanServ', () => {
    expect(detectServiceLeak('cs op #dev')?.service).toBe('ChanServ');
    expect(detectServiceLeak('chanserv access #dev list')?.service).toBe('ChanServ');
  });
});
