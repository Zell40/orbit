import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearActiveOwner,
  foldIdent,
  getActiveOwner,
  idKey,
  idLsRead,
  idLsWrite,
  onOwnerChange,
  resolveOwner,
  setActiveOwner,
} from './identity-storage';

describe('identity-storage', () => {
  beforeEach(() => {
    clearActiveOwner();
    localStorage.clear();
  });

  it('prefers account over nick', () => {
    expect(resolveOwner('Zell', 'Zell[bnc]')).toBe('zell');
    expect(resolveOwner('', 'Nael')).toBe('nael');
    expect(resolveOwner()).toBe('');
  });

  it('scopes keys by active owner', () => {
    setActiveOwner('Zell');
    expect(getActiveOwner()).toBe('zell');
    expect(idKey('orbit-prefs')).toBe('orbit-prefs@zell');
    idLsWrite('orbit-prefs', '{"sound":false}');
    expect(idLsRead('orbit-prefs')).toBe('{"sound":false}');

    setActiveOwner('Nael');
    expect(idLsRead('orbit-prefs')).toBeNull();
    idLsWrite('orbit-prefs', '{"sound":true}');
    expect(idLsRead('orbit-prefs')).toBe('{"sound":true}');

    setActiveOwner('Zell');
    expect(idLsRead('orbit-prefs')).toBe('{"sound":false}');
  });

  it('does not leak unscoped writes across owners', () => {
    clearActiveOwner();
    idLsWrite('orbit-friends', '["Actu"]');
    setActiveOwner('Nael');
    expect(idLsRead('orbit-friends')).toBeNull();
    expect(foldIdent('Zell')).toBe('zell');
  });

  it('notifies listeners only when the owner actually changes', () => {
    const seen: string[] = [];
    const off = onOwnerChange((prev, next) => seen.push(`${prev}->${next}`));
    setActiveOwner('Zell');
    setActiveOwner('Zell'); // no-op (same fold)
    setActiveOwner('Nael', 'Nael[away]');
    off();
    expect(seen).toEqual(['->zell', 'zell->nael']);
  });
});
