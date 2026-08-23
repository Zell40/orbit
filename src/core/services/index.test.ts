import { describe, it, expect } from 'vitest';
import { isService, isNickServ, maskSecret, detectServiceLeak, routeMessage, hasServiceTag, shouldPopupNickServ } from './index';

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

describe('hasServiceTag', () => {
  it('detects a vendor <host>/service tag', () => {
    expect(hasServiceTag({ 'example.org/service': '', msgid: 'x' })).toBe(true);
  });
  it('detects any vendor <host>/service tag (ircd-agnostic)', () => {
    expect(hasServiceTag({ 'example.net/service': '' })).toBe(true);
  });
  it('ignores client (+) tags and unrelated tags', () => {
    expect(hasServiceTag({ '+draft/reply': 'x', 'server-time': 't' })).toBe(false);
    expect(hasServiceTag({ '+weird/service': '' })).toBe(false);
    expect(hasServiceTag({})).toBe(false);
  });
});

describe('routeMessage', () => {
  const base = { isChannel: false, reportService: false, nickServParty: false, serviceParty: false, isNotice: false };
  it('sends channel targets to the channel', () => {
    expect(routeMessage({ ...base, isChannel: true })).toBe('channel');
  });
  it('sends the report service to the status window', () => {
    expect(routeMessage({ ...base, reportService: true })).toBe('report');
  });
  it('sends NickServ traffic to the status window', () => {
    expect(routeMessage({ ...base, nickServParty: true })).toBe('report');
  });
  it('does not treat notices as a query to open', () => {
    expect(routeMessage({ ...base, isNotice: true })).toBe('active');
    expect(routeMessage({ ...base, serviceParty: true })).toBe('active');
    expect(routeMessage({ ...base, serviceParty: true, isNotice: false })).toBe('active');
  });
  it('opens a query only for a genuine user PRIVMSG', () => {
    expect(routeMessage(base)).toBe('query');
  });
});

describe('shouldPopupNickServ', () => {
  it('suppresses routine IDENTIFY acks', () => {
    expect(shouldPopupNickServ('Password accepted — you are now recognized.')).toBe(false);
  });
  it('suppresses Anope "nick not registered" (straight and curly apostrophes)', () => {
    expect(shouldPopupNickServ("Ce pseudo n'est pas enregistré.")).toBe(false);
    expect(shouldPopupNickServ('Ce pseudo n’est pas enregistré.')).toBe(false);
    expect(shouldPopupNickServ("This nickname isn't registered.")).toBe(false);
  });
  it('suppresses register-URL / REGISTER fragments (LineWrapper splits)', () => {
    expect(shouldPopupNickServ('https://www.reseau-entrenous.fr/register pour l\'enregistrer immédiatement!')).toBe(false);
    expect(shouldPopupNickServ('REGISTER password email')).toBe(false);
    expect(shouldPopupNickServ('/msg NickServ REGISTER motdepasse email')).toBe(false);
  });
  it('shows important notices like nick changes', () => {
    expect(shouldPopupNickServ('GHOST succeeded — your nick has been changed.')).toBe(true);
  });
});

describe('isNickServ', () => {
  it('matches NickServ case-insensitively', () => {
    expect(isNickServ('NickServ')).toBe(true);
    expect(isNickServ('nickserv')).toBe(true);
    expect(isNickServ('ChanServ')).toBe(false);
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
