import { describe, expect, it } from 'vitest';
import { connectingPlace, isProfileInfoLine, localCountryName, parseWhoisChannels, profileAccountFromLine, profileUrl, reputationTier } from './whois-card';

describe('profile card helpers', () => {
  it('builds the public profile from the NickServ account', () => {
    expect(profileUrl('Harry')).toBe('https://www.reseau-entrenous.fr/profil/Harry');
    expect(isProfileInfoLine('Profil: https://www.reseau-entrenous.fr/profil/Harry')).toBe(true);
    expect(profileAccountFromLine('Profil: https://www.reseau-entrenous.fr/profil/Harry')).toBe('Harry');
    expect(isProfileInfoLine('is connecting from France')).toBe(false);
  });

  it('recognises a missing country separately from a named one', () => {
    expect(connectingPlace('is connecting from an unknown country')).toBe('unknown');
    expect(connectingPlace('is connecting from France')).toBe('France');
    expect(connectingPlace('score: 10000')).toBeNull();
    expect(localCountryName('France')).toBe('France');
    expect(localCountryName('Germany')).toBe('Allemagne');
  });

  it('maps the services score onto a reputation label', () => {
    expect(reputationTier(10000)).toBe('excellent');
    expect(reputationTier(8000)).toBe('excellent');
    expect(reputationTier(5000)).toBe('great');
    expect(reputationTier(2500)).toBe('good');
    expect(reputationTier(500)).toBe('fair');
    expect(reputationTier(10)).toBe('low');
    expect(reputationTier(-1)).toBe('bad');
  });

  it('turns WHOIS channel tokens into coloured tags', () => {
    expect(parseWhoisChannels('~@#Baccalaureat.chat +#Echecs.chat #Aide.chat')).toEqual([
      { name: '#Baccalaureat.chat', mark: '~', cls: 'owner' },
      { name: '#Echecs.chat', mark: '+', cls: 'voice' },
      { name: '#Aide.chat', mark: '', cls: 'member' },
    ]);
  });
});
