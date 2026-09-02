import { describe, it, expect } from 'vitest';
import { buildModeContext, parseModeChanges, applyUserModes } from './modes';

// CHANMODES "A,B,C,D": A=list (always param), B=param (always), C=setparam
// (param on set only), D=flag (never). Plus prefix modes o→@, v→+.
const ctx = buildModeContext({ CHANMODES: 'beI,k,l,imnpst' }, { o: '@', v: '+' });

describe('parseModeChanges', () => {
  it('consumes params correctly across prefix, list and flag modes', () => {
    const changes = parseModeChanges('+o-v+b', ['alice', 'bob', '*!*@x'], ctx);
    expect(changes).toEqual([
      { add: true, mode: 'o', param: 'alice', kind: 'prefix', prefix: '@' },
      { add: false, mode: 'v', param: 'bob', kind: 'prefix', prefix: '+' },
      { add: true, mode: 'b', param: '*!*@x', kind: 'list', prefix: undefined },
    ]);
  });

  it('type C (+l) takes a param on set, none on unset', () => {
    expect(parseModeChanges('+l', ['50'], ctx)[0]).toMatchObject({ mode: 'l', param: '50' });
    expect(parseModeChanges('-l', [], ctx)[0]).toMatchObject({ mode: 'l', param: undefined });
  });

  it('type D flags never take a param', () => {
    const changes = parseModeChanges('+imn', [], ctx);
    expect(changes.map((c) => c.mode)).toEqual(['i', 'm', 'n']);
    expect(changes.every((c) => c.param === undefined && c.kind === 'flag')).toBe(true);
  });

  it('treats b as a list mode even with empty type-A CHANMODES', () => {
    const empty = buildModeContext({ CHANMODES: ',k,l,imnpst' }, { o: '@' });
    const changes = parseModeChanges('+b', ['*!*@x'], empty);
    expect(changes[0]).toMatchObject({ mode: 'b', param: '*!*@x', kind: 'list' });
  });
});

describe('applyUserModes', () => {
  it('applies +/- changes and returns a sorted set', () => {
    expect(applyUserModes('', '+iw')).toBe('iw');
    expect(applyUserModes('iw', '-w+x')).toBe('ix');
    expect(applyUserModes('+abc', '-b')).toBe('ac');
  });
});
