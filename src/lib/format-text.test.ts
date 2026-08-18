import { describe, it, expect } from 'vitest';
import { loosenNoticeText, splitActuItems, unwrapActuUrls, actuItemHeadline } from './format-text';

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
