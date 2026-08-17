import { describe, it, expect } from 'vitest';
import { loosenNoticeText } from './format-text';

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
