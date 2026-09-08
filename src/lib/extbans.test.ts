import { describe, it, expect } from 'vitest';
import { availableExtbans, matchExtban, extbanValueHint } from './extbans';

describe('extbans', () => {
  it('parses the ISUPPORT EXTBAN token (<prefix>,<letters>)', () => {
    const names = availableExtbans({ EXTBAN: ',ABCGNOQRSTUabcdgjmnorsuwyz' }).map((e) => e.name);
    expect(names).toContain('mute');
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
  it('uses a trusted example value for invex, a blocked one for bans', () => {
    const acc = matchExtban('account:x')!;
    expect(extbanValueHint(acc, false)).toBe('baduser');
    expect(extbanValueHint(acc, true)).toBe('Jessie');
  });
  it('is IPv6-mask safe (a colon in the host is not a type prefix)', () => {
    expect(matchExtban('*!*@2001:db8::1')).toBeNull();
  });
});
