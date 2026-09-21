import { describe, it, expect } from 'vitest';
import { availableExtbans, matchExtban, extbanValueHint, ensureMatchingExtban, ensureActingExtban, buildExtbanMask, nickMask, EXTBANS, NICK_PICK } from './extbans';

describe('extbans', () => {
  it('parses the ISUPPORT EXTBAN token (<prefix>,<letters>)', () => {
    const names = availableExtbans({ EXTBAN: ',ABCGNOQRSTUabcdgjmnorsuwyz' }).map((e) => e.name);
    expect(names).toContain('mute');
    expect(names).toContain('redirect');
    expect(names).toContain('bot');
    expect(names).toContain('securitygroup'); // custom module (letter g)
    expect(names).toContain('score');         // reputation module (letter y)
  });
  it('offers only advertised letters, in catalogue order', () => {
    expect(availableExtbans({ EXTBAN: ',m' }).map((e) => e.name)).toEqual(['mute']);
    expect(availableExtbans({})).toEqual([]);
    expect(availableExtbans({ EXTBAN: '' })).toEqual([]);
  });
  it('recognises a typed extban mask by name or letter', () => {
    expect(matchExtban('mute:*!*@x')?.name).toBe('mute');
    expect(matchExtban('m:*!*@x')?.name).toBe('mute');
    expect(matchExtban('!score:-5')?.name).toBe('score');
    expect(matchExtban('*!*@host')).toBeNull();
  });
  it('always offers connection class for invex even if EXTBAN omits n', () => {
    const matching = availableExtbans({ EXTBAN: ',RUg' }).filter((e) => !e.acting);
    expect(matching.map((e) => e.name)).toEqual(['account', 'unauthed', 'securitygroup']);
    expect(ensureMatchingExtban(matching, 'class').map((e) => e.name))
      .toEqual(['account', 'unauthed', 'securitygroup', 'class']);
  });
  it('uses a trusted identity hint for invex', () => {
    const acc = matchExtban('account:x')!;
    expect(extbanValueHint(acc, false)).toBe('baduser');
    expect(extbanValueHint(acc, true)).toBe('Jessie');
  });
  it('is IPv6-mask safe (a colon in the host is not a type prefix)', () => {
    expect(matchExtban('*!*@2001:db8::1')).toBeNull();
  });
  it('always offers redirect even if EXTBAN omits d', () => {
    const names = ensureActingExtban(availableExtbans({ EXTBAN: ',mR' }), 'redirect').map((e) => e.name);
    expect(names).toContain('mute');
    expect(names).toContain('redirect');
  });
  it('builds redirect masks with a target channel and optional nested match', () => {
    const redir = matchExtban('redirect:x')!;
    const acc = matchExtban('account:x')!;
    expect(buildExtbanMask({ ext: redir, value: 'Pseudo', target: 'poubelle' }))
      .toBe('redirect:#poubelle:Pseudo!*@*');
    expect(buildExtbanMask({ ext: redir, value: 'LeCompte', nest: acc, target: '#poubelle' }))
      .toBe('redirect:#poubelle:account:LeCompte');
    expect(buildExtbanMask({ ext: redir, value: '*', nest: acc, invert: true, target: '#poubelle' }))
      .toBe('redirect:#poubelle:!account:*');
    expect(buildExtbanMask({ ext: redir, value: '*!*@host.fr', target: '#poubelle' }))
      .toBe('redirect:#poubelle:*!*@host.fr');
    const mute = matchExtban('mute:x')!;
    expect(buildExtbanMask({ ext: mute, value: 'nick' })).toBe('mute:nick!*@*');
    expect(buildExtbanMask({ ext: acc, value: 'LeCompte' })).toBe('account:LeCompte');
  });
});

describe('nickMask', () => {
  const jessie = { nick: 'Jessie417', user: 'jessie', host: 'ipv6-ff12.entrenous.chat' };

  it('derives each mask shape from a member', () => {
    expect(nickMask(jessie, 'host')).toBe('*!*@ipv6-ff12.entrenous.chat');
    expect(nickMask(jessie, 'nick')).toBe('Jessie417!*@*');
    expect(nickMask(jessie, 'ident')).toBe('*!jessie@ipv6-ff12.entrenous.chat');
    expect(nickMask(jessie, 'exact')).toBe('Jessie417!jessie@ipv6-ff12.entrenous.chat');
  });

  it('widens to * rather than producing a mask that matches nobody', () => {
    expect(nickMask({ nick: 'Kevin' }, 'host')).toBe('*!*@*');
    expect(nickMask({ nick: 'Kevin' }, 'exact')).toBe('Kevin!*@*');
    // The nick is always known, so this shape never degrades.
    expect(nickMask({ nick: 'Kevin' }, 'nick')).toBe('Kevin!*@*');
  });

  it('feeds a redirect ban as a plain hostmask, not a nested extban', () => {
    const redir = matchExtban('redirect:x')!;
    expect(buildExtbanMask({ ext: redir, value: nickMask(jessie, 'host'), target: '#Bannis.chat' }))
      .toBe('redirect:#Bannis.chat:*!*@ipv6-ff12.entrenous.chat');
  });

  it('never collides with a catalogue extban name', () => {
    expect(EXTBANS.some((e) => e.name === NICK_PICK)).toBe(false);
  });
});
