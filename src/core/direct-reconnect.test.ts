import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { peekDirectReconnect, saveDirectReconnect, clearDirectReconnect, siteLoginHref } from './direct-reconnect';
import { matchingVisualGames, type VisualDisplayGame } from '../modules/registry';

describe('direct reconnect (leave bouncer)', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    const stub = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    };
    (globalThis as unknown as { sessionStorage: typeof stub }).sessionStorage = stub;
  });
  afterEach(() => {
    delete (globalThis as unknown as { sessionStorage?: unknown }).sessionStorage;
  });

  it('remembers nick and channels for the join form', () => {
    saveDirectReconnect('Harry', ['#Baccalaureat.chat', '  #Echecs.chat  ']);
    expect(peekDirectReconnect()).toEqual({
      nick: 'Harry',
      channels: ['#Baccalaureat.chat', '#Echecs.chat'],
    });
    clearDirectReconnect();
    expect(peekDirectReconnect()).toBeNull();
  });

  it('points the reconnect button at the site login page, without the bouncer', () => {
    expect(siteLoginHref('https://www.reseau-entrenous.fr/mon-entrenous/identite/', {
      nick: 'Harry',
      channels: ['#Baccalaureat.chat', '#Echecs.chat'],
    })).toBe('https://www.reseau-entrenous.fr/mon-entrenous/identite/?direct=1&channel=%23Baccalaureat.chat%2C%23Echecs.chat&nick=Harry');
  });
});

describe('matchingVisualGames', () => {
  const games: VisualDisplayGame[] = [
    { id: '1', plugin: 'orbit-petitbac', label: 'Petit Bac', inChannel: (c) => /baccalaureat/i.test(c) },
    { id: '2', plugin: 'orbit-echecs', label: 'Échecs', inChannel: (c) => /echecs/i.test(c) },
  ];
  it('returns the game registered for that salon', () => {
    expect(matchingVisualGames(games, '#Baccalaureat.chat').map((g) => g.label)).toEqual(['Petit Bac']);
    expect(matchingVisualGames(games, '#Aide.chat')).toEqual([]);
  });
});
