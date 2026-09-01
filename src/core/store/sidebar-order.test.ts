import { describe, it, expect } from 'vitest';
import { arrangeNames, moveName, nameCmp, sidebarNavOrder } from './sidebar-order';

describe('nameCmp', () => {
  it('sorts channels A–Z ignoring the hash', () => {
    const names = ['#EntreNous.chat', '#Aide.chat', '#Baccalaureat.chat'];
    expect([...names].sort(nameCmp)).toEqual(['#Aide.chat', '#Baccalaureat.chat', '#EntreNous.chat']);
  });
});

describe('arrangeNames', () => {
  it('is A–Z when nothing has been dragged', () => {
    expect(arrangeNames(['#zeta', '#alpha', '#mu'], [])).toEqual(['#alpha', '#mu', '#zeta']);
  });

  it('keeps a saved order and appends new names A–Z', () => {
    expect(arrangeNames(['#c', '#a', '#b', '#d'], ['#b', '#a'])).toEqual(['#b', '#a', '#c', '#d']);
  });

  it('drops saved keys that are no longer open', () => {
    expect(arrangeNames(['#a', '#c'], ['#gone', '#c', '#a'])).toEqual(['#c', '#a']);
  });
});

describe('moveName', () => {
  it('moves an item down onto the drop target', () => {
    expect(moveName(['a', 'b', 'c', 'd'], 'a', 'd')).toEqual(['b', 'c', 'd', 'a']);
  });

  it('moves an item up onto the drop target', () => {
    expect(moveName(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'a', 'b', 'c']);
  });

  it('no-ops when from and to are the same', () => {
    expect(moveName(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
  });
});

describe('sidebarNavOrder', () => {
  it('lists channels A–Z, then PMs A–Z, then notices and Status', () => {
    expect(sidebarNavOrder(
      ['$server', '#zeta', 'bob', '#alpha', '$notices', 'alice'],
      { channels: [], queries: [] },
    )).toEqual(['#alpha', '#zeta', 'alice', 'bob', '$notices', '$server']);
  });
});
