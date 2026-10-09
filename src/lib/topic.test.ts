import { describe, expect, it } from 'vitest';
import { setterMask } from './topic';
import type { Member } from '../core/irc/types';

describe('setterMask', () => {
  it('keeps a full mask from the server', () => {
    expect(setterMask('Zell!u@h.example', {})).toBe('Zell!u@h.example');
  });

  it('expands a bare nick from the nicklist', () => {
    const members: Record<string, Member> = {
      Zell: { nick: 'Zell', user: 'zell', host: 'user.entrenous.chat', prefix: '' },
    };
    expect(setterMask('Zell', members)).toBe('Zell!zell@user.entrenous.chat');
  });

  it('matches nick case-insensitively', () => {
    const members: Record<string, Member> = {
      zell: { nick: 'zell', user: 'u', host: 'h', prefix: '' },
    };
    expect(setterMask('Zell', members)).toBe('Zell!u@h');
  });

  it('returns the bare nick when user@host is unknown', () => {
    expect(setterMask('Zell[orbit]', { 'Zell[orbit]': { nick: 'Zell[orbit]', prefix: '' } })).toBe('Zell[orbit]');
  });
});
