import { describe, it, expect } from 'vitest';
import { Numerics } from './numerics';

describe('Numerics (client.numerics)', () => {
  const n = new Numerics();

  it('maps codes to their RPL/ERR names', () => {
    expect(n.name('001')).toBe('RPL_WELCOME');
    expect(n.name('322')).toBe('RPL_LIST');
    expect(n.name('433')).toBe('ERR_NICKNAMEINUSE');
  });

  it('returns undefined for an unknown code', () => {
    expect(n.name('999')).toBeUndefined();
  });

  it('classifies user-facing error replies', () => {
    expect(n.isError('433')).toBe(true);  // ERR_NICKNAMEINUSE
    expect(n.isError('474')).toBe(true);  // ERR_BANNEDFROMCHAN
    expect(n.isError('322')).toBe(false); // RPL_LIST — informational
    expect(n.isError('001')).toBe(false); // RPL_WELCOME
    expect(n.isError('999')).toBe(false); // unknown
  });

  it('reports whether a numeric is known', () => {
    expect(n.isKnown('372')).toBe(true);
    expect(n.isKnown('999')).toBe(false);
  });
});
