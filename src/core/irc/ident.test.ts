import { describe, expect, it } from 'vitest';
import { foldIrcIdent, resolveConnectUsername } from './ident';

describe('foldIrcIdent', () => {
  it('folds accents and strips illegal characters', () => {
    expect(foldIrcIdent('Invité', 'Invite')).toBe('Invite');
    expect(foldIrcIdent('Jean-Luc!', 'x')).toBe('Jean-Luc');
  });
  it('caps at 10 characters and falls back when empty', () => {
    expect(foldIrcIdent('abcdefghijklmnop', 'x')).toBe('abcdefghij');
    expect(foldIrcIdent('!!!', 'Invite')).toBe('Invite');
  });
});

describe('resolveConnectUsername', () => {
  const guestCfg = { guestIdent: 'ENuser' };

  it('keeps an explicit username', () => {
    expect(resolveConnectUsername({ nick: 'Ada', username: 'fixed' }, guestCfg)).toBe('fixed');
  });

  it('uses guestIdent for guests (original join form)', () => {
    expect(resolveConnectUsername({ nick: 'Ada' }, guestCfg)).toBe('ENuser');
  });

  it('uses the nick when guestIdentFromNick is set', () => {
    expect(resolveConnectUsername({ nick: 'Ada' }, { ...guestCfg, guestIdentFromNick: true })).toBe('Ada');
  });

  it('uses the nick for authenticated members even without the flag', () => {
    expect(resolveConnectUsername({ nick: 'Ada', password: 'x' }, guestCfg)).toBe('Ada');
    expect(resolveConnectUsername({ nick: 'Ada', passkey: true }, guestCfg)).toBe('Ada');
    expect(resolveConnectUsername({ nick: 'Ada', serverPassword: 'znc' }, guestCfg)).toBe('Ada');
  });

  it('falls back to guestIdent when the nick cannot be folded', () => {
    expect(resolveConnectUsername({ nick: '!!!' }, { ...guestCfg, guestIdentFromNick: true })).toBe('ENuser');
  });
});
