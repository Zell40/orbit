import { describe, it, expect } from 'vitest';
import { isGranted, sanitizePermissions, RPC_CAPABILITY, PERMISSIONS } from './protocol';

describe('sandbox capability gate', () => {
  it('allows a capability only when its permission is granted', () => {
    expect(isGranted(['irc'], 'irc.say')).toBe(true);
    expect(isGranted([], 'irc.say')).toBe(false);
    expect(isGranted(['notify'], 'irc.say')).toBe(false);
    expect(isGranted(['storage'], 'storage.set')).toBe(true);
    expect(isGranted([], 'storage.set')).toBe(false);
  });

  it('allows null-permission (contained) methods with no grant', () => {
    expect(isGranted([], 'ui.claim')).toBe(true);
    expect(isGranted([], 'ui.resize')).toBe(true);
    expect(isGranted([], 'log')).toBe(true);
  });

  it('refuses unknown methods by default (fail closed)', () => {
    expect(isGranted(['irc', 'notify', 'storage'], 'window.eval')).toBe(false);
    expect(isGranted(['irc'], 'irc.__proto__')).toBe(false);
    expect(isGranted(['irc'], '')).toBe(false);
  });

  it('every declared RPC maps to a known permission or null', () => {
    for (const need of Object.values(RPC_CAPABILITY)) {
      expect(need === null || (PERMISSIONS as readonly string[]).includes(need)).toBe(true);
    }
  });

  it('sanitizes operator-supplied permissions to the known set', () => {
    expect(sanitizePermissions(['irc', 'storage', 'root', 42, null])).toEqual(['irc', 'storage']);
    expect(sanitizePermissions('irc')).toEqual([]);
    expect(sanitizePermissions(undefined)).toEqual([]);
  });

  it('treats "none" as an explicit zero-permissions declaration that wins', () => {
    expect(sanitizePermissions(['none'])).toEqual([]);
    expect(sanitizePermissions(['none', 'irc', 'storage'])).toEqual([]); // fail-closed: none wins
    expect(isGranted(sanitizePermissions(['none']), 'irc.say')).toBe(false);
    expect(isGranted(sanitizePermissions(['none']), 'ui.claim')).toBe(true); // contained, still fine
  });
});
