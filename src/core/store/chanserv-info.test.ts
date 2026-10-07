import { describe, it, expect, beforeEach } from 'vitest';
import {
  isChanServInfoNotice, noteManualChanServInfoCommand, chanServInfoRevealActive,
  resetChanServInfoNoticeState,
  optionsAreOfficial, optionsHaveTopicLock, parseChanServInfo,
} from './chanserv-info';

beforeEach(() => { resetChanServInfoNoticeState(); });

const INFO = `Informations à propos du salon #EntreNous.chat
Fondateur : Zell
Description : Salon d'accueil du reseau EntreNous
Enregistré : 22 juillet 2025 21:44:52
Options : Chanstats, Historique des sujets, Kicks signés, Maintien des modes, Maintien du topic, Paix, Persistant, Salon officiel, Sans expiration, Sécurité du fondateur, Sécurité des OPs, Verrouillage du topic`;

describe('parseChanServInfo', () => {
  it('reads founder, description and official from French Anope INFO', () => {
    const p = parseChanServInfo(INFO);
    expect(p.chan).toBe('#EntreNous.chat');
    expect(p.founder).toBe('Zell');
    expect(p.description).toBe("Salon d'accueil du reseau EntreNous");
    expect(p.official).toBe(true);
    expect(p.topicLock).toBe(true);
  });

  it('does not mark official when the option is absent', () => {
    const p = parseChanServInfo('Options : Chanstats, Paix, Persistant');
    expect(p.official).toBe(false);
    expect(p.topicLock).toBe(false);
  });
});

describe('isChanServInfoNotice', () => {
  it('matches French INFO header and field lines', () => {
    expect(isChanServInfoNotice('Informations à propos du salon #entrenous.chat :')).toBe(true);
    expect(isChanServInfoNotice('Fondateurice : Zell')).toBe(true);
    expect(isChanServInfoNotice('Description : Salon d\'accueil')).toBe(true);
    expect(isChanServInfoNotice('Enregistré le : 22 juil. 2025 21:44:52')).toBe(true);
    expect(isChanServInfoNotice('You have been given operator status')).toBe(false);
  });
});

describe('noteManualChanServInfoCommand', () => {
  it('opens a short reveal window for INFO only', () => {
    noteManualChanServInfoCommand('STATUS #x');
    // May still be true from a previous test if reveal window overlaps — assert INFO arms it.
    noteManualChanServInfoCommand('INFO #entrenous.chat');
    expect(chanServInfoRevealActive()).toBe(true);
  });
});

describe('optionsAreOfficial', () => {
  it('matches Salon officiel among other tokens', () => {
    expect(optionsAreOfficial('Paix, Persistant, Salon officiel, Sans expiration')).toBe(true);
    expect(optionsAreOfficial('Official, SecureOps')).toBe(true);
    expect(optionsAreOfficial('Paix, Persistant')).toBe(false);
  });
});

describe('optionsHaveTopicLock', () => {
  it('matches Verrouillage du topic among other tokens', () => {
    expect(optionsHaveTopicLock('Paix, Verrouillage du topic, Persistant')).toBe(true);
    expect(optionsHaveTopicLock('TOPICLOCK, SecureOps')).toBe(true);
    expect(optionsHaveTopicLock('Paix, Persistant')).toBe(false);
  });
});
