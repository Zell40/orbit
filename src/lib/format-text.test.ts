import { describe, it, expect } from 'vitest';
import { loosenNoticeText, splitNoticeLines, splitActuItems, unwrapActuUrls, actuItemHeadline, groupModeDisplay, formatModeChange } from './format-text';

describe('loosenNoticeText', () => {
  it('splits | INFO | blocks onto separate paragraphs', () => {
    expect(loosenNoticeText(
      '| INFO | Consulter les règles : https://ex.fr/r | INFO | Découvrir nos salons : https://ex.fr/s',
    )).toBe(
      'INFO · Consulter les règles : https://ex.fr/r\n\nINFO · Découvrir nos salons : https://ex.fr/s',
    );
  });

  it('breaks after sentence punctuation before a new clause', () => {
    expect(loosenNoticeText(
      "Le pseudo n'est pas enregistré. Rendez-vous sur https://ex.fr/register pour l'enregistrer !",
    )).toBe(
      "Le pseudo n'est pas enregistré.\n\nRendez-vous sur https://ex.fr/register pour l'enregistrer !",
    );
  });

  it('splits custom pipe section markers onto separate lines', () => {
    expect(loosenNoticeText(
      '| Aide au jeu | - Bonjour | Aide au jeu | - Tape !play',
    )).toBe(
      'Aide au jeu · Bonjour\n\nAide au jeu · Tape !play',
    );
  });

  it('puts each bullet list item on its own line', () => {
    expect(loosenNoticeText(
      'Modes disponibles : • Facile → 3 catégories. • Moyen → 5 catégories.',
    )).toBe(
      'Modes disponibles :\n• Facile → 3 catégories.\n• Moyen → 5 catégories.',
    );
  });
});

describe('splitNoticeLines', () => {
  it('returns one entry per bullet after coalescing', () => {
    expect(splitNoticeLines(
      'Modes disponibles : • Facile 🔒 → 3 catégories, 30 secondes. • Moyen 🔒 → 5 catégories, 40 secondes.',
    )).toEqual([
      'Modes disponibles :',
      '• Facile 🔒 → 3 catégories, 30 secondes.',
      '• Moyen 🔒 → 5 catégories, 40 secondes.',
    ]);
  });
});

describe('splitActuItems', () => {
  it('splits concatenated [ACTU] blocks', () => {
    expect(splitActuItems(
      '[ACTU de horoscope] : Un - <https://a.fr/1> [ACTU de horoscope] : Deux - <https://a.fr/2>',
    )).toEqual([
      '[ACTU de horoscope] : Un - <https://a.fr/1>',
      '[ACTU de horoscope] : Deux - <https://a.fr/2>',
    ]);
  });
});

describe('unwrapActuUrls', () => {
  it('drops leftover angle brackets around URLs', () => {
    expect(unwrapActuUrls('[ACTU de horoscope] : Lisez l’horoscope - <https://www.mon-horoscope-du-jour.com/x>'))
      .toBe('[ACTU de horoscope] : Lisez l’horoscope - https://www.mon-horoscope-du-jour.com/x');
  });
});

describe('actuItemHeadline', () => {
  it('drops trailing URLs after unwrapping', () => {
    expect(actuItemHeadline('[ACTU de horoscope] : Lisez l’horoscope - <https://www.mon-horoscope-du-jour.com/x>'))
      .toBe('[ACTU de horoscope] : Lisez l’horoscope');
  });
});

describe('groupModeDisplay', () => {
  it('merges prefix modes on the same nick with readable labels', () => {
    expect(groupModeDisplay('+oq', ['Zell356', 'Zell356'])).toEqual([{
      add: true,
      labels: ['Opérateur', 'Fondateur'],
      letters: ['o', 'q'],
      target: 'Zell356',
    }]);
  });

  it('keeps separate groups when targets differ', () => {
    expect(groupModeDisplay('+ov', ['bob', 'alice'])).toEqual([
      { add: true, labels: ['Opérateur'], letters: ['o'], target: 'bob' },
      { add: true, labels: ['Voice'], letters: ['v'], target: 'alice' },
    ]);
  });

  it('formats a promotion as a natural sentence', () => {
    expect(formatModeChange({ add: true, labels: ['Opérateur', 'Fondateur'], letters: ['o', 'q'], target: 'Zell356' }))
      .toBe('a promu Zell356 Opérateur et Fondateur');
    expect(formatModeChange({ add: true, labels: ['Voice'], letters: ['v'], target: 'bob' }))
      .toBe('a promu bob Voice');
  });
});
